import ExpoModulesCore
import PlaudDeviceBasicSDK
import PlaudBleSDK

// MARK: - Typed argument records

struct InitOptions: Record {
  @Field var userAccessToken: String = ""
  @Field var customDomain: String = ""
  @Field var userId: String?
}

struct ConnectOptions: Record {
  @Field var uuid: String?
  @Field var serialNumber: String?
  @Field var deviceToken: String?
}

struct DepairOptions: Record {
  @Field var clear: Bool = true
}

struct FileListOptions: Record {
  @Field var startSessionId: Int = 0
}

struct ExportOptions: Record {
  @Field var sessionId: Int = -1
  @Field var format: String = "mp3"
  @Field var channels: Int = 1
}

struct RecorderControlOptions: Record {
  @Field var command: String = ""
  @Field var sessionId: Int?
}

/// Expo module bridging Plaud's native iOS SDK. This is the RN counterpart of the
/// Capacitor `PlaudSdk` plugin (PlaudSdkPlugin.swift). Expo's `Module` base class isn't
/// `NSObject`-derived, so it can't itself conform to the `@objc PlaudDeviceAgentProtocol`;
/// all SDK interaction and delegate handling lives in `PlaudSdkController` (an NSObject),
/// which emits results back to JS through the closure the module hands it.
///
/// Surface (mirrors the Capacitor plugin, minus the `readFile`/`putBinary` CORS shims that
/// only existed because Capacitor loaded a remote-origin WebView — RN has no such
/// constraint and reads exports with expo-file-system / uploads with fetch):
/// connection lifecycle, file listing, and on-device audio export.
public class PlaudSdkModule: Module {
  private lazy var controller = PlaudSdkController { [weak self] event, body in
    // Hop to the main queue before crossing into JS, as the Capacitor plugin's `notify` did —
    // SDK delegate callbacks can arrive on arbitrary threads.
    DispatchQueue.main.async { self?.sendEvent(event, body) }
  }

  public func definition() -> ModuleDefinition {
    Name("PlaudSdk")
    Constant("wifiTransferEnabled") { PlaudWifiTransfer.enabled }

    Events(
      "scanResult", "scanTimeout", "connectState", "penState", "bind", "fileList",
      "exportProgress", "recordStart", "recordStop", "recordPause", "recordResume", "depair",
      "batteryState", "storageState"
    )

    AsyncFunction("initSDK") { (options: InitOptions, promise: Promise) in
      self.controller.initSDK(options, promise: promise)
    }

    AsyncFunction("startScan") { (promise: Promise) in
      self.controller.startScan(promise: promise)
    }

    AsyncFunction("stopScan") { (promise: Promise) in
      self.controller.stopScan(promise: promise)
    }

    AsyncFunction("connectBleDevice") { (options: ConnectOptions, promise: Promise) in
      self.controller.connectBleDevice(options, promise: promise)
    }

    AsyncFunction("disconnect") { (promise: Promise) in
      self.controller.disconnect(promise: promise)
    }

    AsyncFunction("depair") { (options: DepairOptions?, promise: Promise) in
      self.controller.depair(options ?? DepairOptions(), promise: promise)
    }

    AsyncFunction("isConnected") { (promise: Promise) in
      self.controller.isConnected(promise: promise)
    }

    AsyncFunction("getDeviceStatus") { (promise: Promise) in
      self.controller.getDeviceStatus(promise: promise)
    }

    AsyncFunction("getState") { (promise: Promise) in
      self.controller.getState(promise: promise)
    }

    AsyncFunction("getFileList") { (options: FileListOptions?, promise: Promise) in
      self.controller.getFileList(options ?? FileListOptions(), promise: promise)
    }

    AsyncFunction("exportAudio") { (options: ExportOptions, promise: Promise) in
      self.controller.exportAudio(options, promise: promise)
    }
    AsyncFunction("startWifiTransfer") { (promise: Promise) in self.controller.startWifi(promise) }
    AsyncFunction("stopWifiTransfer") { (promise: Promise) in self.controller.stopWifi(promise) }
    AsyncFunction("exportAudioViaWifi") { (options: ExportOptions, promise: Promise) in
      self.controller.exportWifi(options, promise: promise)
    }
    AsyncFunction("controlRecorder") { (options: RecorderControlOptions, promise: Promise) in
      self.controller.controlRecorder(options, promise: promise)
    }
    OnDestroy { self.controller.shutdown() }
  }
}

