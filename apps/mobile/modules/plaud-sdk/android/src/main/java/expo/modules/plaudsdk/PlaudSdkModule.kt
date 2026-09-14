package expo.modules.plaudsdk

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.core.os.bundleOf
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.util.concurrent.atomic.AtomicLong
import com.tinnotech.penblesdk.entity.BleDevice
import com.tinnotech.penblesdk.entity.BleFile
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import sdk.NiceBuildSdk
import sdk.PlaudDeviceAgent
import sdk.PlaudDeviceAgentListener
import sdk.audio.AudioExportFormat

// MARK: - Typed argument records (mirrors the `Record` structs in PlaudSdkModule.swift)

class InitOptions : Record {
  @Field val userAccessToken: String = ""
  @Field val customDomain: String = ""
  @Field val userId: String? = null
}

class ConnectOptions : Record {
  @Field val uuid: String? = null
  @Field val serialNumber: String? = null
  @Field val deviceToken: String? = null
}

class DepairOptions : Record {
  @Field val clear: Boolean = true
}

class FileListOptions : Record {
  @Field val startSessionId: Long = 0
}

class ExportOptions : Record {
  @Field val sessionId: Long = -1
  @Field val format: String = "mp3"
  @Field val channels: Int = 1
}

class RecorderControlOptions : Record {
  @Field val command: String = ""
  @Field val sessionId: Long? = null
}

private class PlaudSdkException(message: String, code: String = "ERR_PLAUD") :
  CodedException(code, message, null)

/**
 * Expo module bridging Plaud's native Android SDK (`plaud-sdk.aar`). This is the Android
 * counterpart of `ios/PlaudSdkModule.swift` and deliberately exposes the *same* JS surface,
 * event names and payload shapes, so `src/PlaudSdk.types.ts` describes both platforms and
 * app code needs no platform branches.
 *
 * Where the two native SDKs genuinely differ, the differences are noted inline and in the
 * module README:
 *  - Android's `BleDevice` has a MAC address, not a CoreBluetooth UUID. It is surfaced as
 *    `uuid` so `connectBleDevice({ uuid })` works identically on both platforms.
 *  - Android's `blePenState` callback carries 4 values, not iOS's 7.
 *  - Android's `BleFile` carries no `sn` / `channels` / `isOgg`; those come from the
 *    connected device, which is what the SDK itself uses when decoding.
 */
class PlaudSdkModule : Module() {
  private val main = Handler(Looper.getMainLooper())

  /**
   * Connect can't be a straight-through call on Android: the handshake has two async
   * prerequisites (see `prepareHandshake`). Main-immediate so the SDK calls still land on the
   * main thread, with the blocking parts hopped to IO explicitly.
   */
  private val scope = CoroutineScope(Dispatchers.Main.immediate + SupervisorJob())

  /**
   * `connectBleDevice` needs the actual `BleDevice` the SDK handed us during a scan — JS only
   * carries identifiers, so we retain scanned objects and look them up. Keyed by MAC address.
   */
  private val scannedDevices = linkedMapOf<String, BleDevice>()

  /**
   * The device we last connected to. `BleFile` alone doesn't know its serial number, channel
   * count or codec, but every file on the device shares the device's, so we read them here
   * when building `fileList` payloads.
   */
  @Volatile private var connectedDevice: BleDevice? = null

  /**
   * App-level user identifier from `initSDK`, reused as the default connect `deviceToken`
   * (it's what binds the device to the user during the handshake).
   */
  @Volatile private var userId: String? = null

  @Volatile private var isScanning = false
  @Volatile private var destroyed = false
  @Volatile private var connectJob: Job? = null
  private val scanEpoch = AtomicLong(0)
  private val connectionEpoch = AtomicLong(0)
  private val wifiEpoch = AtomicLong(0)
  private val actions = PlaudRecorderActions(main) { event, body -> emit(event, body); Unit }

  private fun invalidateConnection(): Long {
    wifiEpoch.incrementAndGet()
    val epoch = connectionEpoch.incrementAndGet()
    connectJob?.cancel()
    connectJob = null
    return epoch
  }

  private fun invalidateScan() {
    scanEpoch.incrementAndGet()
    isScanning = false
  }

  private val context: Context
    get() = appContext.reactContext ?: throw PlaudSdkException("React context is unavailable")

