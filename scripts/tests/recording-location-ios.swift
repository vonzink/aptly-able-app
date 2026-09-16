import Foundation

@main struct RecordingLocationIOSTests {
  static func expect(_ result: @autoclosure () throws -> Bool, _ name: String) rethrows {
    if try !result() { fatalError("FAIL: \(name)") }
    print("PASS: \(name)")
  }
  static func main() throws {
    let now = 1_800_000_000_000.0
    let source = PlaudLocationSource(actorId: "actor", serial: "serial", sessionId: 123)
    expect(source.isValid, "valid owner")
    expect(!PlaudLocationSource(actorId: "", serial: "serial", sessionId: 1).isValid, "empty owner rejected")
    expect(!PlaudLocationSource(actorId: "actor", serial: "serial", sessionId: -1).isValid, "invalid session rejected")
    let consent = PlaudLocationConsentToken(actorId: "actor", generation: 1)
    expect(consent.matches(actorId: "actor", generation: 1), "current permission request accepted")
    expect(!consent.matches(actorId: "actor", generation: 2), "disable epoch rejects late permission grant")
    expect(!consent.matches(actorId: nil, generation: 1), "sign-out rejects late permission grant")
    expect(!consent.matches(actorId: "other", generation: 1), "account change rejects late permission grant")
    var session = PlaudLocationSession(source: source, observedAt: now, resumedWithoutStart: false)
    let point = PlaudLocationPoint(latitude: 40, longitude: -105, accuracy: 20, capturedAt: now)
    expect(session.append(point, now: now), "valid first point")
    session.beginSegment(at: now + 1000, resumed: false)
    expect(session.points.count == 1 && session.segmentStartedAt == now, "duplicate start preserves points and segment")
    expect(!session.append(point, now: now + 1000), "sample interval enforced")
    expect(session.droppedPoints == 0, "intentional downsampling is not data loss")
    expect(!session.append(.init(latitude: .nan, longitude: 0, accuracy: 1, capturedAt: now + 31_000), now: now + 31_000), "nonfinite coordinate rejected")
    expect(!session.append(.init(latitude: 91, longitude: 0, accuracy: 1, capturedAt: now + 31_000), now: now + 31_000), "coordinate bounds enforced")
    expect(!session.append(.init(latitude: 1, longitude: 0, accuracy: 1001, capturedAt: now + 31_000), now: now + 31_000), "accuracy enforced")
    expect(!session.append(.init(latitude: 1, longitude: 0, accuracy: 1, capturedAt: now + 40_000), now: now + 31_000), "future point rejected")
    expect(!session.append(.init(latitude: 1, longitude: 0, accuracy: 1, capturedAt: now + 31_000), now: now + 70_000), "stale point rejected")
    session.pause(at: now + 40_000)
    expect(!session.beginSegment(at: now + 50_000, resumed: false) && session.status == "paused", "late duplicate start cannot undo pause")
    session.beginSegment(at: now + 80_000, resumed: true)
    expect(!session.append(.init(latitude: 1, longitude: 0, accuracy: 1, capturedAt: now + 79_999), now: now + 80_000), "pre-resume cached point rejected")
    expect(session.append(.init(latitude: 1, longitude: 0, accuracy: 1, capturedAt: now + 80_000), now: now + 80_000), "resume current point accepted")
    session.interrupt(at: now + 81_000, reason: "disconnected")
    expect(!session.beginSegment(at: now + 85_000, resumed: false) && session.status == "interrupted", "late duplicate start cannot undo interruption")
    session.beginSegment(at: now + 90_000, resumed: true)
    session.finish(at: now + 100_000)
    expect(session.status == "interrupted" && session.reason == "disconnected", "interruption remains terminal partial after stop")
    var paused = PlaudLocationSession(source: source, observedAt: now, resumedWithoutStart: false)
    paused.pause(at: now + 1)
    paused.finish(at: now + 2)
    expect(paused.status == "interrupted" && paused.reason == "paused", "pause gap remains visible after stop")
    var timed = PlaudLocationSession(source: source, observedAt: now, resumedWithoutStart: false)
    expect(timed.expireIfNeeded(now: now + PlaudLocationSession.maximumDuration), "watchdog expires with zero samples")
    expect(timed.status == "interrupted" && timed.reason == "duration-limit", "watchdog has terminal reason")
    var bounded = PlaudLocationSession(source: source, observedAt: now, resumedWithoutStart: false)
    for i in 0..<600 { _ = bounded.append(.init(latitude: 1, longitude: 1, accuracy: 1, capturedAt: now + Double(i) * 30_000), now: now + Double(i) * 30_000) }
    expect(bounded.points.count == 600, "sample limit allows 600")
    expect(!bounded.append(.init(latitude: 1, longitude: 1, accuracy: 1, capturedAt: now + 18_000_000), now: now + 18_000_000), "sample limit never exceeds 600")
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let journal = try PlaudLocationJournal(directory: directory, now: now)
    try journal.save(session, now: now)
    try expect(try journal.read(source, now: now)?.points.count == 2, "journal roundtrip")
    let other = PlaudLocationSource(actorId: "other", serial: "serial", sessionId: 123)
    try expect(try journal.read(other, now: now) == nil, "cross-account read returns none")
    try journal.remove(source, now: now)
    expect(journal.isSuppressed(source), "removal creates suppression")
    try journal.save(PlaudLocationSession(source: source, observedAt: now + 1, resumedWithoutStart: true), now: now + 1)
    try expect(try journal.read(source, now: now + 1) == nil, "late resume cannot restore removed coordinates")
    let file = directory.appendingPathComponent("pending-v1.json")
    let untouched = Date(timeIntervalSince1970: 12345)
    try FileManager.default.setAttributes([.modificationDate: untouched], ofItemAtPath: file.path)
    _ = try journal.read(source, now: now + 1)
    try journal.remove(source, now: now + 1)
    let modified = try FileManager.default.attributesOfItem(atPath: file.path)[.modificationDate] as? Date
    expect(modified == untouched, "read and duplicate remove avoid redundant journal writes")
    let reopened = try PlaudLocationJournal(directory: directory, now: now + 1)
    expect(reopened.isSuppressed(source), "suppression survives restart")
    try reopened.setEnabled(true, actorId: "actor")
    expect(reopened.isEnabled(actorId: "actor") && !reopened.isEnabled(actorId: "other"), "consent scoped per account")
    try reopened.clear(actorId: "actor", now: now + 2)
    expect(!reopened.isEnabled(actorId: "actor") && !reopened.isSuppressed(source), "account clear removes consent and suppression markers")
    // A filesystem outage must not make the next deletion a successful in-memory no-op.
    let backup = directory.appendingPathExtension("backup")
    func outage(_ operation: () throws -> Void) throws {
      try FileManager.default.moveItem(at: directory, to: backup)
      try Data("blocked".utf8).write(to: directory)
      defer {
        try? FileManager.default.removeItem(at: directory)
        try? FileManager.default.moveItem(at: backup, to: directory)
      }
      do { try operation(); fatalError("write outage was ignored") }
      catch { print("PASS: write outage reported") }
    }
    try reopened.save(session, now: now)
    try outage { try reopened.remove(source, now: now + 3) }
    try reopened.remove(source, now: now + 4)
    let afterRemoveRetry = try PlaudLocationJournal(directory: directory, now: now + 5)
    try expect(try afterRemoveRetry.read(source, now: now + 5) == nil && afterRemoveRetry.isSuppressed(source), "removal retry persists before reporting success")
    try reopened.setEnabled(true, actorId: "actor")
    try outage { try reopened.clear(actorId: "actor", now: now + 6) }
    try reopened.clear(actorId: "actor", now: now + 7)
    let afterClearRetry = try PlaudLocationJournal(directory: directory, now: now + 8)
    expect(!afterClearRetry.isEnabled(actorId: "actor") && !afterClearRetry.isSuppressed(source), "account clear retry persists consent and marker deletion")
    let recoveredSource = PlaudLocationSource(actorId: "other", serial: "serial", sessionId: 9)
    try reopened.save(PlaudLocationSession(source: recoveredSource, observedAt: now, resumedWithoutStart: false), now: now)
    let recovered = try PlaudLocationJournal(directory: directory, now: now + 2000)
    try expect(try recovered.read(recoveredSource, now: now + 2000)?.status == "interrupted", "crash recovery marks unfinished capture partial")
    for id in 200..<302 {
      let boundedSource = PlaudLocationSource(actorId: "other", serial: "serial", sessionId: id)
      try recovered.save(.init(source: boundedSource, observedAt: now + Double(id), resumedWithoutStart: false), now: now + 3000)
    }
    let evicted = PlaudLocationSource(actorId: "other", serial: "serial", sessionId: 200)
    try expect(try recovered.read(evicted, now: now + 3000) == nil, "pending journal bounded to 100 sessions")
    expect(recovered.isSuppressed(evicted), "evicted location cannot be restored by late resume")
    let expirySource = PlaudLocationSource(actorId: "expiry-owner", serial: "serial", sessionId: 999)
    try recovered.remove(expirySource, now: now)
    expect(recovered.isSuppressed(expirySource), "expiry fixture has persisted suppression")
    let expiry = now + 31 * 24 * 60 * 60 * 1000
    let aged = try PlaudLocationJournal(directory: directory, now: expiry)
    expect(!aged.isSuppressed(expirySource), "old tombstones expire instead of lifetime feature exhaustion")
    try expect(try aged.read(recoveredSource, now: expiry) == nil, "pending points expire after 30 days")
    try Data("bad json".utf8).write(to: directory.appendingPathComponent("pending-v1.json"))
    do { _ = try PlaudLocationJournal(directory: directory, now: now); fatalError("corrupt journal accepted") }
    catch { print("PASS: corrupt journal fails safely") }
    print("All iOS location tests passed")
  }
}
