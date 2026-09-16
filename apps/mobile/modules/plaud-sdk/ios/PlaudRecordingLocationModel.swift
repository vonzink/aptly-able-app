import Foundation

struct PlaudLocationSource: Codable, Hashable {
  let actorId: String
  let serial: String
  let sessionId: Int
  var isValid: Bool {
    Self.validIdentifier(actorId) && Self.validIdentifier(serial) && sessionId >= 0 && sessionId <= 9_007_199_254_740_991
  }
  static func validIdentifier(_ value: String) -> Bool {
    !value.isEmpty && value.utf8.count <= 256 && value == value.trimmingCharacters(in: .whitespacesAndNewlines) &&
      !value.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) })
  }
}

struct PlaudLocationConsentToken {
  let actorId: String
  let generation: Int
  func matches(actorId currentActor: String?, generation currentGeneration: Int) -> Bool {
    currentActor == actorId && currentGeneration == generation
  }
}

struct PlaudLocationPoint: Codable {
  let latitude: Double
  let longitude: Double
  let accuracy: Double
  let capturedAt: Double
  var isValid: Bool {
    latitude.isFinite && longitude.isFinite && accuracy.isFinite && capturedAt.isFinite && capturedAt > 0 &&
      (-90...90).contains(latitude) && (-180...180).contains(longitude) && (0...1000).contains(accuracy)
  }
  var bridge: [String: Any] {
    ["latitude": latitude, "longitude": longitude, "accuracy": accuracy, "capturedAt": capturedAt]
  }
}

/// No SDK or CoreLocation dependency: these rules also run in the standalone Swift tests.
struct PlaudLocationSession: Codable {
  static let maximumDuration = 5.0 * 60 * 60 * 1000
  let source: PlaudLocationSource
  let startedAt: Double
  var endedAt: Double?
  var status = "recording"
  var reason: String?
  var points: [PlaudLocationPoint] = []
  var droppedPoints = 0
  var segmentStartedAt: Double?
  var hasGap = false
  var isFinal = false

  init(source: PlaudLocationSource, observedAt: Double, resumedWithoutStart: Bool) {
    self.source = source
    self.startedAt = observedAt
    self.segmentStartedAt = observedAt
    self.hasGap = resumedWithoutStart
    self.reason = resumedWithoutStart ? "missed-start" : nil
  }
  var isValid: Bool {
    source.isValid && startedAt.isFinite && startedAt > 0 &&
      (endedAt == nil || (endedAt!.isFinite && endedAt! >= startedAt)) &&
      (segmentStartedAt == nil || (segmentStartedAt!.isFinite && segmentStartedAt! >= startedAt)) &&
      ["recording", "paused", "complete", "interrupted"].contains(status) &&
      (reason?.utf8.count ?? 0) <= 100 && points.count <= 600 && (0...1_000_000).contains(droppedPoints) &&
      points.allSatisfy { $0.isValid && $0.capturedAt >= startedAt && $0.capturedAt <= startedAt + Self.maximumDuration + 5000 } &&
      zip(points, points.dropFirst()).allSatisfy { $1.capturedAt - $0.capturedAt >= 30_000 }
  }
  var bridge: [String: Any?] {
    ["version": 1, "sessionId": source.sessionId, "startedAt": startedAt, "endedAt": endedAt,
     "status": status, "reason": reason, "points": points.map(\.bridge), "droppedPoints": droppedPoints]
  }
  @discardableResult mutating func beginSegment(at now: Double, resumed: Bool) -> Bool {
    guard !isFinal, !expireIfNeeded(now: now) else { return false }
    if segmentStartedAt != nil { return true }
    guard resumed else { return false }
    segmentStartedAt = max(now, startedAt)
    endedAt = nil
    status = "recording"
    return true
  }
  mutating func pause(at now: Double) {
    guard !isFinal, segmentStartedAt != nil else { return }
    segmentStartedAt = nil
    status = "paused"
    hasGap = true
    reason = reason ?? "paused"
  }
  mutating func interrupt(at now: Double, reason why: String) {
    guard !isFinal else { return }
    segmentStartedAt = nil
    endedAt = max(now, startedAt, points.last?.capturedAt ?? startedAt)
    status = "interrupted"
    hasGap = true
    if reason == nil || reason == "paused" { reason = why }
  }
  mutating func finish(at now: Double) {
    guard !isFinal else { return }
    segmentStartedAt = nil
    endedAt = max(now, startedAt, points.last?.capturedAt ?? startedAt)
    status = hasGap ? "interrupted" : "complete"
    isFinal = true
  }
  @discardableResult mutating func expireIfNeeded(now: Double) -> Bool {
    guard !isFinal, now - startedAt >= Self.maximumDuration else { return isFinal }
    interrupt(at: startedAt + Self.maximumDuration, reason: "duration-limit")
    isFinal = true
    return true
  }
  @discardableResult mutating func append(_ point: PlaudLocationPoint, now: Double) -> Bool {
    guard !expireIfNeeded(now: now), status == "recording", let segmentStart = segmentStartedAt,
          point.isValid, now.isFinite, point.capturedAt >= segmentStart,
          now - point.capturedAt <= 30_000, point.capturedAt - now <= 5000,
          points.count < 600 else {
      droppedPoints = min(droppedPoints + 1, 1_000_000)
      return false
    }
    // Intentional downsampling is not data loss and must not label a normal route partial.
    if let previous = points.last, point.capturedAt - previous.capturedAt < 30_000 { return false }
    points.append(point)
    return true
  }
}

