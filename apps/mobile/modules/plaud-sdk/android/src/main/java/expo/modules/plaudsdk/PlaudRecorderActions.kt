package expo.modules.plaudsdk

import android.os.Bundle
import android.os.Handler
import androidx.core.os.bundleOf
import expo.modules.kotlin.Promise
import java.io.File
import sdk.PlaudDeviceAgent
import sdk.audio.AudioExportFormat
import sdk.audio.AudioExporter

/** Native transfer exclusion and recording-session identity, shared by both transports. */
internal class PlaudRecorderActions(
  private val main: Handler,
  private val emit: (String, Bundle) -> Unit
) {
  private val wifi = PlaudWifiTransfer(main, emit)
  private var bleExportPending = false
  private var recording: Boolean? = null
  private var session: Long? = null

  fun reset() {
    wifi.close()
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
    if (bleExportPending || recording != false) {
      promise.reject("ERR_PLAUD_BUSY", "Finish recording or transferring before starting Wi-Fi.", null)
    } else wifi.start(serial, promise)
  }
  fun exportWifi(id: Long, directory: File, promise: Promise) = wifi.export(id, directory, promise)

  fun control(command: String, id: Long?) {
    check(PlaudDeviceAgent.isConnected() && !bleExportPending && !wifi.busy)
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
    if (!PlaudDeviceAgent.isConnected() || bleExportPending || wifi.busy) {
      promise.reject("ERR_PLAUD_BUSY", "Connect the recorder and finish its previous transfer first.", null)
      return
    }
    var settled = false
    fun finish(output: File?) {
      if (settled) return
      settled = true
      bleExportPending = false
      if (output != null) promise.resolve(bundleOf("sessionId" to id, "outputPath" to output.absolutePath))
      else promise.reject("ERR_PLAUD_EXPORT", "Recording audio could not be received.", null)
    }
    try {
      check(directory.isDirectory || directory.mkdirs())
      bleExportPending = true
      PlaudDeviceAgent.exportAudio(id, directory, format, channels, object : AudioExporter.ExportCallback {
        override fun onProgress(progress: Int, message: String) {
          main.post {
            if (!settled) emit("exportProgress", bundleOf("sessionId" to id, "progress" to progress, "message" to "Receiving over Bluetooth"))
          }
        }
        override fun onComplete(output: File) { main.post { finish(output) } }
        override fun onError(error: String) { main.post { finish(null) } }
      })
    } catch (_: Exception) { finish(null) }
  }
}
