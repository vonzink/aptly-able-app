package expo.modules.plaudsdk

import org.junit.Assert.*
import org.junit.Test

class PlaudExportLifecycleTest {
  @Test fun missingTerminalRejectsCallerButBlocksAnotherExporter() {
    val gate = PlaudExportGate()
    val promise = RecordingPromise()
    var terminal = 0
    var settled = 0
    val export = PlaudExportLifecycle(promise, gate.acquire()!!, { settled++ }, { terminal++ })
    export.stalled()
    assertEquals(listOf("ERR_PLAUD_EXPORT_STALLED"), promise.rejections)
    assertEquals(1, settled)
    assertEquals(0, terminal)
    assertTrue(gate.isBusy())
    assertNull(gate.acquire())
    // The late callback proves work ended, but must not return a stale file to JS.
    export.complete("old-account-file")
    assertFalse(gate.isBusy())
    assertEquals(1, terminal)
    assertTrue(promise.resolutions.isEmpty())
  }

  @Test fun disconnectOrTeardownCannotReleaseNativeOwnership() {
    val gate = PlaudExportGate()
    val promise = RecordingPromise()
    val export = PlaudExportLifecycle(promise, gate.acquire()!!, {}, {})
    export.cancel()
    export.stalled()
    assertEquals(listOf("ERR_PLAUD_CANCELLED"), promise.rejections)
    assertNull(gate.acquire())
    export.failed()
    assertNotNull(gate.acquire())
  }

  @Test fun duplicateTerminalCannotReleaseANewerExport() {
    val gate = PlaudExportGate()
    val promise = RecordingPromise()
    var terminal = 0
    val export = PlaudExportLifecycle(promise, gate.acquire()!!, {}, { terminal++ })
    export.complete("audio-file")
    val second = gate.acquire()!!
    export.failed()
    export.complete("duplicate")
    assertTrue(gate.isBusy())
    assertEquals(listOf("audio-file"), promise.resolutions)
    assertTrue(promise.rejections.isEmpty())
    assertEquals(1, terminal)
    assertTrue(second.finish())
    assertFalse(second.finish())
    assertFalse(gate.isBusy())
  }

  @Test fun throwAfterVendorDispatchRetainsOwnershipUntilTerminal() {
    val gate = PlaudExportGate()
    val promise = RecordingPromise()
    val export = PlaudExportLifecycle(promise, gate.acquire()!!, {}, {})
    export.startFailed()
    assertTrue(gate.isBusy())
    assertEquals(listOf("ERR_PLAUD_EXPORT"), promise.rejections)
    export.failed()
    assertFalse(gate.isBusy())
    assertEquals(1, promise.rejections.size)
  }

  @Test fun teardownDiscardsLateOutputOnceBeforeLeaseRelease() {
    val gate = PlaudExportGate()
    val pendingCalls = PlaudPendingCalls { it(); true }
    val promise = RecordingPromise()
    val export = PlaudExportLifecycle(pendingCalls.track(promise), gate.acquire()!!, {}, {})
    pendingCalls.destroy()
    var discarded = 0
    export.complete("old-file") {
      assertTrue(gate.isBusy())
      discarded++
    }
    // Duplicate callbacks cannot delete a new export's output at the same file path.
    val next = gate.acquire()!!
    export.complete("old-file") { discarded++ }
    assertEquals(1, discarded)
    assertTrue(gate.isBusy())
    assertEquals(listOf("ERR_PLAUD_CANCELLED"), promise.rejections)
    assertTrue(promise.resolutions.isEmpty())
    next.finish()
  }

  @Test fun teardownBetweenInnerSettlementAndOuterDeliveryDiscardsUnderLease() {
    val gate = PlaudExportGate()
    val pendingCalls = PlaudPendingCalls { it(); true }
    val promise = RecordingPromise()
    var discarded = 0
    var terminal = 0
    val export = PlaudExportLifecycle(
      pendingCalls.track(promise),
      gate.acquire()!!,
      // Deterministically destroy after the inner CAS wins, before outer delivery.
      { pendingCalls.destroy() },
      { terminal++ }
    )
    assertTrue(export.isPending)
    export.complete("racing-file") {
      assertTrue(gate.isBusy())
      discarded++
    }
    assertEquals(listOf("ERR_PLAUD_CANCELLED"), promise.rejections)
    assertTrue(promise.resolutions.isEmpty())
    assertEquals(1, discarded)
    assertEquals(1, terminal)
    assertFalse(gate.isBusy())
    export.complete("duplicate") { discarded++ }
    assertEquals(1, discarded)
  }
}
