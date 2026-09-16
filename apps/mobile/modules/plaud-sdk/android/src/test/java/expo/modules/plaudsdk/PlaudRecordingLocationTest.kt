package expo.modules.plaudsdk

import java.io.File
import org.junit.Assert.*
import org.junit.Test

class PlaudRecordingLocationTest {
  private var now = 1_800_000_000_000L
  private val source = RecordingLocationSource("actor-a", "recorder-a", 123)
  private fun model(store: RecordingLocationStore = MemoryLocationStore()) =
    RecordingLocationModel(store) { now }.apply {
      setContext(source.actorId, source.serial)
    }
  private fun enable(model: RecordingLocationModel) {
    assertTrue(model.completeEnable(model.beginEnable(), true))
    model.readiness(true, true)
  }
  private fun point(at: Long = now, lat: Double = 40.0, lon: Double = -105.0, accuracy: Double = 10.0) =
    RecordingLocationPoint(lat, lon, accuracy, at)

  @Test fun consentIsOffPerActorAndEnableCannotResumeExistingRecording() {
    val m = model()
    assertFalse(m.start(source))
    enable(m)
    assertFalse(m.capturing)
    assertTrue(m.start(source))
    m.disable()
    assertFalse(m.capturing)
    enable(m)
    assertFalse(m.start(source))
    assertFalse(m.capturing)
    m.setContext("actor-b", source.serial)
    assertFalse(m.enabled)
  }

  @Test fun permissionCompletionCannotEnableChangedContextOrOverrideDisable() {
    val m = model()
    val permit = m.beginEnable()
    m.setContext("actor-b", source.serial)
    assertFalse(m.completeEnable(permit, true))
    assertFalse(m.enabled)
    val second = m.beginEnable()
    m.disable()
    assertFalse(m.completeEnable(second, true))
    assertFalse(m.enabled)
    assertFalse(m.completeEnable(m.beginEnable(), false))
  }

  @Test fun consentWorksWhileUnpairedButDoesNotArmOrCapture() {
    val m = model()
    m.setContext(source.actorId, null)
    enable(m)
    assertTrue(m.enabled)
    assertFalse(m.start(source))
  }

  @Test fun duplicatesPreservePointsAndStartCannotUndoPause() {
    val m = model(); enable(m); assertTrue(m.start(source)); m.point(source, point())
    val started = m.get(source)!!.startedAt
    now += 40_000
    assertFalse(m.start(source))
    assertEquals(started, m.get(source)!!.startedAt)
    assertEquals(1, m.get(source)!!.points.size)
    m.pause(source)
    assertFalse(m.start(source))
    assertFalse(m.capturing)
    assertTrue(m.start(source, resume = true))
    assertFalse(m.start(source, resume = true))
    m.stop(source)
    assertEquals("interrupted", m.get(source)!!.status)
    assertNotNull(m.get(source)!!.reason)
  }

  @Test fun pointsRejectOldInvalidAndPreSegmentDataButThrottleIsNotDropped() {
    val m = model(); enable(m); m.start(source)
    m.point(source, point(lat = Double.NaN)); m.point(source, point(lon = 181.0))
    m.point(source, point(accuracy = -1.0)); m.point(source, point(accuracy = 1000.1))
    m.point(source, point(at = now + 5001)); m.point(source, point(at = now - 1))
    m.point(source, point(accuracy = 1000.0))
    now += 29_999; m.point(source, point())
    assertEquals(1, m.get(source)!!.points.size)
    assertEquals(6, m.get(source)!!.droppedPoints)
    now += 1; m.point(source, point())
    assertEquals(2, m.get(source)!!.points.size)
    now += 60_001; m.point(source, point(at = now - 30_001))
    assertEquals(7, m.get(source)!!.droppedPoints)
    m.pause(source); now += 40_000; m.start(source, resume = true)
    m.point(source, point(at = now - 1))
    assertEquals(8, m.get(source)!!.droppedPoints)
  }

  @Test fun validBoundaryCoordinatesTimesAndAccuracyAreAccepted() {
    val m = model(); enable(m); m.start(source)
    m.point(source, point(at = now + 5000, lat = -90.0, lon = 180.0, accuracy = 0.0))
    now += 65_000
    m.point(source, point(at = now - 30_000, lat = 90.0, lon = -180.0))
    assertEquals(2, m.get(source)!!.points.size)
    assertEquals(0, m.get(source)!!.droppedPoints)
  }

  @Test fun wrongOwnerSerialSessionAndStaleSourceCannotWritePauseStopOrRead() {
    val m = model(); enable(m); m.start(source)
    for (other in listOf(source.copy(actorId = "actor-b"), source.copy(serial = "recorder-b"), source.copy(sessionId = 124))) {
      m.point(other, point()); m.pause(other); m.stop(other)
      assertTrue(m.capturing)
      assertNull(m.get(other))
    }
    assertEquals(0, m.get(source)!!.points.size)
    m.setContext("actor-b", "recorder-b"); enable(m)
    assertFalse(m.start(source, resume = true))
  }

