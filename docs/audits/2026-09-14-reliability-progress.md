# Reliability cleanup — first implementation pass

Status: local implementation and automated verification completed September 14, 2026. Not deployed or installed on a phone. This record supplements the original audit; it does not retroactively change its findings.

Subsequent source changes are recorded in [the second cleanup pass](2026-09-14-cleanup-without-testing.md). They have not been tested or built; the verification below applies only to the first pass, commit `4bf20c5`.

## Completed changes

### Source baseline

The application now has a reviewed source baseline in the existing parent repository on `codex/aptly-reliability-cleanup`. Baseline commit: `5765e72`. It captures the pre-edit source; the working source was not replaced while establishing it. Generated projects, recordings, credentials, signing material, and native SDK binaries are excluded. The existing SDK provenance describes external native inputs.

A second local safety copy of 220 authored/configuration files and their hashes is at `.local/reliability-2026-09-14/baseline/`. This is a local rollback aid, not an off-host backup. CI and native dependency reproducibility remain open.

### C2: Database capacity during Plaud requests

The API now uses three lazily connected pools: ordinary requests (maximum 2), device operations (maximum 2), and transcription work (maximum 1). The server wires each workload to its designated pool and closes all pools at shutdown. Existing recorder/assignment ownership locks remain in place.

New integration cases reproduced the original 3-second acquisition failure with two delayed device sessions, and with a delayed session plus held worker connection. Both now pass while ordinary database reads and readiness remain available. Existing bind/revoke/reassignment ordering tests pass.

This fixes shared connection starvation from vendor waits; it is not a general load-capacity guarantee. Same-recorder mutations still intentionally wait for ownership locks. Durable cloud-operation uncertainty/reconciliation is a later change.

### C3: Recoverable recording deletion

For Plaud recordings, persisting the source dismissal is now the logical deletion commit. Before that point, failures preserve metadata, cached audio, and restoration eligibility. After it, the library hides the recording and prevents reimport, while cleanup retries remove remaining audio/metadata. Listing after restarting the store resumes cleanup. Access/update/restore operations reject logically deleted entries even if physical cleanup is unfinished.

Manually imported recordings retain their directory-rename deletion commit. Tests cover dismissal-write failure, metadata-move failure, cache-removal failure, restart, prevention of resync, and preservation of the original input audio. The filesystem fixture was extracted for reuse instead of duplicating it across suites.

### C4: Current recording state before sync

On connection/foreground, recording state starts unknown. The controller requests a fresh reading before listing/exporting audio. Confirmed recording blocks transfer; confirmed idle permits it. A recording event received during the read takes precedence over its delayed reply. Unknown/unanswered state reports a recoverable error. User-requested audio restoration uses the same gate.

The shared state-reader owns one unanswered query at a time because the SDK callback has no request identifier. Cancellation rejects the caller while retaining ownership until a reply or disconnect, preventing a late reply from satisfying the next caller. A missing reply can require Bluetooth reconnection before another read; the app must not silently assume idle.

Both bridges now expose the installed SDK's `getState()` facade. The callback includes a normalized recording-state value. iOS uses the SDK recording predicate and treats non-idle key state conservatively; Android uses the installed SDK's `DeviceStatus` classification. The method is optional in the TypeScript native shape to identify older binaries. Older installed native builds cannot supply this new gate and need an application update.

API availability was checked against the installed Swift interface and Android AAR public interface. The vendor describes state reads and recording-state access in its [iOS reference](https://docs.plaud.ai/plaud-embedded/advanced-ios-sdk) and [Android reference](https://docs.plaud.ai/plaud-embedded/advanced-android-sdk). Exact callback values and transfer behavior still need physical NotePin S acceptance on both platforms.

## Verification

- 361 unit tests across 37 files passed.
- 35 PostgreSQL integration tests across 7 files passed against temporary local schemas.
- TypeScript checks, lint/import boundaries, and formatting passed.
- Shared packages, API, and dashboard production build passed.
- iOS `PlaudSdk` scheme compiled for physical-device arm64 with signing disabled.
- Android `:plaud-sdk:compileReleaseKotlin` passed against the installed SDK.
- Native builds retain existing upstream Hermes/Gradle build-script/deprecation warnings; no native compilation error remained.

Logs and the local pre-edit comparison are in `.local/reliability-2026-09-14/`. No vendor requests, device pairing/unpairing, production database changes, or deployment were performed. Native compilation is not a signed distributable or physical acceptance result.

## Required acceptance before rollout

1. Build/install updated iOS and Android apps containing the new bridge method. Preserve each platform's installation/signing identity and pairing.
2. With a NotePin S recording, background/foreground the app; verify no transfer begins until recording stops. Repeat with recording started while the app is backgrounded, paused/resumed recording, reconnect, and an unavailable recorder.
3. Stop recording and verify automatic import, playback, explicit download, deletion, and no reimport after app restart.
4. Deploy the API change as its own release and verify ordinary authenticated requests during concurrent pairing. Its pool budget is now up to five connections per process.

## Remaining audit work, in order

1. Add the repository CI gate; make native build inputs and final artifact schemes/versions deterministic.
2. Fix rename-driven upload cancellation and isolate corrupt metadata without hiding healthy recordings.
3. Complete native dispatch/export failure ownership and durable cloud-operation reconciliation.
4. Consolidate HTTP cancellation/error policy, feature contexts, and persistence contracts.
5. Improve transcript/library scaling, then remove unused scaffolding and reconcile current documentation.

The original audit's deferred server/AI integration, retention, off-host backup, account recovery, and distribution acceptance remain separate tracked work. The first pass does not establish full production readiness.