  private fun emit(event: String, body: Bundle) = main.post {
    if (!destroyed) sendEvent(event, body)
  }

  private fun dispatchSdk(
    promise: Promise,
    code: String,
    message: String,
    operation: () -> Any?
  ) {
    // Catch inside the posted work: Expo cannot catch exceptions on a later main-thread turn.
    val posted = main.post {
      if (destroyed) {
        promise.reject(PlaudSdkException("SDK session ended", "ERR_PLAUD_CANCELLED"))
      } else {
        try {
          promise.resolve(operation())
        } catch (failure: PlaudSdkException) {
          promise.reject(failure)
        } catch (_: Exception) {
          promise.reject(PlaudSdkException(message, code))
        }
      }
    }
    if (!posted) promise.reject(PlaudSdkException("SDK session ended", "ERR_PLAUD_CANCELLED"))
  }

  private fun requireConnected() {
    if (!PlaudDeviceAgent.isConnected()) {
      throw PlaudSdkException("Connect the recorder first.", "ERR_PLAUD_DISCONNECTED")
    }
  }

  override fun definition() = ModuleDefinition {
    Name("PlaudSdk")

    Events(
      "scanResult", "scanTimeout", "connectState", "penState", "bind", "fileList",
      "exportProgress", "recordStart", "recordStop", "recordPause", "recordResume", "depair",
      "batteryState", "storageState"
    )

    AsyncFunction("initSDK") { options: InitOptions, promise: Promise ->
      if (options.userAccessToken.isEmpty()) {
        throw PlaudSdkException("userAccessToken is required", "ERR_PLAUD_ARGS")
      }
      if (options.customDomain.isEmpty()) {
        throw PlaudSdkException("customDomain is required (domain only, no https://)", "ERR_PLAUD_ARGS")
      }
      val epoch = invalidateConnection()
      invalidateScan()
      userId = options.userId
      // Resolve the context up front: throwing from inside `main.post` would surface as an
      // uncaught main-thread crash instead of a rejected promise.
      val ctx = context.applicationContext
      main.post {
        if (destroyed || epoch != connectionEpoch.get()) {
          promise.reject(PlaudSdkException("SDK initialization cancelled", "ERR_PLAUD_CANCELLED"))
          return@post
        }
        // The SDK's Partner API (gen-key / sn-sign) hardcodes platform-jp and does *not*
        // follow `customDomain`. Point it at the right host first, or a non-JP token 401s,
        // the RSA key fetch fails, and every device handshake fails after it.
        try {
          actions.reset()
          NiceBuildSdk.getPartnerApiManager().updateBaseUrl("https://${options.customDomain}")
          PlaudDeviceAgent.listener = listener
          PlaudDeviceAgent.initSDK(ctx, options.userAccessToken, options.customDomain)
          promise.resolve(null)
        } catch (_: Exception) {
          promise.reject(PlaudSdkException("SDK initialization failed", "ERR_PLAUD_INIT"))
        }
      }
    }

    /**
     * Android 12+ gates BLE scanning behind runtime permissions (iOS handles this with the
     * Info.plist usage strings alone). Exposed so apps can prompt at a sensible moment;
     * `startScan` also calls it, so the JS surface stays identical to iOS.
     */
    AsyncFunction("requestPermissions") { promise: Promise ->
      requestBlePermissions { granted ->
        promise.resolve(bundleOf("granted" to granted))
      }
    }

    AsyncFunction("startScan") { promise: Promise ->
      val epoch = scanEpoch.incrementAndGet()
      requestBlePermissions { granted ->
        if (destroyed || epoch != scanEpoch.get()) {
          promise.reject(PlaudSdkException("Scan cancelled", "ERR_PLAUD_CANCELLED"))
          return@requestBlePermissions
        }
        if (!granted) {
          promise.reject(
            PlaudSdkException(
              "Bluetooth permissions were denied — scanning is not possible",
              "ERR_PLAUD_PERMISSIONS"
            )
          )
          return@requestBlePermissions
        }
        if (!isBluetoothOn()) {
          // Mirrors the iOS module's `bluetoothNotPoweredOn` timeout: the SDK silently drops
          // scans while the adapter is off, so surface it instead of hanging.
          isScanning = false
          emit("scanTimeout", bundleOf("reason" to "bluetoothNotPoweredOn"))
          promise.resolve(null)
          return@requestBlePermissions
        }
        main.post {
          if (destroyed || epoch != scanEpoch.get()) {
            promise.reject(PlaudSdkException("Scan cancelled", "ERR_PLAUD_CANCELLED"))
            return@post
          }
          isScanning = true
          PlaudDeviceAgent.startScan()
          promise.resolve(null)
        }
      }
    }

    AsyncFunction("stopScan") { promise: Promise ->
      invalidateScan()
      main.post {
        isScanning = false
        PlaudDeviceAgent.stopScan()
        promise.resolve(null)
      }
    }

    AsyncFunction("connectBleDevice") { options: ConnectOptions, promise: Promise ->
      // The app always connects with a device token (the app-level userId) so the handshake
      // binds the device to the user. Prefer an explicit token, else the remembered userId.
      val token = options.deviceToken ?: userId
      val epoch = invalidateConnection()
      invalidateScan()
      main.post {
        if (destroyed || epoch != connectionEpoch.get()) {
          promise.reject(PlaudSdkException("Connection cancelled", "ERR_PLAUD_CANCELLED"))
          return@post
        }
        isScanning = false
        val device = lookupDevice(options.uuid, options.serialNumber)
        if (device == null) {
          promise.reject(
            PlaudSdkException(
              "Unknown device — scan first, then connect by uuid or serialNumber",
              "ERR_PLAUD_UNKNOWN_DEVICE"
            )
          )
          return@post
        }
        connectedDevice = device
        connectJob = scope.launch {
          try {
            prepareHandshake(device)
            coroutineContext.ensureActive()
            if (destroyed || epoch != connectionEpoch.get()) throw CancellationException()
            if (!token.isNullOrEmpty()) {
              PlaudDeviceAgent.connectBleDevice(device, token)
            } else {
              PlaudDeviceAgent.connectBleDevice(device)
            }
            promise.resolve(null)
          } catch (_: CancellationException) {
            promise.reject(PlaudSdkException("Connection cancelled", "ERR_PLAUD_CANCELLED"))
          } catch (_: Exception) {
            promise.reject(PlaudSdkException("Device handshake preparation failed", "ERR_PLAUD_CONNECT"))
          }
        }
      }
    }

    AsyncFunction("disconnect") { promise: Promise ->
      invalidateConnection()
      invalidateScan()
      dispatchSdk(promise, "ERR_PLAUD_DISCONNECT", "The recorder could not be disconnected.") {
        actions.reset()
        PlaudDeviceAgent.disconnect()
        null
      }
    }

    AsyncFunction("depair") { options: DepairOptions?, promise: Promise ->
      invalidateConnection()
      invalidateScan()
      val clear = options?.clear ?: true
      dispatchSdk(promise, "ERR_PLAUD_DEPAIR", "Unpairing could not be started.") {
        actions.reset()
        PlaudDeviceAgent.depair(clear)
        null
      }
    }

    AsyncFunction("isConnected") { promise: Promise ->
      dispatchSdk(promise, "ERR_PLAUD_STATE", "The connection state could not be read.") {
        bundleOf("connected" to PlaudDeviceAgent.isConnected())
      }
    }

    AsyncFunction("getDeviceStatus") { promise: Promise ->
      dispatchSdk(promise, "ERR_PLAUD_STATUS", "Recorder readings could not be requested.") {
        requireConnected()
        PlaudDeviceAgent.getChargingState()
        PlaudDeviceAgent.getStorage()
        // Dispatch only; results arrive through batteryState and storageState.
        null
      }
    }

    AsyncFunction("getState") { promise: Promise ->
      dispatchSdk(promise, "ERR_PLAUD_STATE", "The recorder state could not be requested.") {
        requireConnected()
        PlaudDeviceAgent.getState()
        null
      }
    }

    AsyncFunction("getFileList") { options: FileListOptions?, promise: Promise ->
      val startSessionId = options?.startSessionId ?: 0
      dispatchSdk(promise, "ERR_PLAUD_FILES", "The recording list could not be requested.") {
        requireConnected()
        PlaudDeviceAgent.getFileList(startSessionId)
        null
      }
    }

    AsyncFunction("exportAudio") { options: ExportOptions, promise: Promise ->
      if (options.sessionId < 0) {
        throw PlaudSdkException("sessionId is required", "ERR_PLAUD_ARGS")
      }
      val format = exportFormat(options.format)
      val sessionId = options.sessionId
      // `filesDir` is what expo-file-system exposes as `documentDirectory`, so the path this
      // resolves with is readable by the JS side exactly as on iOS. Resolved before the post
      // so a missing context rejects the promise rather than crashing the main thread.
      val exportsDir = File(context.filesDir, "PlaudExports")
      main.post {
        if (destroyed) promise.reject(PlaudSdkException("SDK session ended", "ERR_PLAUD_CANCELLED"))
        else actions.exportBle(sessionId, exportsDir, format, options.channels, promise)
      }
    }

    AsyncFunction("startWifiTransfer") { promise: Promise ->
      val own = wifiEpoch.incrementAndGet()
      val required = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
        blePermissions() + Manifest.permission.NEARBY_WIFI_DEVICES else blePermissions()
      requestNativePermissions(required) { granted ->
        main.post {
          if (destroyed || own != wifiEpoch.get()) {
            promise.reject(PlaudSdkException("Wi-Fi setup cancelled", "ERR_PLAUD_CANCELLED"))
          } else if (!granted) {
            promise.reject(PlaudSdkException("Allow nearby-device and Wi-Fi access to transfer recordings.", "ERR_PLAUD_PERMISSIONS"))
          } else {
            // The pinned SDK expects the connected recorder SN here, not the app user ID.
            actions.startWifi(connectedDevice?.serialNumber ?: "", promise)
          }
        }
      }
    }
    AsyncFunction("stopWifiTransfer") { promise: Promise ->
      wifiEpoch.incrementAndGet()
      dispatchSdk(promise, "ERR_PLAUD_WIFI", "Wi-Fi transfer could not be stopped.") {
        actions.stopWifi()
        null
      }
    }
    AsyncFunction("exportAudioViaWifi") { options: ExportOptions, promise: Promise ->
      val directory = File(context.filesDir, "PlaudExports")
      main.post {
        if (destroyed) promise.reject(PlaudSdkException("SDK session ended", "ERR_PLAUD_CANCELLED"))
        else actions.exportWifi(options.sessionId, directory, promise)
      }
    }
    AsyncFunction("controlRecorder") { options: RecorderControlOptions, promise: Promise ->
      dispatchSdk(promise, "ERR_PLAUD_CONTROL", "The recorder action could not be sent. Refresh its state and try again.") {
        actions.control(options.command, options.sessionId)
        null
      }
    }

    OnDestroy {
      destroyed = true
      invalidateConnection()
      invalidateScan()
      main.post { actions.reset() }
      // The SDK's listener is a process-wide static; leaving ours attached would keep this
      // module (and the React context) alive across reloads.
      if (PlaudDeviceAgent.listener === listener) {
        PlaudDeviceAgent.listener = null
      }
      scope.cancel()
    }
  }

