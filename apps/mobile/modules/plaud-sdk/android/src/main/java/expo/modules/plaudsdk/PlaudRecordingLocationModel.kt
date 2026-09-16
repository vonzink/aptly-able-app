package expo.modules.plaudsdk

internal const val LOCATION_INTERVAL = 30_000L
internal const val LOCATION_HORIZON = 18_000_000L
internal const val LOCATION_RETENTION = 2_592_000_000L

internal fun validLocationIdentifier(value: String) =
  value.isNotBlank() && value.length <= 256 && value.none { it.isISOControl() }

internal data class RecordingLocationSource(val actorId: String, val serial: String, val sessionId: Long) {
  fun validate() {
    require(validLocationIdentifier(actorId) && validLocationIdentifier(serial))
    require(sessionId in 0..9_007_199_254_740_991L)
  }
}

internal data class RecordingLocationPoint(
  val latitude: Double, val longitude: Double, val accuracy: Double, val capturedAt: Long
) {
  fun valid() = latitude.isFinite() && latitude in -90.0..90.0 &&
    longitude.isFinite() && longitude in -180.0..180.0 && accuracy.isFinite() && accuracy in 0.0..1000.0 &&
    capturedAt in 1..9_007_199_254_740_991L
  fun bridge(): Map<String, Any> = mapOf("latitude" to latitude, "longitude" to longitude,
    "accuracy" to accuracy, "capturedAt" to capturedAt)
}

internal data class RecordingLocationSummary(
  val sessionId: Long, val startedAt: Long, val endedAt: Long? = null, val status: String = "recording",
  val reason: String? = null, val points: List<RecordingLocationPoint> = emptyList(), val droppedPoints: Int = 0
) {
  fun bridge(): Map<String, Any?> = mapOf("version" to 1, "sessionId" to sessionId, "startedAt" to startedAt,
    "endedAt" to endedAt, "status" to status, "reason" to reason, "points" to points.map { it.bridge() },
    "droppedPoints" to droppedPoints)
}

internal data class RecordingLocationEntry(
  val source: RecordingLocationSource, val summary: RecordingLocationSummary,
  // Internal stop evidence is separate from shared partial/interrupted coverage status.
  val finalized: Boolean = false
)
internal data class RecordingLocationMarker(val source: RecordingLocationSource, val removedAt: Long)
internal data class RecordingLocationSnapshot(
  val consents: Map<String, Boolean> = emptyMap(),
  val entries: List<RecordingLocationEntry> = emptyList(),
  val markers: List<RecordingLocationMarker> = emptyList()
) {
  // All members are immutable. The boundary copy prevents a caller retaining mutable collections.
  fun copyDeep() = copy(consents = consents.toMap(), entries = entries.map { it.copy(summary = it.summary.copy(points = it.summary.points.toList())) }, markers = markers.toList())
}

internal interface RecordingLocationStore {
  fun read(): RecordingLocationSnapshot
  fun write(snapshot: RecordingLocationSnapshot)
}

/** Pure state machine; the Android adapter serializes every operation on the main thread. */
internal class RecordingLocationModel(private val store: RecordingLocationStore, private val clock: () -> Long) {
  private var snapshot = RecordingLocationSnapshot()
  private var loaded = false
  var actorId: String? = null; private set
  var serial: String? = null; private set
  var generation = 0L; private set
  private var enableGeneration = 0L
  var failure: String? = null; private set
  private var permission = false
  private var armed = false
  private var active: RecordingLocationSource? = null
  private var segmentStartedAt = 0L
  val enabled get() = actorId?.let { snapshot.consents[it] } == true
  val capturing get() = active != null && enabled && permission && armed && failure == null &&
    entry(active!!)?.summary?.status == "recording"
  val currentSource get() = active

  init {
    try {
      val restored = store.read()
      snapshot = restored
      loaded = true
      val retained = prune(restored)
      val reopened = retained.copy(entries = retained.entries.map { entry ->
        if (entry.summary.status in listOf("recording", "paused")) entry.copy(summary = entry.summary.copy(
          status = "interrupted", reason = entry.summary.reason ?: "interrupted", endedAt = clock())) else entry
      })
      store.write(reopened)
      snapshot = reopened
    } catch (_: Exception) { failure = "storage" }
  }