enum PlaudLocationStorageError: Error { case invalid, corrupt, capacity }

/// One private atomic file; identifiers are data, never filesystem paths. Removed sources
/// remain coordinate-free tombstones for 30 days. A full marker set can evict markers
/// older than the supported five-hour recording horizon; a live marker is never evicted.
final class PlaudLocationJournal {
  private struct Suppression: Codable {
    let source: PlaudLocationSource
    let removedAt: Double
    var isValid: Bool { source.isValid && removedAt.isFinite && removedAt > 0 }
  }
  private struct State: Codable {
    var version = 1
    var sessions: [PlaudLocationSession] = []
    var suppressed: [Suppression] = []
    var enabledActors: [String: Bool] = [:]
  }
  private let directory: URL
  private let file: URL
  private var state: State
  // Failed deletions stay suppressed in memory, but must be retried on disk before
  // any later idempotent operation can report success.
  private var pendingWrite = false
  private let retention = 30.0 * 24 * 60 * 60 * 1000

  init(directory: URL, now: Double) throws {
    self.directory = directory
    self.file = directory.appendingPathComponent("pending-v1.json")
    try Self.protectDirectory(directory)
    if FileManager.default.fileExists(atPath: file.path) {
      let size = try file.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
      guard size <= 12_000_000 else { throw PlaudLocationStorageError.corrupt }
      do { state = try JSONDecoder().decode(State.self, from: Data(contentsOf: file)) }
      catch { throw PlaudLocationStorageError.corrupt }
      guard state.version == 1, state.sessions.count <= 100, state.suppressed.count <= 1000,
            state.enabledActors.count <= 100, state.enabledActors.keys.allSatisfy(PlaudLocationSource.validIdentifier),
            state.sessions.allSatisfy(\.isValid), state.suppressed.allSatisfy(\.isValid),
            Set(state.sessions.map(\.source)).count == state.sessions.count,
            Set(state.suppressed.map(\.source)).count == state.suppressed.count,
            !state.sessions.contains(where: { session in state.suppressed.contains(where: { $0.source == session.source }) }) else {
        throw PlaudLocationStorageError.corrupt
      }
      for index in state.sessions.indices where !state.sessions[index].isFinal {
        state.sessions[index].interrupt(at: now, reason: "app-interrupted")
        _ = state.sessions[index].expireIfNeeded(now: now)
      }
    } else { state = State() }
    try prune(now: now)
    try persist()
  }