  @Test fun everyStopGuardInterruptsAndNewReadinessNeverRestartsSampling() {
    val guards: List<(RecordingLocationModel) -> Unit> = listOf(
      { it.disable() }, { it.setContext(null, null) }, { it.disconnect() },
      { it.sdkReset(source.actorId) }, { it.shutdown() },
      { it.readiness(false, true) }, { it.readiness(true, false) }, { it.interrupt("unavailable") }
    )
    for (guard in guards) {
      val m = model(); enable(m); m.start(source); m.point(source, point())
      guard(m)
      assertFalse(m.capturing)
      assertEquals("interrupted", m.get(source)!!.status)
      m.readiness(true, true)
      assertFalse(m.capturing)
    }
  }

  @Test fun watchdogStopsAtFiveHoursWithoutWaitingForPointAndPointLimitStopsAt600() {
    val m = model(); enable(m); m.start(source)
    now += 18_000_000; m.tick()
    assertFalse(m.capturing)
    assertEquals("limit", m.get(source)!!.reason)
    val second = source.copy(sessionId = 124); m.start(second)
    repeat(600) { m.point(second, point()); now += 30_000 }
    assertFalse(m.capturing)
    assertEquals(600, m.get(second)!!.points.size)
  }

  @Test fun reopeningActiveAndPausedEntriesIsInterruptedAndNeverCapturing() {
    val store = MemoryLocationStore()
    val m = model(store); enable(m); m.start(source); m.point(source, point())
    val recovered = model(store)
    assertTrue(recovered.enabled)
    assertFalse(recovered.capturing)
    assertEquals("interrupted", recovered.get(source)!!.status)
    assertEquals("interrupted", recovered.get(source)!!.reason)
    assertEquals(1, recovered.get(source)!!.points.size)
  }

  @Test fun removalIsDurableSuppressionAndClearIsScopedEvenAfterSignout() {
    val dir = java.nio.file.Files.createTempDirectory("recording-location-test").toFile()
    try {
      val store = RecordingLocationFileStore(File(dir, "journal.json"))
      val m = model(store); enable(m); m.start(source); m.point(source, point()); m.remove(source)
      assertNull(m.get(source)); assertFalse(m.capturing); assertFalse(m.start(source, resume = true))
      val recovered = model(store); enable(recovered)
      assertFalse(recovered.start(source)); assertFalse(recovered.start(source, resume = true))
      val other = source.copy(actorId = "actor-b")
      recovered.setContext(other.actorId, other.serial); enable(recovered); recovered.start(other); recovered.stop(other)
      recovered.setContext(null, null); recovered.clear(source.actorId)
      assertNotNull(recovered.get(other))
      recovered.setContext(source.actorId, source.serial); assertFalse(recovered.enabled)
    } finally { dir.deleteRecursively() }
  }

  @Test fun journalsExpireAtThirtyDaysAndBoundPendingSessionsAt100() {
    val m = model(); enable(m)
    repeat(105) { id -> val s = source.copy(sessionId = id.toLong()); m.start(s); m.stop(s); now++ }
    assertNull(m.get(source.copy(sessionId = 0)))
    assertNotNull(m.get(source.copy(sessionId = 104)))
    now += 2_592_000_000; m.tick()
    assertNull(m.get(source.copy(sessionId = 104)))
  }

  @Test fun tombstoneCapacityNeverEvictsAnActiveHorizonMarker() {
    val m = model(); enable(m)
    repeat(1000) { m.remove(source.copy(sessionId = it.toLong())) }
    assertThrows(Exception::class.java) { m.remove(source.copy(sessionId = 1001)) }
    assertFalse(m.capturing)
    assertFalse(m.start(source))
    now += 18_000_001
    m.remove(source.copy(sessionId = 1001))
    assertFalse(m.start(source.copy(sessionId = 1001)))
  }

  @Test fun corruptAndFailedStorageStopCaptureWithoutThrowingFromDeviceCallbacks() {
    val store = MemoryLocationStore(); val m = model(store); enable(m); m.start(source)
    store.failWrites = true
    m.point(source, point())
    assertFalse(m.capturing)
    assertEquals("storage", m.failure)
    val corrupt = RecordingLocationModel(object : RecordingLocationStore {
      override fun read(): RecordingLocationSnapshot = throw IllegalStateException("bad data")
      override fun write(snapshot: RecordingLocationSnapshot) = Unit
    }) { now }
    assertEquals("storage", corrupt.failure)
    assertFalse(corrupt.capturing)
  }

