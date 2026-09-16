package expo.modules.plaudsdk

import expo.modules.kotlin.Promise

/** Caller settlement and native ownership are deliberately independent states. */
internal class PlaudExportLifecycle(
  private val promise: Promise,
  private val lease: PlaudExportLease,
  onSettled: () -> Unit,
  private val onTerminal: () -> Unit
) {
  private val call = PlaudPendingCall(promise) { onSettled() }
  val isPending: Boolean get() = call.isPending && (promise as? PlaudPendingCall)?.isPending != false

  fun cancel() = call.cancel()

  fun stalled() = call.reject(
    "ERR_PLAUD_EXPORT_STALLED",
    "Recording transfer stopped responding. Fully close and reopen the app before trying again.",
    null
  )

  fun startFailed() = call.reject(
    "ERR_PLAUD_EXPORT_RESTART_REQUIRED",
    "Recording transfer could not be started. Fully close and reopen the app before trying again.",
    null
  )

  fun complete(output: Any?, discard: () -> Unit = {}) {
    if (lease.finish {
      // Deliver or discard while ownership is still held. Teardown may cancel the outer
      // tracked promise even after this operation's own settlement has started.
      if (!call.tryResolve(output)) discard()
    }) {
      onTerminal()
    }
  }

  fun failed() {
    if (lease.finish()) {
      onTerminal()
      call.reject("ERR_PLAUD_EXPORT", "Recording audio could not be received.", null)
    }
  }
}