/// Owns every interaction with `PlaudDeviceAgent`, holds the scan cache / in-flight export
/// bridges, and is the SDK's `PlaudDeviceAgentProtocol` delegate. Delegate callbacks are
/// forwarded to JS via `emit`, the closure supplied by the module (which calls `sendEvent`).
private final class PlaudSdkController: NSObject, PlaudDeviceAgentProtocol {
  private let emit: (String, [String: Any?]) -> Void

  /// `connectBleDevice` needs the actual `BleDevice` the SDK handed us during a scan — JS
  /// only carries identifiers, so we retain scanned objects and look them up. Keyed by
  /// `uuid` (the CoreBluetooth peripheral id). Touched only on the main queue.
  private var scannedDevices: [String: BleDevice] = [:]

  /// Retains in-flight export bridges so neither they nor their `Promise` are deallocated
  /// before the SDK finishes. Touched only on the main queue.
  private var exportCallbacks: Set<ExportCallbackBridge> = []

  /// App-level user identifier from `initSDK`, reused as the default connect `deviceToken`
  /// (it's what binds the device to the user during the handshake).
  private var userId: String?

  private var scanReadyAttempts = 0
  private var isScanning = false
  private var scanEpoch = 0
  private lazy var wifi = PlaudWifiTransfer(emit: emit)

  init(emit: @escaping (String, [String: Any?]) -> Void) {
    self.emit = emit
    super.init()
  }

  // MARK: - Connection lifecycle

  func initSDK(_ options: InitOptions, promise: Promise) {
    guard !options.userAccessToken.isEmpty else {
      promise.reject("ERR_PLAUD_ARGS", "userAccessToken is required")
      return
    }
    guard !options.customDomain.isEmpty else {
      promise.reject("ERR_PLAUD_ARGS", "customDomain is required (domain only, no https://)")
      return
    }
    let userId = options.userId
    DispatchQueue.main.async {
      self.scanEpoch += 1
      self.isScanning = false
      self.wifi.close()
      self.userId = userId
      let agent = PlaudDeviceAgent.shared
      agent.delegate = self
      agent.initSDK(userAccessToken: options.userAccessToken, customDomain: options.customDomain)
      promise.resolve(nil)
    }
  }

  func startScan(promise: Promise) {
    DispatchQueue.main.async {
      // CoreBluetooth silently drops scanForPeripherals until the central manager reaches
      // .poweredOn (async after initSDK, gated on the first-launch permission prompt), so
      // gate the real scan on the power-on state — same as the Capacitor plugin.
      self.isScanning = true
      self.scanEpoch += 1
      self.scanReadyAttempts = 0
      self.attemptScanWhenReady(epoch: self.scanEpoch)
      promise.resolve(nil)
    }
  }

  /// Fires the SDK scan once Bluetooth is powered on, polling ~18s. Main queue only.
  private func attemptScanWhenReady(epoch: Int) {
    guard isScanning, epoch == scanEpoch else { return }
    if BleAgent.shared.isPoweredOn {
      PlaudDeviceAgent.shared.startScan()
      return
    }
    scanReadyAttempts += 1
    if scanReadyAttempts > 60 {
      isScanning = false
      emit("scanTimeout", ["reason": "bluetoothNotPoweredOn"])
      return
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
      self?.attemptScanWhenReady(epoch: epoch)
    }
  }

  func stopScan(promise: Promise) {
    DispatchQueue.main.async {
      self.scanEpoch += 1
      self.isScanning = false
      PlaudDeviceAgent.shared.stopScan()
      promise.resolve(nil)
    }
  }

