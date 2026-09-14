# Reliability cleanup — second source pass

Status: **local source changes; unverified**. The user explicitly requested work without testing. No tests, type checks, lint, formatting checks, builds, device checks, installs, deployments, or CI runs were performed for this batch. No package installation was run. The first-pass results in `2026-09-14-reliability-progress.md` apply to commit `4bf20c5`, not these changes.

## Changes prepared

### Upload and screen lifetime

`GenerationPanel.tsx` now creates its transcription controller from immutable audio identity. It updates the title separately through `setTitle()`, so renaming no longer intentionally tears down the upload/poll lifecycle. A name change affects a future registration; this does not implement renaming an already registered server record. Account changes and leaving the screen still cancel the request.

`RecordingDetailScreen.tsx` only shows its full loading screen when no current recording is available. Reloading the library can retain the selected recording subtree, including playback and upload state. The screen still derives its record from the current owner-filtered library; it does not cache another account's selected recording.

### Partial library reads

The native file store and browser IndexedDB store now expose `readLibrary()`, returning readable records and an unavailable count. Individual entry failures preserve the unreadable data and allow other recordings to load. Root/database failures still reject. No old metadata revision is silently substituted, and no damaged entry is automatically deleted or repaired.

The controller uses the richer read when available, preserving `list()` compatibility for existing adapters. The library shows an explicit warning and retry action instead of reporting an empty library. New Plaud imports pause while unreadable entries exist because their source identities cannot safely be deduplicated; existing readable recordings can still be opened. Repair/recovery tooling remains future work.

### Dashboard and sign-in boundaries

Assignment creation returns a success result used by `AssignmentForm.tsx`. Closing the form no longer depends on an English notice prefix. Sign-in uses an injected auth client from `AppProviders.tsx`, sharing the same origin/development-HTTP policy as enrollment, transcription, and device clients.

Removed the unused React Query provider and unused React Query/Zustand dependencies. Their importer and resolution entries were removed from the lockfile; no other dependency versions were changed and no install was executed. Existing controller/external-store state management remains the app standard.

### Android bridge

Added `getDeviceStatus()`, `batteryState`, and `storageState`, forwarding the installed SDK's charging, power, and storage callbacks into the existing shared status controller. Its range validation and timeout behavior remain in place. Older native installs keep reporting the optional capability as unavailable.

Extracted guarded main-thread dispatch for connection reads, disconnect, depair, state/status requests, and file-list requests. Errors thrown after a queued dispatch can reject the JavaScript promise instead of escaping the Expo call stack. Native export ownership and the remaining asynchronous setup paths still need a separate reliability pass.

### Release inputs and documentation

- `withAppSchemes.cjs` removes only the other Aptly Android variant's schemes from a reused manifest, preventing preview/pilot deep-link accumulation. It drops an affected filter if removing its schemes would leave it overly broad.
- `apps/mobile/release.json` sets source version `0.1.0`, build number `2`. Expo uses it for both platforms. Build scripts compare artifact versions and record the versions found in their output. No build-2 artifact exists from this pass.
- Android consumes exactly `libs/plaud-sdk.aar`. The existing artifact hash/provenance is recorded in `sdk-artifacts.json`, and the SDK preparation script checks that pin when run in a later session. iOS artifact hashing and repository CI remain open.
- The local-only `compose.yaml` is included in source control so the documented development database command can be reproduced. Its password is the explicit local development default, not a production credential.
- Settings/module documentation now reflects direct recorder transfer and the still-unconfigured server integration. Corrected the stale Route 53 domain example in the alternative hosting guide. No DNS change was made.
- [SDK capability review](../PLAUD_CAPABILITIES.md) compares existing source, SDK options, app/dashboard placement, and prerequisites. Most proposed features are not implemented. Android status parity is the only new SDK capability wired in this batch.

## Deferred verification and release steps

These are future work, not results from this session:

1. Run the workspace checks and the recording/transcription regressions against this exact source. Exercise rename during upload, library reload during playback, partial corrupt entries in both stores, retry, deletion, and owner changes. Confirm imports pause without duplicating unreadable Plaud entries. Validate the edited lockfile with a frozen install.
2. Compile both bridges. On physical Android, read real battery/storage/charging values, disconnect while a request is queued, deny permissions, and repeat after reconnect. Recheck iOS enrollment/transfer with the new shared code.
3. Generate Android preview → pilot → preview and inspect each final manifest's schemes, package and version. Build both artifacts with the original signing identity; never replace a distributed Android signing key.
4. iOS still uses the existing native workspace. If its Info.plist hardcodes old versions, regenerate from `app.config.ts` in the established native setup workflow before archiving. The archive script rejects version mismatches; it does not silently claim a new version for an old archive.
5. Create a reviewed release only after verification. This batch has not changed the EC2 backend, Amplify site, public APK, or anyone's installed app.

## Remaining high-priority work

Durable cloud pairing/unpairing reconciliation, native export cancellation/late completion ownership, a persistent recording upload queue with server acknowledgement, and off-device audio retention remain open. Then consolidate the duplicated HTTP request policy, add dashboard device-health reporting, improve large-library/transcript rendering, and establish CI. No production-readiness claim follows from this source-only pass.
