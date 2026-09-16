package expo.modules.plaudsdk

import android.os.Bundle
import android.os.Handler
import expo.modules.kotlin.Promise
import java.io.File
import sdk.PlaudDeviceAgent
import sdk.audio.AudioExportFormat

/** Native transfer exclusion and recording-session identity, shared by both transports. */
internal class PlaudRecorderActions(
  private val main: Handler,
  private val emit: (String, Bundle) -> Unit
) {
  private val wifi = PlaudWifiTransfer(main, emit)
  private var bleExport: PlaudExportOperation? = null
  private var recording: Boolean? = null
  private var session: Long? = null

  fun reset(stopSdk: Boolean = true) {
    bleExport?.cancel()
    wifi.close(stopSdk = stopSdk)
    recording = null
    session = null
  }
  fun state(value: String) {
    recording = when (value) { "idle" -> false; "recording" -> true; else -> null }
    if (recording != true) session = null
  }
  fun recorded(id: Long, stopped: Boolean = false) {
    recording = !stopped
    session = if (stopped) null else id
  }
  fun hotspot(status: Int) = wifi.hotspot(status)
  fun stopWifi() = wifi.close()
  fun startWifi(serial: String, promise: Promise) {
    if (PlaudExportGate.shared.isBusy()) {
      promise.reject("ERR_PLAUD_EXPORT_PENDING", "The previous transfer has not finished. Fully close and reopen the app.", null)
    } else if (recording != false) {
      promise.reject("ERR_PLAUD_BUSY", "Finish recording or transferring before starting Wi-Fi.", null)
    } else wifi.start(serial, promise)
  }
  fun exportWifi(id: Long, directory: File, promise: Promise) = wifi.export(id, directory, promise)

  fun control(command: String, id: Long?) {
    check(PlaudDeviceAgent.isConnected() && !PlaudExportGate.shared.isBusy() && !wifi.busy)
    if (command == "pause" || command == "resume") check(id != null && id >= 0 && id == session)
    if (command == "stop" && id != null) check(id == session)
    when (command) {
      "start" -> { check(recording == false); PlaudDeviceAgent.startRecord() }
      "stop" -> { check(recording == true); PlaudDeviceAgent.stopRecord() }
      "pause" -> PlaudDeviceAgent.pauseRecord(id!!)
      "resume" -> PlaudDeviceAgent.resumeRecord(id!!)
      else -> error("Unknown recorder control")
    }
  }

  fun exportBle(id: Long, directory: File, format: AudioExportFormat, channels: Int, promise: Promise) {
    if (PlaudExportGate.shared.isBusy()) {
      promise.reject("ERR_PLAUD_EXPORT_PENDING", "The previous transfer has not finished. Fully close and reopen the app.", null)
      return
    }
    if (!PlaudDeviceAgent.isConnected() || wifi.busy) {
      promise.reject("ERR_PLAUD_BUSY", "Connect the recorder and finish its previous transfer first.", null)
      return
    }
    try {
      check(directory.isDirectory || directory.mkdirs())
    } catch (_: Exception) {
      promise.reject("ERR_PLAUD_EXPORT", "Recording audio could not be saved.", null)
      return
    }
    val lease = PlaudExportGate.shared.acquire()
    if (lease == null) {
      promise.reject("ERR_PLAUD_EXPORT_PENDING", "The previous transfer has not finished. Fully close and reopen the app if it stopped responding.", null)
      return
    }
    val operation = PlaudExportOperation(main, promise, lease, id, directory, "Bluetooth", emit) { bleExport = null }
    bleExport = operation
    operation.started()
    try {
      PlaudDeviceAgent.exportAudio(id, directory, format, channels, operation)
    } catch (_: Exception) { operation.startFailed() }
  }
}
