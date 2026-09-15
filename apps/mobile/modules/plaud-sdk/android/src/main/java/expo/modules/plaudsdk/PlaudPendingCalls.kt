package expo.modules.plaudsdk

import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import java.util.concurrent.atomic.AtomicBoolean

/** One settlement per JS call, including callbacks arriving after React teardown. */
internal class PlaudPendingCall(
  private val delegate: Promise,
  private val onSettled: (PlaudPendingCall) -> Unit
) : Promise {
  private val settled = AtomicBoolean(false)
  val isPending: Boolean get() = !settled.get()

  override fun resolve(value: Any?) { tryResolve(value) }
  override fun reject(code: String?, message: String?, cause: Throwable?) =
    settle { delegate.reject(code, message, cause) }

  fun cancel() = reject("ERR_PLAUD_CANCELLED", "SDK session ended or the operation was cancelled.", null)

  /** Reports whether delivery won against cancellation of every tracked delegate. */
  fun tryResolve(value: Any?): Boolean {
    if (!settled.compareAndSet(false, true)) return false
    onSettled(this)
    // A nested operation can settle just as module teardown cancels its outer call.
    // Use the outer call's CAS result, never a separate isPending check.
    if (delegate is PlaudPendingCall) return delegate.tryResolve(value)
    delegate.resolve(value)
    return true
  }

  private fun settle(action: () -> Unit) {
    if (!settled.compareAndSet(false, true)) return
    onSettled(this)
    action()
  }
}

/** The injected queue makes permission, main-thread failure, and teardown races testable. */
internal class PlaudPendingCalls(private val post: (() -> Unit) -> Boolean) {
  private val lock = Any()
  private var ended = false
  private val calls = mutableSetOf<PlaudPendingCall>()

  fun track(promise: Promise): PlaudPendingCall {
    val call = PlaudPendingCall(promise) { synchronized(lock) { calls.remove(it) }; Unit }
    val cancelled = synchronized(lock) {
      if (ended) true else { calls.add(call); false }
    }
    if (cancelled) call.cancel()
    return call
  }

  fun dispatch(
    call: PlaudPendingCall,
    code: String,
    message: String,
    current: () -> Boolean = { true },
    operation: () -> Unit
  ) {
    if (!call.isPending) return
    try {
      if (!post {
        if (!call.isPending) return@post
        try {
          if (!current()) call.cancel() else operation()
        } catch (_: SecurityException) {
          call.reject("ERR_PLAUD_PERMISSIONS", "Bluetooth or nearby-device permission is unavailable. Check app permissions and try again.", null)
        } catch (failure: CodedException) {
          call.reject(failure)
        } catch (_: Exception) {
          call.reject(code, message, null)
        }
      }) call.cancel()
    } catch (_: Exception) {
      call.cancel()
    }
  }

  fun destroy() {
    val pending = synchronized(lock) { ended = true; calls.toList() }
    pending.forEach { it.cancel() }
  }
}