  @Test fun failedRemoveAndClearMustRetryDurableWritesBeforeReportingSuccess() {
    val store = MemoryLocationStore(); val m = model(store); enable(m); m.start(source); m.point(source, point())
    store.failWrites = true
    assertThrows(Exception::class.java) { m.remove(source) }
    store.failWrites = false
    m.remove(source)
    val restored = model(store); enable(restored)
    assertNull(restored.get(source)); assertFalse(restored.start(source, resume = true))
    val second = source.copy(sessionId = 888)
    restored.start(second); restored.point(second, point())
    store.failWrites = true
    assertThrows(Exception::class.java) { restored.clear(source.actorId) }
    store.failWrites = false
    restored.clear(source.actorId)
    val cleared = model(store)
    assertNull(cleared.get(second)); assertFalse(cleared.enabled)
  }

  @Test fun failedDisableKeepsDurableConsentButBlocksCaptureAndCanRetry() {
    val store = MemoryLocationStore(); val m = model(store); enable(m); m.start(source)
    store.failWrites = true
    assertThrows(Exception::class.java) { m.disable() }
    assertTrue(m.enabled); assertFalse(m.capturing); assertEquals("storage", m.failure)
    store.failWrites = false
    m.disable()
    assertFalse(m.enabled); assertFalse(model(store).enabled)
  }

  @Test fun corruptStoreCannotBeOverwrittenByScopedDeletion() {
    val dir = java.nio.file.Files.createTempDirectory("recording-location-test").toFile()
    try {
      val file = File(dir, "journal.json"); file.writeText("corrupt index")
      val m = model(RecordingLocationFileStore(file))
      assertThrows(Exception::class.java) { m.clear(source.actorId) }
      assertEquals("corrupt index", file.readText())
    } finally { dir.deleteRecursively() }
  }

  @Test fun stoppedPartialSessionCannotResumeEvenAfterReopeningJournal() {
    val store = MemoryLocationStore(); val m = model(store); enable(m); m.start(source)
    m.pause(source); m.stop(source)
    assertEquals("interrupted", m.get(source)!!.status)
    assertFalse(m.start(source, resume = true))
    val reopened = model(store); enable(reopened)
    assertFalse(reopened.start(source, resume = true))
  }

  @Test fun enableAndNewServiceArmInvalidateCallbacksObservedBeforeEligibility() {
    val m = model(); val permit = m.beginEnable(); val pendingGeneration = m.generation
    assertTrue(m.completeEnable(permit, true))
    assertNotEquals(pendingGeneration, m.generation)
    val unarmedGeneration = m.generation
    m.readiness(true, true)
    assertNotEquals(unarmedGeneration, m.generation)
    val armedGeneration = m.generation
    m.readiness(true, true)
    assertEquals(armedGeneration, m.generation)
  }

  @Test fun confirmedIdleStopsWithoutStopCallbackAndPreservesGapEvidence() {
    val m = model(); enable(m); m.start(source); m.point(source, point())
    m.recorderIdle()
    assertFalse(m.capturing); assertEquals("interrupted", m.get(source)!!.status)
    assertNotNull(m.get(source)!!.reason)
    assertFalse(m.start(source, resume = true))
  }

  @Test fun ownPermissionGrantCannotCancelEnableWhenPermissionObserverRunsFirst() {
    val m = model(); val permit = m.beginEnable()
    val beforeGrant = m.generation
    m.readiness(true, false)
    assertNotEquals(beforeGrant, m.generation)
    assertTrue(m.completeEnable(permit, true))
    assertTrue(m.enabled); assertFalse(m.capturing)
  }

  @Test fun invalidSourcesAndCorruptSerializedValuesAreRejected() {
    val m = model()
    assertThrows(IllegalArgumentException::class.java) { m.get(source.copy(actorId = "")) }
    assertThrows(IllegalArgumentException::class.java) { m.remove(source.copy(sessionId = -1)) }
    val dir = java.nio.file.Files.createTempDirectory("recording-location-test").toFile()
    try {
      val file = File(dir, "journal.json"); file.writeText("{\"version\":1,\"consents\":{},\"entries\":null,\"markers\":[]}")
      val corrupt = model(RecordingLocationFileStore(file))
      assertEquals("storage", corrupt.failure)
      assertFalse(corrupt.start(source))
    } finally { dir.deleteRecursively() }
  }

  private class MemoryLocationStore : RecordingLocationStore {
    private var saved = RecordingLocationSnapshot()
    var failWrites = false
    override fun read() = saved.copyDeep()
    override fun write(snapshot: RecordingLocationSnapshot) {
      if (failWrites) throw IllegalStateException("disk full")
      saved = snapshot.copyDeep()
    }
  }
}