  data class EnablePermit(val actorId: String?, val generation: Long)
  fun beginEnable(): EnablePermit { generation++; enableGeneration++; return EnablePermit(actorId, enableGeneration) }
  fun completeEnable(permit: EnablePermit, granted: Boolean): Boolean {
    if (permit.generation != enableGeneration || permit.actorId == null || permit.actorId != actorId || !granted) return false
    check(failure == null) { "Location storage is unavailable" }
    check(snapshot.consents.size < 1000 || snapshot.consents.containsKey(permit.actorId))
    commit(snapshot.copy(consents = snapshot.consents + (permit.actorId to true)))
    generation++ // A callback observed during the permission prompt cannot start capture.
    return true
  }

  fun setContext(actor: String?, recorder: String?) {
    require(actor == null || validLocationIdentifier(actor))
    require(recorder == null || validLocationIdentifier(recorder))
    require(actor != null || recorder == null)
    if (actor == actorId && recorder == serial) return
    generation++; enableGeneration++
    interrupt("interrupted")
    actorId = actor; serial = recorder; armed = false
  }

  fun disable() {
    generation++; enableGeneration++
    interrupt("off")
    armed = false
    actorId?.let { commit(snapshot.copy(consents = snapshot.consents - it)) }
  }

  fun disconnect() {
    generation++; enableGeneration++
    interrupt("disconnected")
    serial = null; armed = false
  }

  fun sdkReset(actor: String?) {
    generation++; enableGeneration++
    interrupt("interrupted")
    armed = false
    // Same-account init may run after the provider already supplied its context.
    if (actor == null || actor != actorId) { actorId = null; serial = null }
  }

  fun shutdown() { generation++; enableGeneration++; interrupt("interrupted"); actorId = null; serial = null; armed = false }

  fun readiness(hasPermission: Boolean, serviceArmed: Boolean) {
    if (hasPermission != permission || serviceArmed != armed) generation++
    permission = hasPermission; armed = serviceArmed
    if (!permission || !armed) interrupt(if (!permission) "permission" else "background")
  }

  fun start(source: RecordingLocationSource, resume: Boolean = false): Boolean {
    if (runCatching { source.validate() }.isFailure || source.actorId != actorId || source.serial != serial ||
      !enabled || !permission || !armed || failure != null) return false
    tick()
    if (failure != null || snapshot.markers.any { it.source == source }) return false
    val saved = entry(source)
    if (saved?.finalized == true) return false
    val previous = saved?.summary
    if (previous != null && (!resume || previous.status == "recording" || previous.status == "complete" ||
        previous.reason == "limit" || clock() - previous.startedAt >= LOCATION_HORIZON)) return false
    if (active != null && active != source) interrupt("interrupted")
    if (failure != null) return false
    val now = clock()
    val summary = previous?.copy(status = "recording", endedAt = null, reason = previous.reason ?: "interrupted")
      ?: RecordingLocationSummary(source.sessionId, now, reason = if (resume) "interrupted" else null)
    if (!safeCommit(withEntry(RecordingLocationEntry(source, summary)))) return false
    active = source; segmentStartedAt = now
    return true
  }

  fun pause(source: RecordingLocationSource) {
    if (active != source) return
    val current = entry(source) ?: return
    // Duplicate pause cannot rewrite the original gap/time.
    if (current.summary.status != "recording") return
    safeCommit(withEntry(current.copy(summary = current.summary.copy(status = "paused", reason = current.summary.reason ?: "paused"))))
  }

  fun stop(source: RecordingLocationSource) {
    if (active != source) return
    val current = entry(source) ?: return
    active = null
    safeCommit(withEntry(current.copy(finalized = true, summary = current.summary.copy(
      status = if (current.summary.reason == null) "complete" else "interrupted", endedAt = clock()))))
  }

  fun recorderIdle() {
    val source = active ?: return
    val current = entry(source) ?: return
    active = null
    safeCommit(withEntry(current.copy(finalized = true, summary = current.summary.copy(
      status = "interrupted", endedAt = clock(), reason = current.summary.reason ?: "interrupted"))))
  }

