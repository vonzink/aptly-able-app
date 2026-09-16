import Foundation
import CoreLocation
import UIKit

/// Main-queue only. SDK callbacks reach this helper before their corresponding JS events.
/// Merely creating it or reading status never requests permission or starts location.
final class PlaudRecordingLocation: NSObject, CLLocationManagerDelegate {
  private let emit: ([String: Any?]) -> Void
  private let manager = CLLocationManager()
  private var journal: PlaudLocationJournal?
  private var actorId: String?
  private var serial: String?
  private var connected = false
  private var verifiedSerial: String?
  private var active: PlaudLocationSession?
  private var updating = false
  private var reason = "off"
  private var storageFailed = false
  private var migratedMetadataProtection = false
  private var generation = 0
  private var eligibleAfter = 0.0
  private var consentBlocked = Set<String>()
  private var watchdog: DispatchWorkItem?
  private var observers: [NSObjectProtocol] = []
  private struct PendingPermission {
    let token: PlaudLocationConsentToken
    let enabling: Bool
    let completion: ([String: Any?]) -> Void
  }
  private var pending: PendingPermission?
  private var permissionTimeout: DispatchWorkItem?
  private var now: Double { Date().timeIntervalSince1970 * 1000 }
  private var enabled: Bool { actorId.map { !consentBlocked.contains($0) && journal?.isEnabled(actorId: $0) == true } ?? false }
  private var foreground: Bool { UIApplication.shared.applicationState != .background }
  private var permission: String {
    switch manager.authorizationStatus {
    case .authorizedAlways: return "background"
    case .authorizedWhenInUse: return "foreground"
    case .denied, .restricted: return "denied"
    case .notDetermined: return "undetermined"
    @unknown default: return "denied"
    }
  }
  private var backgroundConfigured: Bool {
    (Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String])?.contains("location") == true
  }

  init(emit: @escaping ([String: Any?]) -> Void) {
    self.emit = emit
    super.init()
    manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    manager.distanceFilter = kCLDistanceFilterNone
    manager.pausesLocationUpdatesAutomatically = false
    manager.showsBackgroundLocationIndicator = true
    do {
      let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("PlaudRecordingLocations", isDirectory: true)
      journal = try PlaudLocationJournal(directory: directory, now: now)
      try protectRecordingMetadata()
    } catch { storageFailed = true; reason = "storage" }
    observers.append(NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
      guard let self = self else { return }
      if self.permission != "background" || !self.backgroundConfigured {
        self.interrupt("background")
      }
      self.publish()
    })
    observers.append(NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
      guard let self = self else { return }
      self.expireIfNeeded()
      self.publish()
    })
  }
  deinit {
    watchdog?.cancel()
    permissionTimeout?.cancel()
    observers.forEach(NotificationCenter.default.removeObserver)
  }

  private func protectRecordingMetadata() throws {
    let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("aptly-recordings-v1", isDirectory: true)
    try PlaudLocationJournal.protectDirectory(directory)
    guard !migratedMetadataProtection else { return }
    if let entries = FileManager.default.enumerator(at: directory, includingPropertiesForKeys: [.isSymbolicLinkKey, .isRegularFileKey]) {
      for case var file as URL in entries {
        let values = try file.resourceValues(forKeys: [.isSymbolicLinkKey, .isRegularFileKey])
        if values.isSymbolicLink == true { entries.skipDescendants(); continue }
        if values.isRegularFile == true && file.lastPathComponent.hasPrefix("metadata-") && file.pathExtension == "json" {
          try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: file.path)
          var exclusion = URLResourceValues()
          exclusion.isExcludedFromBackup = true
          try file.setResourceValues(exclusion)
        }
      }
    }
    migratedMetadataProtection = true
  }
  func status() -> [String: Any?] {
    do { try protectRecordingMetadata() } catch { failStorage() }
    expireIfNeeded()
    let available = permission == "foreground" || permission == "background"
    let currentReason: String
    if storageFailed { currentReason = "storage" }
    else if !enabled { currentReason = "off" }
    else if !available { currentReason = "permission" }
    else if !connected || serial == nil || verifiedSerial != serial { currentReason = "disconnected" }
    else if updating { currentReason = "capturing" }
    else if !foreground && (permission != "background" || !backgroundConfigured) { currentReason = "background" }
    else if ["interrupted", "background", "unavailable"].contains(reason) { currentReason = reason }
    else { currentReason = "ready" }
    // Display durable consent. A failed disable blocks this process immediately,
    // but must leave the switch on with a storage error so the user can retry.
    let savedConsent = actorId.map { journal?.isEnabled(actorId: $0) == true } ?? false
    return ["enabled": savedConsent, "permission": permission,
            "backgroundReady": enabled && permission == "background" && backgroundConfigured && !storageFailed,
            "capturing": updating, "reason": currentReason]
  }
  private func publish() { emit(status()) }

  func setContext(actorId nextActor: String?, serial nextSerial: String?) throws {
    guard nextActor.map(PlaudLocationSource.validIdentifier) ?? true,
          nextSerial.map(PlaudLocationSource.validIdentifier) ?? true,
          nextActor != nil || nextSerial == nil else { throw PlaudLocationStorageError.invalid }
    guard actorId != nextActor || serial != nextSerial else { return }
    generation += 1
    eligibleAfter = now
    interrupt("context-changed")
    actorId = nextActor
    serial = nextSerial
    reason = "off"
    cancelPermission()
    publish()
  }
  func connectionChanged(_ isConnected: Bool) {
    connected = isConnected
    if !isConnected {
      verifiedSerial = nil
      interrupt("disconnected")
    }
    publish()
  }
  func bound(serial boundSerial: String?, success: Bool) {
    let next = success ? boundSerial : nil
    if verifiedSerial != next { interrupt("disconnected") }
    verifiedSerial = next
    publish()
  }
  func sdkInitialized(userId: String?) {
    invalidate()
    if actorId != userId || userId == nil { try? setContext(actorId: nil, serial: nil) }
  }
  func invalidate() {
    generation += 1
    eligibleAfter = now
    connected = false
    verifiedSerial = nil
    interrupt("disconnected")
    cancelPermission()
    publish()
  }

  func setEnabled(_ value: Bool, completion: @escaping ([String: Any?]) -> Void) {
    generation += 1
    cancelPermission()
    guard let actor = actorId else { completion(status()); return }
    if !value {
      consentBlocked.insert(actor)
      interrupt("disabled")
      do {
        guard let journal = journal else { throw PlaudLocationStorageError.invalid }
        try journal.setEnabled(false, actorId: actor)
        try protectRecordingMetadata()
        storageFailed = false
      } catch { failStorage() }
      reason = "off"
      publish()
      completion(status())
      return
    }
    guard let journal = journal, !storageFailed else { completion(status()); return }
    guard foreground else { reason = "background"; completion(status()); return }
    if permission == "foreground" || permission == "background" {
      do { try journal.setEnabled(true, actorId: actor); consentBlocked.remove(actor); eligibleAfter = now; reason = "ready" } catch { failStorage() }
      publish()
      completion(status())
    } else if permission == "undetermined" {
      guard Bundle.main.object(forInfoDictionaryKey: "NSLocationWhenInUseUsageDescription") is String else {
        reason = "permission"; completion(status()); return
      }
      // Consent is only persisted after the requested OS decision, tied to this actor/epoch.
      pending = PendingPermission(token: .init(actorId: actor, generation: generation), enabling: true, completion: completion)
      schedulePermissionTimeout(seconds: 120)
      manager.requestWhenInUseAuthorization()
    } else { reason = "permission"; publish(); completion(status()) }
  }
  func requestBackgroundPermission(completion: @escaping ([String: Any?]) -> Void) {
    cancelPermission()
    guard enabled, !storageFailed, foreground, permission == "foreground", backgroundConfigured,
          let actor = actorId,
          Bundle.main.object(forInfoDictionaryKey: "NSLocationAlwaysAndWhenInUseUsageDescription") is String else {
      completion(status()); return
    }
    pending = PendingPermission(token: .init(actorId: actor, generation: generation), enabling: false, completion: completion)
    // iOS may defer or decline the second prompt without a delegate callback. Return the
    // actual foreground permission if that happens; never claim Always was granted.
    schedulePermissionTimeout(seconds: 15)
    manager.requestAlwaysAuthorization()
  }
  private func schedulePermissionTimeout(seconds: Double) {
    permissionTimeout?.cancel()
    let task = DispatchWorkItem { [weak self] in self?.cancelPermission(); self?.publish() }
    permissionTimeout = task
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: task)
  }
  private func cancelPermission() {
    permissionTimeout?.cancel()
    permissionTimeout = nil
    let previous = pending
    pending = nil
    previous?.completion(status())
  }
  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    if permission != "foreground" && permission != "background" { interrupt("permission") }
    else if !foreground && permission != "background" { interrupt("background") }
    manager.allowsBackgroundLocationUpdates = updating && permission == "background" && backgroundConfigured
    if let request = pending, permission != "undetermined" {
      pending = nil
      permissionTimeout?.cancel()
      if request.enabling && request.token.matches(actorId: actorId, generation: generation) && !storageFailed &&
          (permission == "foreground" || permission == "background") {
        do { try journal?.setEnabled(true, actorId: request.token.actorId); consentBlocked.remove(request.token.actorId); eligibleAfter = now; reason = "ready" } catch { failStorage() }
      }
      request.completion(status())
    }
    publish()
  }

  func start(sessionId: Int, resumed: Bool, observedAt: Double) {
    guard enabled, !storageFailed, connected, verifiedSerial == serial, observedAt >= eligibleAfter,
          let actor = actorId, let serial = serial, let journal = journal else { return }
    let source = PlaudLocationSource(actorId: actor, serial: serial, sessionId: sessionId)
    guard source.isValid, !journal.isSuppressed(source) else { return }
    if active?.source == source && updating { return } // Duplicate callback cannot erase/reset a segment.
    if active?.source != source { interrupt("new-session") }
    do {
      var session = try journal.read(source, now: now) ?? PlaudLocationSession(source: source, observedAt: observedAt, resumedWithoutStart: resumed)
      guard !session.isFinal else { return }
      guard !session.expireIfNeeded(now: now) else { try journal.save(session, now: now); return }
      guard session.beginSegment(at: observedAt, resumed: resumed) else { return }
      active = session
      armWatchdog(for: session)
      guard permission == "foreground" || permission == "background" else { interrupt("permission"); publish(); return }
      guard foreground || (permission == "background" && backgroundConfigured) else { interrupt("background"); publish(); return }
      try protectRecordingMetadata()
      try journal.save(session, now: now)
      manager.allowsBackgroundLocationUpdates = permission == "background" && backgroundConfigured
      updating = true
      reason = "capturing"
      manager.startUpdatingLocation()
      publish()
    } catch { failStorage(); publish() }
  }
  func pause(sessionId: Int, observedAt: Double) {
    guard active?.source.sessionId == sessionId else { return }
    stopUpdates()
    active?.pause(at: observedAt)
    persistActive()
    reason = "interrupted"
    publish()
  }
  func stop(sessionId: Int, observedAt: Double) {
    guard let actor = actorId, let serial = serial, let journal = journal else { return }
    let source = PlaudLocationSource(actorId: actor, serial: serial, sessionId: sessionId)
    guard source.isValid else { return }
    do {
      var session = active?.source == source ? active : try journal.read(source, now: now)
      guard session != nil else { return }
      session?.finish(at: observedAt)
      if active?.source == source { stopUpdates(); watchdog?.cancel(); active = nil }
      try journal.save(session!, now: now)
      reason = "ready"
      publish()
    } catch { failStorage(); publish() }
  }
  private func armWatchdog(for session: PlaudLocationSession) {
    watchdog?.cancel()
    let task = DispatchWorkItem { [weak self] in
      guard let self = self, self.active?.source == session.source else { return }
      self.active?.interrupt(at: session.startedAt + PlaudLocationSession.maximumDuration, reason: "duration-limit")
      self.active?.isFinal = true
      self.stopUpdates()
      self.persistActive()
      self.active = nil
      self.reason = "interrupted"
      self.publish()
    }
    watchdog = task
    DispatchQueue.main.asyncAfter(deadline: .now() + max(0, (session.startedAt + PlaudLocationSession.maximumDuration - now) / 1000), execute: task)
  }
  private func expireIfNeeded() {
    guard active != nil else { return }
    if active!.expireIfNeeded(now: now) {
      stopUpdates()
      persistActive()
      active = nil
      reason = "interrupted"
    }
  }
  private func stopUpdates() {
    manager.stopUpdatingLocation()
    manager.allowsBackgroundLocationUpdates = false
    updating = false
  }
  private func interrupt(_ why: String) {
    stopUpdates()
    watchdog?.cancel()
    if active != nil { active?.interrupt(at: now, reason: why); persistActive(); active = nil }
    reason = why == "background" ? "background" : "interrupted"
  }
  private func persistActive() {
    guard let active = active, !storageFailed else { return }
    do { try journal?.save(active, now: now) } catch { failStorage() }
  }
  private func failStorage() {
    storageFailed = true
    stopUpdates()
    watchdog?.cancel()
    active = nil
    reason = "storage"
  }
  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard updating, enabled, connected, verifiedSerial == serial, !storageFailed, active != nil else { return }
    guard permission == "foreground" || permission == "background" else { interrupt("permission"); publish(); return }
    guard foreground || (permission == "background" && backgroundConfigured) else { interrupt("background"); publish(); return }
    expireIfNeeded()
    guard active != nil else { publish(); return }
    let previousPointCount = active?.points.count
    let previousDroppedCount = active?.droppedPoints
    for location in locations {
      _ = active?.append(.init(latitude: location.coordinate.latitude, longitude: location.coordinate.longitude,
                              accuracy: location.horizontalAccuracy, capturedAt: location.timestamp.timeIntervalSince1970 * 1000), now: now)
    }
    if active?.points.count != previousPointCount || active?.droppedPoints != previousDroppedCount { persistActive() }
  }
  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    if (error as? CLError)?.code == .locationUnknown { return }
    interrupt("unavailable")
    reason = "unavailable"
    publish()
  }
  func recorderIdle() {
    guard active != nil else { return }
    interrupt("recorder-idle")
    publish()
  }
  func read(_ source: PlaudLocationSource) throws -> [String: Any?]? {
    do { try protectRecordingMetadata() } catch { failStorage(); throw error }
    guard let journal = journal, !storageFailed else { throw PlaudLocationStorageError.corrupt }
    expireIfNeeded()
    return try journal.read(source, now: now)?.bridge
  }
  func remove(_ source: PlaudLocationSource) throws {
    guard source.isValid, let journal = journal else { throw PlaudLocationStorageError.invalid }
    if active?.source == source { stopUpdates(); watchdog?.cancel(); active = nil }
    do { try journal.remove(source, now: now) } catch { failStorage(); throw error }
    publish()
  }
  func clear(actorId actor: String) throws {
    guard PlaudLocationSource.validIdentifier(actor), let journal = journal else { throw PlaudLocationStorageError.invalid }
    consentBlocked.insert(actor)
    if actorId == actor {
      generation += 1
      stopUpdates()
      watchdog?.cancel()
      active = nil
      actorId = nil
      serial = nil
      cancelPermission()
    }
    do { try journal.clear(actorId: actor, now: now) } catch { failStorage(); throw error }
    publish()
  }
}