  // MARK: - PlaudDeviceAgentListener

  private val listener = object : PlaudDeviceAgentListener {
    override fun bleScanResult(bleDevices: List<BleDevice>) {
      synchronized(scannedDevices) {
        for (d in bleDevices) scannedDevices[d.macAddress] = d
      }
      val devices = ArrayList(bleDevices.map { d ->
        bundleOf(
          "name" to (d.name ?: ""),
          // Android has no CoreBluetooth UUID; the MAC address is the stable per-device
          // identifier, and it's what `connectBleDevice({ uuid })` looks up.
          "uuid" to d.macAddress,
          "serialNumber" to (d.serialNumber ?: ""),
          "rssi" to d.rssi,
          // The Android SDK's scan payload carries no Wi-Fi capability flag (iOS's
          // `BleDevice.supportWiFi` has no Android equivalent). Reported false; use the
          // Wi-Fi sync APIs on a connected device to determine support.
          "supportWiFi" to false
        )
      })
      emit("scanResult", Bundle().apply { putParcelableArrayList("devices", devices) })
    }

    override fun bleScanOverTime() {
      isScanning = false
      emit("scanTimeout", Bundle())
    }

    override fun bleConnectState(state: Int) {
      // 1 = connected, 0 = disconnected, {2, -1, -2} = connection/handshake failure.
      val failed = state == 2 || state == -1 || state == -2
      if (state != 1) {
        connectedDevice = null
        wifiEpoch.incrementAndGet()
        main.post { actions.reset() }
      }
      emit(
        "connectState",
        bundleOf("connected" to (state == 1), "failed" to failed, "state" to state)
      )
    }

    override fun bleBind(sn: String?, status: Int, protVersion: Int, timezone: Int) {
      emit("bind", bundleOf("sn" to sn, "status" to status, "protVersion" to protVersion))
    }

    override fun blePenState(state: Int, privacy: Int, keyState: Int, uDisk: Int) {
      // The Android callback carries 4 values; iOS additionally reports findMyToken /
      // hasSndpKey / deviceAccessToken, which are absent here (see PlaudSdk.types.ts).
      val status = com.tinnotech.penblesdk.Constants.DeviceStatus.find(keyState.toLong(), state.toLong())
      val recordingState = when (status) {
        com.tinnotech.penblesdk.Constants.DeviceStatus.RECORDING,
        com.tinnotech.penblesdk.Constants.DeviceStatus.RECORD -> "recording"
        com.tinnotech.penblesdk.Constants.DeviceStatus.IDLE -> if (keyState == 0) "idle" else "unknown"
        else -> "unknown"
      }
      main.post { actions.state(recordingState) }
      emit(
        "penState",
        bundleOf("state" to state, "privacy" to privacy, "keyState" to keyState, "uDisk" to uDisk,
          "recordingState" to recordingState)
      )
    }

    override fun bleDepair(status: Int) {
      connectedDevice = null
      wifiEpoch.incrementAndGet()
      main.post { actions.reset() }
      emit("depair", bundleOf("status" to status))
    }

    // MARK: Recording (device-initiated: physical button / VAD)

    override fun blePowerChange(power: Int, oldPower: Int) {
      emit("batteryState", bundleOf("batteryPercent" to power))
    }

    override fun bleChargingState(isCharging: Boolean, level: Int) {
      emit("batteryState", bundleOf("batteryPercent" to level, "charging" to isCharging))
    }

    override fun bleStorage(total: Long, free: Long, duration: Long) {
      // SDK units are bytes; the shared controller validates ranges before display.
      emit("storageState", bundleOf("totalBytes" to total, "freeBytes" to free))
    }

    override fun bleRecordStart(
      sessionId: Long, start: Long, status: Int, scene: Int, startTime: Long, reason: Int
    ) {
      if (status == 0) main.post { actions.recorded(sessionId) }
      emit(
        "recordStart",
        bundleOf(
          "sessionId" to sessionId, "start" to start, "status" to status,
          "scene" to scene, "startTime" to startTime, "reason" to reason
        )
      )
    }

    override fun bleRecordStop(sessionId: Long, reason: Int, fileExist: Boolean, fileSize: Long) {
      main.post { actions.recorded(sessionId, stopped = true) }
      emit("recordStop", recordStopBundle(sessionId, reason, fileExist, fileSize))
    }

    override fun bleRecordPause(sessionId: Long, reason: Int, fileExist: Boolean, fileSize: Long) {
      main.post { actions.recorded(sessionId) }
      emit("recordPause", recordStopBundle(sessionId, reason, fileExist, fileSize))
    }

    override fun bleRecordResume(
      sessionId: Long, start: Long, status: Int, scene: Int, startTime: Long
    ) {
      if (status == 0) main.post { actions.recorded(sessionId) }
      emit(
        "recordResume",
        bundleOf(
          "sessionId" to sessionId, "start" to start, "status" to status,
          "scene" to scene, "startTime" to startTime
        )
      )
    }

    override fun bleWiFiOpen(status: Int, ssid: String, password: String, url: String) {
      main.post { if (!destroyed) actions.hotspot(status) }
    }

    override fun bleFileList(bleFiles: List<BleFile>) {
      val device = connectedDevice
      // A `BleFile` knows only its session, size and scene — the serial number, channel count
      // and codec are properties of the device the files live on.
      val sn = device?.serialNumber ?: ""
      val channels = device?.audioChannel?.takeIf { it > 0 } ?: 1
      val isOgg = device?.isOggAudio ?: false
      val files = ArrayList(bleFiles.map { f ->
        bundleOf(
          "sn" to sn,
          "sessionId" to f.sessionId,
          "size" to f.fileSize,
          "scenes" to f.scene,
          "channels" to channels,
          "isOgg" to isOgg,
          "isMusic" to f.isMusic,
          "duration" to durationSeconds(f.fileSize, channels)
        )
      })
      emit("fileList", Bundle().apply { putParcelableArrayList("files", files) })
    }
  }