  fun interrupt(reason: String) {
    val source = active ?: return
    active = null
    val current = entry(source) ?: return
    safeCommit(withEntry(current.copy(summary = current.summary.copy(status = "interrupted", endedAt = clock(), reason = current.summary.reason ?: reason))))
  }

  fun point(source: RecordingLocationSource, point: RecordingLocationPoint) {
    if (active != source || !capturing) return
    tick()
    if (!capturing) return
    val current = entry(source) ?: return
    val summary = current.summary
    val now = clock()
    if (!point.valid() || point.capturedAt < segmentStartedAt || now - point.capturedAt > 30_000 || point.capturedAt - now > 5000) {
      safeCommit(withEntry(current.copy(summary = summary.copy(droppedPoints = (summary.droppedPoints + 1).coerceAtMost(1_000_000)))))
      return
    }
    // Intentional interval throttling is not evidence of unavailable/invalid GPS.
    if (summary.points.lastOrNull()?.let { point.capturedAt - it.capturedAt < LOCATION_INTERVAL } == true) return
    val next = summary.copy(points = summary.points + point)
    safeCommit(withEntry(current.copy(summary = next)))
    if (next.points.size >= 600) interrupt("limit")
  }

  /** Called by an independent Handler watchdog, including when no fixes arrive or the recorder is paused. */
  fun tick() {
    active?.let { source ->
      entry(source)?.summary?.let { if (clock() - it.startedAt >= LOCATION_HORIZON) interrupt("limit") }
    }
    val next = prune(snapshot)
    if (next != snapshot) safeCommit(next)
  }

  fun get(source: RecordingLocationSource): RecordingLocationSummary? {
    source.validate(); tick()
    return entry(source)?.summary?.copy(points = entry(source)!!.summary.points.toList())
  }

  fun remove(source: RecordingLocationSource) {
    source.validate()
    if (active == source) { active = null; generation++ }
    val now = clock()
    val cleaned = prune(snapshot)
    var markers = cleaned.markers.filterNot { it.source == source }
    if (markers.size >= 1000) {
      val victim = markers.filter { now - it.removedAt > LOCATION_HORIZON }.minByOrNull { it.removedAt }
      if (victim == null) { failure = "storage"; active = null; throw IllegalStateException("Location removal capacity reached") }
      markers = markers - victim
    }
    // No idempotent shortcut: retry must persist even if a previous write failed.
    commit(cleaned.copy(entries = cleaned.entries.filterNot { it.source == source },
      markers = markers + RecordingLocationMarker(source, now)))
  }

  fun clear(actor: String) {
    require(validLocationIdentifier(actor))
    if (actor == actorId) { active = null; generation++; enableGeneration++; armed = false }
    commit(snapshot.copy(consents = snapshot.consents - actor,
      entries = snapshot.entries.filterNot { it.source.actorId == actor }, markers = snapshot.markers.filterNot { it.source.actorId == actor }))
  }

  private fun entry(source: RecordingLocationSource) = snapshot.entries.find { it.source == source }
  private fun withEntry(entry: RecordingLocationEntry): RecordingLocationSnapshot {
    val entries = (snapshot.entries.filterNot { it.source == entry.source } + entry).sortedBy { it.summary.startedAt }.takeLast(100)
    return snapshot.copy(entries = entries)
  }
  private fun prune(value: RecordingLocationSnapshot) = value.copy(
    entries = value.entries.filter { clock() - it.summary.startedAt < LOCATION_RETENTION },
    markers = value.markers.filter { clock() - it.removedAt < LOCATION_RETENTION })

  private fun commit(next: RecordingLocationSnapshot) {
    try {
      check(loaded) { "Location journal has not been safely loaded" }
      store.write(next)
      snapshot = next
      failure = null
    } catch (failure: Exception) {
      this.failure = "storage"; active = null; armed = false
      throw failure
    }
  }
  private fun safeCommit(next: RecordingLocationSnapshot): Boolean = try { commit(next); true } catch (_: Exception) { false }
}