  func connectBleDevice(_ options: ConnectOptions, promise: Promise) {
    // The app always connects with a device token (the app-level userId) so the handshake
    // binds the device to the user. Prefer an explicit token, else the remembered userId.
    let token = options.deviceToken ?? self.userId
    DispatchQueue.main.async {
      self.scanEpoch += 1
      self.isScanning = false
      guard let device = self.lookupDevice(uuid: options.uuid, serialNumber: options.serialNumber) else {
        promise.reject("ERR_PLAUD_UNKNOWN_DEVICE",
                       "Unknown device — scan first, then connect by uuid or serialNumber")
        return
      }
      if let token = token, !token.isEmpty {
        PlaudDeviceAgent.shared.connectBleDevice(bleDevice: device, deviceToken: token)
      } else {
        PlaudDeviceAgent.shared.connectBleDevice(bleDevice: device)
      }
      promise.resolve(nil)
    }
  }

  func disconnect(promise: Promise) {
    DispatchQueue.main.async {
      self.wifi.close()
      self.scanEpoch += 1
      self.isScanning = false
      PlaudDeviceAgent.shared.stopScan()
      PlaudDeviceAgent.shared.disconnect()
      promise.resolve(nil)
    }
  }

  func depair(_ options: DepairOptions, promise: Promise) {
    DispatchQueue.main.async {
      self.wifi.close()
      self.scanEpoch += 1
      self.isScanning = false
      PlaudDeviceAgent.shared.stopScan()
      PlaudDeviceAgent.shared.depair(clear: options.clear)
      promise.resolve(nil)
    }
  }

  func isConnected(promise: Promise) {
    DispatchQueue.main.async {
      promise.resolve(["connected": PlaudDeviceAgent.shared.isConnected()])
    }
  }

  func getDeviceStatus(promise: Promise) {
    DispatchQueue.main.async {
      guard PlaudDeviceAgent.shared.isConnected() else {
        promise.reject("ERR_PLAUD_DISCONNECTED", "Connect the recorder to read its status.")
        return
      }
      PlaudDeviceAgent.shared.getChargingState()
      PlaudDeviceAgent.shared.getStorage()
      // Dispatch only: the SDK reports readings through the delegate callbacks below.
      promise.resolve(nil)
    }
  }

  func getState(promise: Promise) {
    DispatchQueue.main.async {
      guard PlaudDeviceAgent.shared.isConnected() else {
        promise.reject("ERR_PLAUD_DISCONNECTED", "Connect the recorder to read its state.")
        return
      }
      PlaudDeviceAgent.shared.getState()
      // Dispatch only; the fresh reading arrives through blePenState.
      promise.resolve(nil)
    }
  }

  // MARK: - Files

  func startWifi(_ promise: Promise) {
    DispatchQueue.main.async {
      guard self.exportCallbacks.isEmpty, !PlaudDeviceAgent.shared.checkIsRecording() else {
        promise.reject("ERR_PLAUD_BUSY", "Finish recording or transferring before starting Wi-Fi.")
        return
      }
      self.wifi.start(promise)
    }
  }
  func stopWifi(_ promise: Promise) {
    DispatchQueue.main.async { self.wifi.close(); promise.resolve(nil) }
  }
  func exportWifi(_ options: ExportOptions, promise: Promise) {
    DispatchQueue.main.async { self.wifi.export(options.sessionId, promise: promise) }
  }
  func shutdown() {
    DispatchQueue.main.async {
      self.scanEpoch += 1
      self.isScanning = false
      self.wifi.close()
    }
  }
  func controlRecorder(_ options: RecorderControlOptions, promise: Promise) {
    DispatchQueue.main.async {
      let agent = PlaudDeviceAgent.shared
      guard agent.isConnected(), self.exportCallbacks.isEmpty, !self.wifi.busy else {
        promise.reject("ERR_PLAUD_BUSY", "Connect the recorder and finish its transfer first.")
        return
      }
      if options.command == "start" && agent.checkIsRecording() {
        promise.reject("ERR_PLAUD_BUSY", "The recorder is already recording.")
        return
      }
      if options.command == "pause" || options.command == "resume" ||
         (options.command == "stop" && options.sessionId != nil) {
        guard let id = options.sessionId, id == agent.getCurrentSessionID() else {
          promise.reject("ERR_PLAUD_SESSION", "Refresh the current recording before using this control.")
          return
        }
      }
      switch options.command {
      case "start": agent.startRecord()
      case "stop": agent.stopRecord()
      case "pause": agent.pauseRecord()
      case "resume": agent.resumeRecord()
      default:
        promise.reject("ERR_PLAUD_ARGS", "Unknown recorder control.")
        return
      }
      promise.resolve(nil)
    }
  }