  // MARK: - Helpers

  private fun recordStopBundle(sessionId: Long, reason: Int, fileExist: Boolean, fileSize: Long) =
    bundleOf(
      "sessionId" to sessionId, "reason" to reason,
      "fileExist" to fileExist, "fileSize" to fileSize
    )

  /**
   * Two prerequisites the iOS SDK handles internally but the Android one leaves to the caller:
   * the partner RSA key pair (fetched over HTTP by `initSDK`, asynchronously) has to have
   * landed, and the device's serial number has to be signed and stored. Skipping either leaves
   * the handshake without an `snSignature` and the connect fails — the device is found by the
   * scan, then `connectState` reports failure. Fail before starting BLE if either prerequisite
   * fails, and allow cancellation to propagate to the connection job.
   */
  private suspend fun prepareHandshake(device: BleDevice) = withContext(Dispatchers.IO) {
    val deadline = System.currentTimeMillis() + 10_000L
    while (!NiceBuildSdk.isPartnerDataReady() && System.currentTimeMillis() < deadline) {
      delay(200)
    }
    coroutineContext.ensureActive()
    check(NiceBuildSdk.isPartnerDataReady()) { "Partner key readiness timed out" }
    val sn = device.serialNumber
    check(!sn.isNullOrEmpty()) { "Device serial is required" }
    check(NiceBuildSdk.signAndStoreDeviceSn(deviceType(sn), sn)) { "Device signing failed" }
    coroutineContext.ensureActive()
  }

