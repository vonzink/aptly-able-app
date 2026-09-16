# Recording Location Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for isolated native tasks; root owns shared integration and final review.

**Goal:** An opt-in Settings switch makes confirmed Plaud recording callbacks capture local phone coordinates and attach them to the correct recording.
**Architecture:** Independent native capture and durable pending journals feed a validated shared recording model. Failure to locate never fails audio transfer.
**Tech Stack:** React Native/Expo, Swift Core Location, Kotlin LocationManager/foreground service, Vitest, native unit checks.
**Spec:** docs/superpowers/specs/2026-09-16-recording-location-design.md

## Global Constraints
No server location upload. Off by default, explicit per-account consent. No location capture outside confirmed recording segments. Stop immediately on disconnect/sign-out/disable. Never invent offline recording locations. No deploy or store submission. No unrelated source changes. Native data is excluded from backup. 30-second sample interval, 30-second maximum age, 5-second future tolerance, <=1000m accuracy, <=600 points, five-hour limit, 30-day pending expiry, <=100 pending records. Account + serial + session ID scope all journal operations.

## Shared bridge contract (optional methods on PlaudSdk for old-build compatibility)
```ts
type LocationContext = { actorId: string | null; serial: string | null };
type LocationSource = { actorId: string; serial: string; sessionId: number };
type LocationStatus = { enabled: boolean; permission: 'undetermined'|'denied'|'foreground'|'background'; backgroundReady: boolean; capturing: boolean; reason: 'off'|'ready'|'disconnected'|'permission'|'background'|'capturing'|'interrupted'|'storage'|'unavailable' };
type RecordingLocation = { version: 1; sessionId: number; startedAt: number; endedAt: number | null; status: 'recording'|'paused'|'complete'|'interrupted'; reason: string | null; points: { latitude:number; longitude:number; accuracy:number; capturedAt:number }[]; droppedPoints:number };
getRecordingLocationStatus(): Promise<LocationStatus>;
setRecordingLocationContext(context: LocationContext): Promise<void>;
setRecordingLocationEnabled(options: { enabled: boolean }): Promise<LocationStatus>;
requestRecordingLocationBackgroundPermission(): Promise<LocationStatus>;
getRecordingLocation(source: LocationSource): Promise<RecordingLocation | null>;
removeRecordingLocation(source: LocationSource): Promise<void>;
clearRecordingLocations(options: { actorId: string }): Promise<void>;
// Event recordingLocationChanged: LocationStatus (no coordinates).
```
All times are epoch milliseconds. Native read/removal accepts validated explicit owner keys, including after sign-out for deletion recovery; it never searches another account. UI/controller must validate actor before displaying anything. Removal creates a coordinate-free suppression marker so a late resume cannot restore removed samples. Acknowledgement uses removal after shared metadata is durable. Current context can have serial=null so an unpaired signed-in user can enable/disable consent. Platform code hooks confirmed recording callbacks; background acquisition never depends on JS events.

## Task 1 — Native iOS capture
- [x] Add pure validation/session tests, observe failure, implement native journal/capture helper and minimal bridge hooks.
- [x] Compile with the real SDK and record evidence. Parent owns app.config.ts and shared TS API declarations.
- [x] Review source for permission completion, stale callbacks, bounds, stop paths and deletion; resolve findings.

## Task 2 — Shared consent and recording integration (root)
- [x] Write tests for validated location metadata, import failure isolation, ack only after durable save, no location resurrection on removal, and context races.
- [x] Implement feature/location ports + controller + native/web adapters, Settings card and local recording card.
- [x] Bind native context to authenticated actor/ready recorder across app lifetime; purge native pending data in account cleanup.
- [x] Update purpose strings, shared privacy notice and release evidence/manifest requirements.

## Task 3 — Native Android capture
- [x] Add pure session tests, observe failure, implement separate helper/journal and foreground-service integration using the exact contract above.
- [x] Add manifest service/permissions, compile and run native tests. Verify no background permission or startup boot hook is introduced.
- [x] Review native behavior and resolve findings.

## Task 4 — Integration acceptance
- [x] Run shared check and platform compilation, inspect generated permission manifests.
- [x] Review full diff for privacy/races and fix actionable findings.
- [x] Record implemented vs hardware-unverified behavior in verification notes. Leave release installation/deployment for its own step.

Verification record: `docs/verification/2026-09-16-recording-location.md`. Implementation checks and independent review are complete; hardware acceptance and signed distribution remain separate, not completed, steps.