  func getFileList(_ options: FileListOptions, promise: Promise) {
    DispatchQueue.main.async {
      PlaudDeviceAgent.shared.getFileList(startSessionId: options.startSessionId)
      promise.resolve(nil)
    }
  }

  /// Decode a recording to Documents/PlaudExports. Resolves `{ sessionId, outputPath }` on
  /// completion; emits `exportProgress` along the way. `format` defaults to mp3.
  func exportAudio(_ options: ExportOptions, promise: Promise) {
    guard options.sessionId >= 0 else {
      promise.reject("ERR_PLAUD_ARGS", "sessionId is required")
      return
    }
    let format = Self.exportFormat(from: options.format)
    let channels = options.channels
    let sessionId = options.sessionId
    DispatchQueue.main.async {
      guard self.exportCallbacks.isEmpty, !self.wifi.busy else {
        promise.reject("ERR_PLAUD_BUSY", "Wait for the previous recorder transfer to finish.")
        return
      }
      let dir = FileManager.default
        .urls(for: .documentDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("PlaudExports", isDirectory: true)
      do {
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
      } catch {
        promise.reject("ERR_PLAUD_EXPORT", "The recording export folder could not be created.")
        return
      }

      let bridge = ExportCallbackBridge(sessionId: sessionId, promise: promise, controller: self)
      self.exportCallbacks.insert(bridge)
      PlaudDeviceAgent.shared.exportAudio(
        sessionId: sessionId,
        outputDir: dir.path,
        format: format,
        channels: channels,
        callback: bridge
      )
    }
  }

  // MARK: - PlaudDeviceAgentProtocol

  func blePowerChange(power: Int, oldPower: Int) {
    emit("batteryState", ["batteryPercent": power])
  }

  func bleChargingState(isCharging: Bool, level: Int) {
    emit("batteryState", ["batteryPercent": level, "charging": isCharging])
  }

  func bleStorage(total: Int, free: Int, duration: Int) {
    // The iOS SDK reports storage in bytes; duration is not used by the shared UI.
    emit("storageState", ["totalBytes": total, "freeBytes": free])
  }

  func blePenState(state: Int, privacy: Int, keyState: Int, uDisk: Int,
                   findMyToken: Int, hasSndpKey: Int, deviceAccessToken: Int) {
    let recordingState = PlaudDeviceAgent.shared.checkIsRecording()
      ? "recording" : (keyState == 0 ? "idle" : "unknown")
    emit("penState", [
      "state": state, "privacy": privacy, "keyState": keyState, "uDisk": uDisk,
      "recordingState": recordingState,
      "findMyToken": findMyToken, "hasSndpKey": hasSndpKey, "deviceAccessToken": deviceAccessToken
    ])
  }

  func bleScanResult(bleDevices: [BleDevice]) {
    DispatchQueue.main.async {
      for d in bleDevices { self.scannedDevices[d.uuid] = d }
    }
    let devices = bleDevices.map { d -> [String: Any] in
      [
        "name": d.name,
        "uuid": d.uuid,
        "serialNumber": d.serialNumber,
        "rssi": d.rssi,
        "supportWiFi": d.supportWiFi
      ]
    }
    emit("scanResult", ["devices": devices])
  }

  func bleScanOverTime() {
    emit("scanTimeout", [:])
  }

  func bleConnectState(state: Int) {
    // 1 = connected, 0 = disconnected, {2, -1, -2} = connection/handshake failure.
    let failed = (state == 2 || state == -1 || state == -2)
    if state != 1 { DispatchQueue.main.async { self.wifi.close() } }
    emit("connectState", ["connected": state == 1, "failed": failed, "state": state])
  }

  func bleBind(sn: String?, status: Int, protVersion: Int, timezone: Int) {
    emit("bind", ["sn": sn, "status": status, "protVersion": protVersion])
  }

  func bleWiFiOpen(_ status: Int, _ wifiName: String, _ wholeName: String, _ wifiPass: String) {
    DispatchQueue.main.async { self.wifi.hotspot(status: status, ssid: wholeName, password: wifiPass) }
  }

  // MARK: - Recording (device-initiated: physical button / VAD)

  func bleRecordStart(sessionId: Int, start: Int, status: Int, scene: Int,
                      startTime: Int, reason: Int) {
    emit("recordStart", [
      "sessionId": sessionId, "start": start, "status": status,
      "scene": scene, "startTime": startTime, "reason": reason
    ])
  }

  func bleRecordStop(sessionId: Int, reason: Int, fileExist: Bool, fileSize: Int) {
    emit("recordStop", [
      "sessionId": sessionId, "reason": reason, "fileExist": fileExist, "fileSize": fileSize
    ])
  }

  func bleRecordPause(sessionId: Int, reason: Int, fileExist: Bool, fileSize: Int) {
    emit("recordPause", [
      "sessionId": sessionId, "reason": reason, "fileExist": fileExist, "fileSize": fileSize
    ])
  }

  func bleRecordResume(sessionId: Int, start: Int, status: Int, scene: Int, startTime: Int) {
    emit("recordResume", [
      "sessionId": sessionId, "start": start, "status": status,
      "scene": scene, "startTime": startTime
    ])
  }

  func bleDepair(_ status: Int) {
    emit("depair", ["status": status])
  }

  func bleFileList(bleFiles: [BleFile]) {
    let files = bleFiles.map { f -> [String: Any] in
      [
        "sn": f.sn,
        "sessionId": f.sessionId,
        "size": f.size,
        "scenes": f.scenes,
        "channels": f.channels,
        "isOgg": f.isOgg,
        "isMusic": f.isMusic,
        "duration": f.duration()
      ]
    }
    emit("fileList", ["files": files])
  }

  // MARK: - Helpers

  private func lookupDevice(uuid: String?, serialNumber: String?) -> BleDevice? {
    if let uuid = uuid, let d = scannedDevices[uuid] { return d }
    if let serial = serialNumber {
      return scannedDevices.values.first { $0.serialNumber == serial }
    }
    return nil
  }

  private static func exportFormat(from raw: String?) -> AudioExportFormat {
    switch (raw ?? "mp3").lowercased() {
    case "pcm": return .pcm
    case "wav": return .wav
    case "opus": return .opus
    default: return .mp3
    }
  }

  fileprivate func emitEvent(_ event: String, _ body: [String: Any?]) {
    emit(event, body)
  }

  fileprivate func finishExport(_ bridge: ExportCallbackBridge) {
    DispatchQueue.main.async { [weak self] in
      self?.exportCallbacks.remove(bridge)
    }
  }
}

/// Adapts the SDK's per-call `AudioExportCallback` to the module: progress becomes an
/// `exportProgress` event, completion/error resolves/rejects the originating Promise.
private final class ExportCallbackBridge: NSObject, AudioExportCallback {
  private let sessionId: Int
  private let promise: Promise
  private weak var controller: PlaudSdkController?

  init(sessionId: Int, promise: Promise, controller: PlaudSdkController) {
    self.sessionId = sessionId
    self.promise = promise
    self.controller = controller
  }

  func onProgress(_ progress: Int, message: String) {
    controller?.emitEvent("exportProgress", [
      "sessionId": sessionId, "progress": progress, "message": message
    ])
  }

  func onComplete(outputPath: String) {
    promise.resolve(["sessionId": sessionId, "outputPath": outputPath])
    if let controller = controller { controller.finishExport(self) }
  }

  func onError(_ error: String) {
    promise.reject("ERR_PLAUD_EXPORT", error)
    if let controller = controller { controller.finishExport(self) }
  }
}