  /** SN prefix → device type, as expected by `signAndStoreDeviceSn`. */
  private fun deviceType(sn: String): String = when {
    sn.startsWith("881") -> "notepro"
    sn.startsWith("880") -> "notepin"
    sn.startsWith("882") -> "notepins"
    else -> "note"
  }

  private fun lookupDevice(uuid: String?, serialNumber: String?): BleDevice? =
    synchronized(scannedDevices) {
      uuid?.let { scannedDevices[it] }
        ?: serialNumber?.let { sn -> scannedDevices.values.firstOrNull { it.serialNumber == sn } }
    }

  /**
   * Recording length in seconds, to match iOS's `BleFile.duration()`.
   *
   * `calculateOpusDuration` is exact for the raw-Opus stream the device stores (one 20 ms
   * frame per 80 bytes per channel). For OGG-contained recordings this is a slight
   * over-estimate: the Android SDK's `calculateOggDuration` needs the page geometry
   * (header size and frames-per-page), which it never exposes and never calls itself.
   */
  private fun durationSeconds(fileSize: Long, channels: Int): Long =
    BleFile.calculateOpusDuration(fileSize, channels) / 1000

  /** Null-safe on purpose: this runs from a permission callback, outside any promise guard. */
  private fun isBluetoothOn(): Boolean {
    val manager =
      appContext.reactContext?.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    val adapter: BluetoothAdapter? = manager?.adapter
    return adapter?.isEnabled == true
  }

