package expo.modules.plaudsdk

import expo.modules.kotlin.Promise
import org.junit.Assert.*
import org.junit.Test

internal class RecordingPromise : Promise {
  val resolutions = mutableListOf<Any?>()
  val rejections = mutableListOf<String?>()
  override fun resolve(value: Any?) { resolutions.add(value) }
  override fun reject(code: String?, message: String?, cause: Throwable?) { rejections.add(code) }
}

class PlaudPendingCallsTest {
  private val queued = ArrayDeque<() -> Unit>()
  private val calls = PlaudPendingCalls { queued.addLast(it); true }
  private fun drain() { while (queued.isNotEmpty()) queued.removeFirst().invoke() }

  @Test fun revokedPermissionInsideAdapterOrSdkCallRejectsInsteadOfEscapingMainQueue() {
    val promise = RecordingPromise()
    val call = calls.track(promise)
    calls.dispatch(call, "ERR_PLAUD_SCAN", "Scan failed") { throw SecurityException("revoked") }
    drain()
    assertEquals(listOf("ERR_PLAUD_PERMISSIONS"), promise.rejections)
    assertTrue(promise.resolutions.isEmpty())
  }

  @Test fun sdkRuntimeExceptionIsContainedAndSanitized() {
    val promise = RecordingPromise()
    val call = calls.track(promise)
    calls.dispatch(call, "ERR_PLAUD_SCAN", "Scan failed") { error("vendor state") }
    drain()
    assertEquals(listOf("ERR_PLAUD_SCAN"), promise.rejections)
  }

  @Test fun stopBeforePermissionResultPreventsScan() {
    val promise = RecordingPromise()
    val call = calls.track(promise)
    var epoch = 1
    var starts = 0
    calls.dispatch(call, "ERR_PLAUD_SCAN", "Scan failed", { epoch == 1 }) { starts++; call.resolve(null) }
    epoch++
    drain()
    assertEquals(0, starts)
    assertEquals(listOf("ERR_PLAUD_CANCELLED"), promise.rejections)
  }

  @Test fun duplicatePermissionResultExecutesSdkOnce() {
    val promise = RecordingPromise()
    val call = calls.track(promise)
    var starts = 0
    repeat(2) {
      calls.dispatch(call, "ERR_PLAUD_SCAN", "Scan failed") { starts++; call.resolve(null) }
    }
    drain()
    assertEquals(1, starts)
    assertEquals(1, promise.resolutions.size)
  }

  @Test fun destroySettlesWaitingPermissionsWithoutNeedingACallback() {
    val promise = RecordingPromise()
    val call = calls.track(promise)
    calls.destroy()
    call.resolve(true)
    call.reject("late", "late", null)
    assertEquals(listOf("ERR_PLAUD_CANCELLED"), promise.rejections)
    assertTrue(promise.resolutions.isEmpty())
  }

  @Test fun destroyDiscardsQueuedSdkWorkAndRejectsNewCalls() {
    val promise = RecordingPromise()
    val call = calls.track(promise)
    var invocations = 0
    calls.dispatch(call, "ERR_PLAUD_SCAN", "Scan failed") { invocations++; call.resolve(null) }
    calls.destroy()
    drain()
    val late = RecordingPromise()
    calls.track(late)
    assertEquals(0, invocations)
    assertEquals(listOf("ERR_PLAUD_CANCELLED"), promise.rejections)
    assertEquals(listOf("ERR_PLAUD_CANCELLED"), late.rejections)
  }

  @Test fun rejectedMainQueueSettlesOnce() {
    val unavailable = PlaudPendingCalls { false }
    val promise = RecordingPromise()
    val call = unavailable.track(promise)
    unavailable.dispatch(call, "ERR_PLAUD_SCAN", "Scan failed") { fail("SDK must not run") }
    unavailable.destroy()
    assertEquals(listOf("ERR_PLAUD_CANCELLED"), promise.rejections)
  }
}
