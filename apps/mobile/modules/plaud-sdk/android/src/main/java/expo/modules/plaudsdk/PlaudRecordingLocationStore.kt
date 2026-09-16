package expo.modules.plaudsdk

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest

/**
 * One atomic manifest is the commit point. Immutable, content-addressed session blobs keep
 * each sample write small, and let account deletion replace the index in a single commit.
 * The entire directory lives in noBackupFilesDir. Caller IDs never become path components.
 */
internal class RecordingLocationFileStore(private val index: File) : RecordingLocationStore {
  private val gson = Gson().newBuilder().serializeNulls().create()
  private val blobs get() = File(index.parentFile, "sessions")
  private var committedBlobs: Set<String> = emptySet()
  private var cachedEntries: Map<RecordingLocationSource, Pair<RecordingLocationEntry, String>> = emptyMap()

  override fun read(): RecordingLocationSnapshot {
    if (!index.exists()) {
      // No committed index means all leftover blobs are from an incomplete first write.
      cleanup(emptySet())
      return RecordingLocationSnapshot()
    }
    val root = json(index, 512_000)
    require(root.number("version") == 1L)
    val consents = root.getAsJsonObject("consents").entrySet().associate { (actor, value) ->
      require(validLocationIdentifier(actor) && value.isJsonPrimitive && value.asJsonPrimitive.isBoolean)
      actor to value.asBoolean
    }
    require(consents.size <= 1000)
    val names = mutableSetOf<String>()
    val cache = mutableMapOf<RecordingLocationSource, Pair<RecordingLocationEntry, String>>()
    val entries = root.getAsJsonArray("entries").map { item ->
      val row = item.asJsonObject
      val source = source(row.getAsJsonObject("source"))
      val name = row.get("blob").asString
      require(name.matches(Regex("[0-9a-f]{64}\\.json")))
      names.add(name)
      val content = json(File(blobs, name), 160_000)
      require(source(content.getAsJsonObject("source")) == source)
      val finalized = content.get("finalized")?.let {
        require(it.isJsonPrimitive && it.asJsonPrimitive.isBoolean); it.asBoolean
      } ?: false
      RecordingLocationEntry(source, summary(content.getAsJsonObject("summary"), source), finalized).also {
        require(!finalized || it.summary.status in listOf("complete", "interrupted"))
        cache[source] = it to name
      }
    }
    val markers = root.getAsJsonArray("markers").map { item ->
      val row = item.asJsonObject
      val removedAt = row.number("removedAt"); require(validTime(removedAt))
      RecordingLocationMarker(source(row.getAsJsonObject("source")), removedAt)
    }
    require(entries.size <= 100 && entries.map { it.source }.distinct().size == entries.size)
    require(markers.size <= 1000 && markers.map { it.source }.distinct().size == markers.size)
    require(entries.none { entry -> markers.any { it.source == entry.source } })
    cleanup(names)
    committedBlobs = names
    cachedEntries = cache
    return RecordingLocationSnapshot(consents, entries, markers)
  }

  override fun write(snapshot: RecordingLocationSnapshot) {
    check(index.parentFile?.let { it.isDirectory || it.mkdirs() } == true)
    check(blobs.isDirectory || blobs.mkdirs())
    val names = mutableSetOf<String>()
    val cache = mutableMapOf<RecordingLocationSource, Pair<RecordingLocationEntry, String>>()
    try {
      val entries = snapshot.entries.map { entry ->
        val cached = cachedEntries[entry.source]
        if (cached != null && cached.first == entry) {
          names.add(cached.second); cache[entry.source] = cached
          return@map mapOf("source" to entry.source, "blob" to cached.second)
        }
        val encoded = gson.toJson(mapOf("source" to entry.source, "summary" to entry.summary.bridge(), "finalized" to entry.finalized)).toByteArray(Charsets.UTF_8)
        check(encoded.size <= 160_000)
        val name = MessageDigest.getInstance("SHA-256").digest(encoded).joinToString("") { "%02x".format(it) } + ".json"
        names.add(name)
        cache[entry.source] = entry to name
        val blob = File(blobs, name)
        if (!blob.exists()) atomicWrite(blob, encoded)
        mapOf("source" to entry.source, "blob" to name)
      }
      val encoded = gson.toJson(mapOf("version" to 1, "consents" to snapshot.consents,
        "entries" to entries, "markers" to snapshot.markers)).toByteArray(Charsets.UTF_8)
      check(encoded.size <= 512_000)
      atomicWrite(index, encoded)
      committedBlobs = names
      cachedEntries = cache
    } catch (failure: Exception) {
      cleanup(committedBlobs)
      throw failure
    }
    // The new index is already durable. Unreferenced blobs are never read or resurrected.
    cleanup(names)
  }

  private fun atomicWrite(file: File, bytes: ByteArray) {
    val temporary = File(file.parentFile, file.name + ".tmp")
    try {
      FileOutputStream(temporary).use { it.write(bytes); it.fd.sync() }
      // Same-directory rename is atomic on Android's app-private filesystem.
      check(temporary.renameTo(file)) { "Location journal could not be committed" }
    } finally { temporary.delete() }
  }

  private fun cleanup(keep: Set<String>) {
    if (!blobs.exists()) return
    val files = checkNotNull(blobs.listFiles()) { "Location points could not be inspected for removal" }
    files.forEach { if (it.name !in keep) check(it.delete()) { "Location points could not be removed" } }
  }
  private fun json(file: File, limit: Long): JsonObject {
    require(file.length() in 1..limit)
    return JsonParser.parseString(file.readText(Charsets.UTF_8)).asJsonObject
  }
  private fun JsonObject.number(name: String): Long {
    val value = get(name)
    require(value.isJsonPrimitive && value.asJsonPrimitive.isNumber)
    val decimal = value.asBigDecimal
    return decimal.longValueExact()
  }
  private fun validTime(time: Long) = time in 1..9_007_199_254_740_991L
  private fun source(value: JsonObject) = RecordingLocationSource(value.get("actorId").asString,
    value.get("serial").asString, value.number("sessionId")).also { it.validate() }
  private fun summary(value: JsonObject, source: RecordingLocationSource): RecordingLocationSummary {
    require(value.number("version") == 1L && value.number("sessionId") == source.sessionId)
    val started = value.number("startedAt"); require(validTime(started))
    val ended = if (value.get("endedAt").isJsonNull) null else value.number("endedAt")
    require(ended == null || (validTime(ended) && ended >= started))
    val status = value.get("status").asString
    require(status in listOf("recording", "paused", "complete", "interrupted"))
    require((status in listOf("recording", "paused")) == (ended == null))
    val reason = if (value.get("reason").isJsonNull) null else value.get("reason").asString
    require(reason == null || reason.length in 1..64)
    val dropped = value.number("droppedPoints"); require(dropped in 0..1_000_000)
    val points = value.getAsJsonArray("points").map { item ->
      val p = item.asJsonObject
      RecordingLocationPoint(p.get("latitude").asDouble, p.get("longitude").asDouble,
        p.get("accuracy").asDouble, p.number("capturedAt")).also {
        require(it.valid() && it.capturedAt >= started && (ended == null || it.capturedAt <= ended + 5000))
      }
    }
    require(points.size <= 600 && points.zipWithNext().all { (a, b) -> b.capturedAt - a.capturedAt >= LOCATION_INTERVAL })
    return RecordingLocationSummary(source.sessionId, started, ended, status, reason, points, dropped.toInt())
  }
}