  static func protectDirectory(_ directory: URL) throws {
    let manager = FileManager.default
    try manager.createDirectory(at: directory, withIntermediateDirectories: true)
    var url = directory
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try url.setResourceValues(values)
    #if os(iOS)
    try manager.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: directory.path)
    #endif
    guard try directory.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true else {
      throw PlaudLocationStorageError.invalid
    }
  }

  func isSuppressed(_ source: PlaudLocationSource) -> Bool { state.suppressed.contains { $0.source == source } }
  func isEnabled(actorId: String) -> Bool { state.enabledActors[actorId] == true }
  func setEnabled(_ enabled: Bool, actorId: String) throws {
    guard PlaudLocationSource.validIdentifier(actorId) else { throw PlaudLocationStorageError.invalid }
    guard state.enabledActors[actorId] != nil || state.enabledActors.count < 100 else { throw PlaudLocationStorageError.capacity }
    let old = state
    state.enabledActors[actorId] = enabled
    do { try persist() } catch { state = old; throw error }
  }
  func read(_ source: PlaudLocationSource, now: Double) throws -> PlaudLocationSession? {
    guard source.isValid else { throw PlaudLocationStorageError.invalid }
    let pruned = try prune(now: now)
    if pruned || pendingWrite { try persist() }
    return state.sessions.first { $0.source == source }
  }
  func save(_ session: PlaudLocationSession, now: Double) throws {
    guard session.isValid else { throw PlaudLocationStorageError.invalid }
    if isSuppressed(session.source) { return }
    try prune(now: now)
    let old = state
    if let index = state.sessions.firstIndex(where: { $0.source == session.source }) { state.sessions[index] = session }
    else {
      if state.sessions.count == 100 {
        let oldest = state.sessions.enumerated().min { $0.element.startedAt < $1.element.startedAt }!.offset
        try suppress(state.sessions[oldest].source, now: now)
        state.sessions.remove(at: oldest)
      }
      state.sessions.append(session)
    }
    do { try persist() } catch { state = old; throw error }
  }
  func remove(_ source: PlaudLocationSource, now: Double) throws {
    guard source.isValid else { throw PlaudLocationStorageError.invalid }
    let pruned = try prune(now: now)
    if isSuppressed(source) && !state.sessions.contains(where: { $0.source == source }) {
      if pruned || pendingWrite { try persist() }
      return
    }
    try suppress(source, now: now)
    state.sessions.removeAll { $0.source == source }
    // Keep in-memory suppression even if persistence fails; the caller sees the error.
    try persist()
  }
  func clear(actorId: String, now: Double) throws {
    guard PlaudLocationSource.validIdentifier(actorId) else { throw PlaudLocationStorageError.invalid }
    let pruned = try prune(now: now)
    let hadAccount = state.sessions.contains { $0.source.actorId == actorId } ||
      state.suppressed.contains { $0.source.actorId == actorId } || state.enabledActors[actorId] != nil
    state.sessions.removeAll { $0.source.actorId == actorId }
    state.suppressed.removeAll { $0.source.actorId == actorId }
    state.enabledActors.removeValue(forKey: actorId)
    if pruned || hadAccount || pendingWrite { try persist() }
  }
  private func suppress(_ source: PlaudLocationSource, now: Double) throws {
    guard !isSuppressed(source) else { return }
    if state.suppressed.count == 1000 {
      guard let oldest = state.suppressed.enumerated().min(by: { $0.element.removedAt < $1.element.removedAt }),
            now - oldest.element.removedAt > PlaudLocationSession.maximumDuration else { throw PlaudLocationStorageError.capacity }
      state.suppressed.remove(at: oldest.offset)
    }
    state.suppressed.append(.init(source: source, removedAt: now))
  }
  @discardableResult private func prune(now: Double) throws -> Bool {
    let previousMarkers = state.suppressed.count
    state.suppressed.removeAll { now - $0.removedAt > retention }
    let expired = state.sessions.filter { now - $0.startedAt > retention }
    for session in expired { try suppress(session.source, now: now) }
    state.sessions.removeAll { now - $0.startedAt > retention }
    return previousMarkers != state.suppressed.count || !expired.isEmpty
  }
  private func persist() throws {
    pendingWrite = true
    try Self.protectDirectory(directory)
    let data = try JSONEncoder().encode(state)
    #if os(iOS)
    try data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    #else
    try data.write(to: file, options: .atomic)
    #endif
    var url = file
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try url.setResourceValues(values)
    pendingWrite = false
  }
}