  /** The permission set the SDK's own `PermissionManager` checks, split by API level. */
  private fun blePermissions(): Array<String> =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      arrayOf(
        Manifest.permission.BLUETOOTH_SCAN,
        Manifest.permission.BLUETOOTH_CONNECT,
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION
      )
    } else {
      arrayOf(
        Manifest.permission.BLUETOOTH,
        Manifest.permission.BLUETOOTH_ADMIN,
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION
      )
    }

  private fun requestBlePermissions(callback: (Boolean) -> Unit) =
    requestNativePermissions(blePermissions(), callback)

  private fun requestNativePermissions(required: Array<String>, callback: (Boolean) -> Unit) {
    val permissions = appContext.permissions
    if (permissions == null) {
      callback(false)
      return
    }
    if (permissions.hasGrantedPermissions(*required)) {
      callback(true)
      return
    }
    permissions.askForPermissions({ response ->
      callback(response.values.all { it.status == expo.modules.interfaces.permissions.PermissionsStatus.GRANTED })
    }, *required)
  }

  private fun exportFormat(raw: String?): AudioExportFormat =
    when (raw?.lowercase()) {
      "pcm" -> AudioExportFormat.PCM
      "wav" -> AudioExportFormat.WAV
      "opus" -> AudioExportFormat.OPUS
      else -> AudioExportFormat.MP3
    }
}
