package expo.modules.plaudsdk

import android.os.Bundle
import android.os.Handler
import androidx.core.os.bundleOf
import expo.modules.kotlin.Promise
import java.io.File
import sdk.audio.AudioExporter

/** Main-thread callbacks, with a caller deadline that never masquerades as native abort. */
internal class PlaudExportOperation(
  private val main: Handler,
  promise: Promise,
  lease: PlaudExportLease,
  private val sessionId: Long,
  private val directory: File,
  private val transport: String,
  private val emit: (String, Bundle) -> Unit,
  onTerminal: () -> Unit
) : AudioExporter.ExportCallback {
  private val lifecycle: PlaudExportLifecycle = PlaudExportLifecycle(promise, lease, { main.removeCallbacks(timeout) }, onTerminal)
  private val timeout: Runnable = Runnable {
    lifecycle.stalled()
    // No public abort-and-await API exists in the pinned SDK. Do not release the lease or
    // delete files here: native download/decryption/encoding may still be writing.
  }

  fun started() { main.postDelayed(timeout, STALL_TIMEOUT_MS) }

  fun cancel() {
    lifecycle.cancel()
  }

  fun startFailed() {
    // A throwing vendor call might already have scheduled work. A terminal callback is
    // still required before another export can reuse its process-wide buffers.
    lifecycle.startFailed()
  }

  override fun onProgress(progress: Int, message: String) {
    main.post {
      if (lifecycle.isPending) {
        main.removeCallbacks(timeout)
        main.postDelayed(timeout, STALL_TIMEOUT_MS)
        emit("exportProgress", bundleOf("sessionId" to sessionId, "progress" to progress, "message" to "Receiving over $transport"))
      }
    }
  }

  override fun onComplete(output: File) {
    main.post {
      lifecycle.complete(bundleOf("sessionId" to sessionId, "outputPath" to output.absolutePath)) {
        // The caller has ended. Reclaim only this completed export, before releasing its
        // lease. Never delete on a timer or trust a callback path outside our export folder.
        runCatching {
          if (output.canonicalFile.parentFile == directory.canonicalFile) output.delete()
        }
      }
    }
  }

  override fun onError(error: String) {
    main.post {
      lifecycle.failed()
    }
  }

  companion object { private const val STALL_TIMEOUT_MS = 120_000L }
}
