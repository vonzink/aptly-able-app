import ExpoModulesCore
import PlaudBleSDK
import PlaudDeviceBasicSDK

/// Main-queue owner of one Wi-Fi session and one exporter. Never replaces the BLE delegate.
final class PlaudWifiTransfer: NSObject, PlaudWiFiAgentProtocol, AudioExportCallback {
  // Native build configuration is authoritative, including for JavaScript updates.
  static var enabled: Bool {
    Bundle.main.object(forInfoDictionaryKey: "AptlyPlaudWifiTransferEnabled") as? Bool == true
  }
  private let emit: (String, [String: Any?]) -> Void
  private var opening: Promise?
  private var exporting: Promise?
  private var sessionId = 0
  private var scenes: [Int: Int] = [:]
  private var timeout: DispatchWorkItem?
  private var epoch = 0
  private var joining = false
  private(set) var active = false
  var busy: Bool { active || opening != nil || exporting != nil }

  init(emit: @escaping (String, [String: Any?]) -> Void) {
    self.emit = emit
    super.init()
  }

  func start(_ promise: Promise) {
    guard Self.enabled else {
      promise.reject("ERR_PLAUD_WIFI_DISABLED", "Wi-Fi transfer is unavailable in this build. Use Bluetooth.")
      return
    }
    guard !busy, PlaudDeviceAgent.shared.isConnected() else {
      promise.reject("ERR_PLAUD_WIFI_BUSY", "Connect the recorder and finish any previous transfer first.")
      return
    }
    epoch += 1
    let own = epoch
    opening = promise
    active = true
    joining = false
    scenes = [:]
    let wifi = PlaudWiFiAgent.shared
    wifi.delegate = self
    wifi.bleDevice = PlaudDeviceAgent.shared.recentConnectDevice
    let deadline = DispatchWorkItem { [weak self] in
      guard let self = self, own == self.epoch else { return }
      self.close("Wi-Fi connection timed out. Use Bluetooth or try again near the recorder.")
    }
    timeout = deadline
    DispatchQueue.main.asyncAfter(deadline: .now() + 90, execute: deadline)
    PlaudDeviceAgent.shared.setDeviceWiFi(open: true)
  }

  func hotspot(status: Int, ssid: String, password: String) {
    guard opening != nil, !joining else { return }
    guard status == 0, !ssid.isEmpty else {
      close("The recorder could not open Wi-Fi transfer. Use Bluetooth or try again.")
      return
    }
    joining = true
    let own = epoch
    // The device needs time to bring up its hotspot. Credentials stay inside native code.
    DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
      guard let self = self, self.epoch == own, self.opening != nil else { return }
      PlaudWiFiAgent.shared.connectWifi(ssid, password, 60)
    }
  }

  func export(_ id: Int, promise: Promise) {
    guard Self.enabled else {
      promise.reject("ERR_PLAUD_WIFI_DISABLED", "Wi-Fi transfer is unavailable in this build. Use Bluetooth.")
      return
    }
    guard active, opening == nil, exporting == nil, scenes[id] != nil,
          PlaudWiFiAgent.shared.isConnected else {
      promise.reject("ERR_PLAUD_WIFI_NOT_READY", "The Wi-Fi recording session is not ready.")
      return
    }
    let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("PlaudExports", isDirectory: true)
    do {
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    } catch {
      promise.reject("ERR_PLAUD_EXPORT", "The recording export folder could not be created.")
      return
    }
    sessionId = id
    exporting = promise
    PlaudWiFiAgent.shared.exportAudioViaWiFi(
      sessionId: id, outputDir: directory.path, format: .mp3, channels: 1, callback: self
    )
  }

  func close(_ message: String = "Wi-Fi transfer stopped.") {
    guard active || opening != nil else { return }
    epoch += 1
    active = false
    joining = false
    timeout?.cancel()
    timeout = nil
    let pending = opening
    opening = nil
    pending?.reject("ERR_PLAUD_WIFI", message)
    if exporting != nil {
      PlaudWiFiAgent.shared.stopSyncFile(sessionId, scenes[sessionId] ?? 1)
    }
    PlaudDeviceAgent.shared.setDeviceWiFi(open: false)
    PlaudDeviceAgent.shared.endWiFiTransfer()
    PlaudWiFiAgent.shared.disconnect()
    // Retain exporter ownership until its terminal callback, even after cancellation.
    // Starting another native export early can mix SDK audio buffers.
  }

  func wifiHandshake(_ status: Int) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self, self.opening != nil, self.joining else { return }
      guard status == 0 else { self.close("The recorder Wi-Fi handshake failed."); return }
      PlaudWiFiAgent.shared.getFileList(Int(Date().timeIntervalSince1970), 0, false)
    }
  }

  func wifiFileList(_ files: [BleFile]) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self, let promise = self.opening else { return }
      self.scenes = files.reduce(into: [:]) { result, file in result[file.sessionId] = file.scenes }
      self.timeout?.cancel()
      self.timeout = nil
      self.opening = nil
      promise.resolve(nil)
    }
  }

  func wifiFileListFail(_ status: Int) {
    DispatchQueue.main.async { [weak self] in self?.close("The Wi-Fi recording list could not be read.") }
  }
  func wifiClientFail() {
    DispatchQueue.main.async { [weak self] in self?.close("The phone could not connect to recorder Wi-Fi.") }
  }
  func wifiClose(_ status: Int) {
    DispatchQueue.main.async { [weak self] in self?.close("The recorder Wi-Fi connection closed.") }
  }
  func wifiCommonErr(_ cmd: Int, _ status: Int) {
    DispatchQueue.main.async { [weak self] in self?.close("The recorder reported a Wi-Fi error.") }
  }

  func onProgress(_ progress: Int, message: String) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self, self.exporting != nil, self.active else { return }
      self.emit("exportProgress", ["sessionId": self.sessionId, "progress": progress, "message": "Receiving over Wi-Fi"])
    }
  }
  func onComplete(outputPath: String) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self, let promise = self.exporting else { return }
      self.exporting = nil
      promise.resolve(["sessionId": self.sessionId, "outputPath": outputPath])
    }
  }
  func onError(_ error: String) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self, let promise = self.exporting else { return }
      self.exporting = nil
      promise.reject("ERR_PLAUD_WIFI_EXPORT", "Wi-Fi audio transfer failed. Use Bluetooth or reconnect and try again.")
    }
  }
}
