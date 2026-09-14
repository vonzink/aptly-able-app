package expo.modules.plaudsdk

import android.os.Bundle
import android.os.Handler
import androidx.core.os.bundleOf
import expo.modules.kotlin.Promise
import java.io.File
import sdk.PlaudDeviceAgent
import sdk.audio.AudioExportFormat
import sdk.audio.AudioExporter
import sdk.ble.wifi.IWifiTransferAgent
import sdk.ble.wifi.IWifiTransferAgent.WifiConnectionState
import sdk.ble.wifi.IWifiTransferAgent.WifiFileInfo
import sdk.ble.wifi.IWifiTransferAgent.BatchDownloadResult

/** Main-thread owner of one hotspot session. Credentials remain inside Plaud's SDK. */
internal class PlaudWifiTransfer(
  private val main: Handler,
  private val emit: (String, Bundle) -> Unit
) {
  private var opening: Promise? = null
  private var exporting = false
  private var active = false
  private var joining = false
  private var epoch = 0L
  private var serial = ""
  private var files = emptySet<Long>()
  private var timeout: Runnable? = null
  val busy: Boolean get() = active || opening != null || exporting

  fun start(deviceSerial: String, promise: Promise) {
    if (busy || deviceSerial.isBlank() || !PlaudDeviceAgent.isConnected()) {
      promise.reject("ERR_PLAUD_WIFI_BUSY", "Connect the recorder and finish its previous transfer first.", null)
      return
    }
    val own = ++epoch
    serial = deviceSerial
    opening = promise
    active = true
    joining = false
    files = emptySet()
    timeout = Runnable {
      if (own == epoch) close("Wi-Fi connection timed out. Use Bluetooth or try again nearby.")
    }.also { main.postDelayed(it, 90_000) }
    try {
      PlaudDeviceAgent.setDeviceWiFi(true)
    } catch (_: Exception) {
      close("The recorder could not open Wi-Fi transfer.")
    }
  }

  fun hotspot(status: Int) {
    if (opening == null || joining) return
    if (status != 0) {
      close("This recorder could not open Wi-Fi transfer. Use Bluetooth or try again.")
      return
    }
    joining = true
    val own = epoch
    main.postDelayed({
      if (own == epoch && opening != null) {
        try {
          if (!PlaudDeviceAgent.startWifiTransfer(serial, callback(own))) {
            close("The phone could not start recorder Wi-Fi. Check Wi-Fi and nearby-device permissions.")
          }
        } catch (_: Exception) {
          close("The phone could not connect to recorder Wi-Fi.")
        }
      }
    }, 3_000)
  }

  fun export(sessionId: Long, directory: File, promise: Promise) {
    if (!active || opening != null || exporting || sessionId !in files ||
      PlaudDeviceAgent.getWifiAgent()?.getConnectionState() != WifiConnectionState.READY) {
      promise.reject("ERR_PLAUD_WIFI_NOT_READY", "The Wi-Fi recording session is not ready.", null)
      return
    }
    var settled = false
    fun finish(output: File?) {
      if (settled) return
      settled = true
      exporting = false
      if (output != null) {
        promise.resolve(bundleOf("sessionId" to sessionId, "outputPath" to output.absolutePath))
      } else {
        promise.reject("ERR_PLAUD_WIFI_EXPORT", "Wi-Fi audio transfer failed. Use Bluetooth or reconnect and try again.", null)
      }
    }
    try {
      check(directory.isDirectory || directory.mkdirs())
      exporting = true
      PlaudDeviceAgent.exportAudioViaWiFi(
        sessionId, directory, AudioExportFormat.MP3, 1,
        object : AudioExporter.ExportCallback {
          override fun onProgress(progress: Int, message: String) {
            main.post {
              if (active && !settled) emit("exportProgress", bundleOf(
                "sessionId" to sessionId, "progress" to progress, "message" to "Receiving over Wi-Fi"
              ))
            }
          }
          override fun onComplete(output: File) { main.post { finish(output) } }
          override fun onError(error: String) { main.post { finish(null) } }
        }
      )
    } catch (_: Exception) {
      finish(null)
    }
  }

  fun close(message: String = "Wi-Fi transfer stopped.") {
    if (!active && opening == null) return
    ++epoch
    active = false
    joining = false
    timeout?.let { main.removeCallbacks(it) }
    timeout = null
    val pending = opening
    opening = null
    pending?.reject("ERR_PLAUD_WIFI", message, null)
    // Attempt every cleanup even if an SDK call throws. Keep export ownership until its
    // terminal callback; releasing it early would let a second exporter reuse SDK buffers.
    runCatching { PlaudDeviceAgent.getWifiAgent()?.stopWifiTransfer() }
    runCatching { PlaudDeviceAgent.setDeviceWiFi(false) }
    runCatching { PlaudDeviceAgent.endWiFiTransfer() }
  }

  private fun callback(own: Long) = object : IWifiTransferAgent.WifiTransferCallback {
    private fun accept(action: () -> Unit) {
      main.post {
        if (own == epoch && active) {
          try { action() } catch (_: Exception) { close("The recorder Wi-Fi session failed.") }
        }
      }
    }
    override fun onConnectionStateChanged(state: WifiConnectionState) = accept {
      when (state) {
        WifiConnectionState.READY -> {
          if (opening != null && PlaudDeviceAgent.getWifiAgent()?.getFileList() != true)
            close("The Wi-Fi recording list could not be requested.")
        }
        WifiConnectionState.ERROR, WifiConnectionState.DISCONNECTED ->
          close("The recorder Wi-Fi connection closed.")
        else -> Unit
      }
    }
    override fun onFileListReceived(files: List<WifiFileInfo>) = accept {
      val pending = opening ?: return@accept
      this@PlaudWifiTransfer.files = files.map { it.sessionId }.toSet()
      timeout?.let { main.removeCallbacks(it) }
      timeout = null
      opening = null
      pending.resolve(null)
    }
    override fun onDeviceBatteryUpdate(level: Int, charging: Boolean) = accept {
      emit("batteryState", bundleOf("batteryPercent" to level, "charging" to charging))
    }
    override fun onError(code: Int, message: String) = accept {
      close("The recorder reported a Wi-Fi error. Use Bluetooth or try again.")
    }
    override fun onWifiTransferStopped() = accept { close() }
    // Export progress/completion comes from AudioExporter, not the SDK's raw-file channel.
    override fun onHandshakeCompleted(info: String) {}
    override fun onTransferProgress(sessionId: Long, progress: Int, speed: Double) {}
    override fun onFileTransferCompleted(sessionId: Long, path: String) {}
    override fun onBatchDownloadStarted(total: Int) {}
    override fun onBatchDownloadProgress(current: Int, total: Int, filename: String) {}
    override fun onBatchDownloadCompleted(success: Int, failed: Int, results: List<BatchDownloadResult>) {}
    override fun onFileDeleteCompleted(success: Boolean, deletedCount: Int, error: String?) {}
  }
}
