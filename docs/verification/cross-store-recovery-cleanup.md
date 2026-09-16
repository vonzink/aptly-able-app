# Transfer recovery and temporary-file cleanup

Date: 2026-09-15. Baseline: `188500a`; branch: `codex/cross-store-readiness`.
Subsequently merged to `main` and deployed as
[pilot 0.1.2 (8)](2026-09-15-build8-deployment.md). The local-pass evidence below
predates that deployment; the iPhone installation remains unchanged.
This follows [cross-store readiness](cross-store-readiness.md). Changes and builds
remain local. No deployed service, installed phone or store submission was updated.

## Changes

### Preserve native transfer recovery

The Android watchdog rejects its promise without proving the SDK exporter has
stopped. Previously the shared transfer controller treated promise settlement as
completion, cleared `restartRequired`, and offered Retry while the native lease
was still held.

- Native start failures and lease conflicts now have distinct restart-required
  error codes. Genuine terminal export failures retain ordinary retry behavior.
- The shared controller preserves restart guidance after nonterminal rejection,
  blocks new transfers, restored-audio requests and device controls, and carries
  the guard across reconnect/account changes. Existing saved recordings remain.
- Export cancellation conservatively requires a full app restart because the
  current bridge cannot report a later terminal callback to the already-rejected
  JavaScript caller. Disconnecting or stopping Wi-Fi is not proof that SDK decoder
  work stopped. A genuine terminal result received by a still-pending caller can
  clear the guard.
- The Wi-Fi card no longer offers an inert Bluetooth fallback while restart is
  required. Device controls explain how to stop a recording using the recorder's
  physical button in that state.

Primary files: `plaud-audio-transfer.ts`, `plaud-sync-controller.ts`,
`transfer-recovery.ts` and Android `PlaudExportLifecycle.kt` / recorder adapters.

### Release temporary document-picker copies

Both installed Expo DocumentPicker implementations create a distinct file under
their app cache's `DocumentPicker/` directory. Native audio import now releases
that owned copy after the library save attempt. Transcript import releases its
copy after reading, including oversized/unreadable-file rejection paths.

- Cleanup claims only the exact, validated direct cache-file URI returned by our
  picker. It does not delete external originals, saved library audio, unclaimed
  cache files or directories.
- Failed releases stay pending and retry on a subsequent picker operation.
  Another active import is not swept or deleted.
- Failed cleanup is shown without exposing filesystem/vendor exception text.
  Successful audio imports with cleanup warnings remain on the library screen so
  the warning is visible. Their saved recording is still available to open.
- **Limit:** pending ownership is currently in memory. A process restart loses
  those retry entries; the OS can evict cache files, but no deadline is claimed.
  A validated durable pending-only cleanup journal is a follow-up for crash/restart
  recovery. This pass does not sweep historical picker files or SDK-owned logs.

Primary files: `recording-picker.native.ts`, `recording-picker-errors.ts`,
`use-import-recording.ts` and `TranscriptPanel.tsx`.

### Verify actual packaged backup exclusions

The release verifier now decodes compiled backup XML from the AAB with Google's
protobuf schema bundled in the official bundletool JAR. It verifies all five
current app-storage domains in the legacy, cloud-backup and device-transfer
scopes, and inspects every packaged resource qualifier variant. The compiled
resource table is also inspected: aliases and unexpected file overrides fail
closed instead of bypassing the filename checks. Custom backup agents require
separate review. Missing, partial, ambiguous and unexpected rules fail closed.
This extends the earlier manual inspection and manifest-reference check.

See `scripts/android-backup-checks.mjs`, `scripts/java/ReadBundleBackupRules.java`
and `scripts/verify-android-store.mjs`. Java/JDK and the existing official
bundletool JAR are required; no additional app dependency is introduced.
[Google documents why device-transfer rules matter separately from allowBackup](https://developer.android.com/identity/data/autobackup).

## Verification

- `pnpm check`: **524 shared unit tests**, **17 release-script tests**,
  typechecking, ESLint/import boundaries and API/admin production builds passed.
- Focused transfer/controller/picker checks: **90 passed**, including nonterminal
  native errors, cancelled export, Wi-Fi lease conflict, rejected-file cleanup
  failure, cleanup retry and preservation of another active import's copy.
- Android Kotlin release compilation and signed AAB build passed; native JUnit
  results remain **13 passed**. The second build reused unchanged native test
  results and rebuilt the latest JavaScript. Source changes were finished before
  each build started.
- Production iOS JavaScript export passed. No native iOS archive or device
  installation was performed; the native iOS implementation was not changed.
- Candidate: version **0.1.2**, build **7**, SHA-256
  `3c68f51eb0b40bdae11a97f45f253a41d1b466fb695f79f1d4d8207257f31c21`.
  Path: `apps/mobile/android/app/build/outputs/bundle/release/app-release.aab`.
  All compiled backup scopes were decoded and checked successfully. The
  submission verifier still intentionally fails on the recorded readiness
  evidence and Plaud `liblame.so` alignment issues; this is not a store-ready AAB.
- Backend integration tests were not repeated because this follow-up does not
  modify backend code; the baseline's 53 passing tests remain historical evidence.

Ignored command logs and packaged-resource evidence are under `.local/cross-store/`:
`continuation-check.log`, `build-final.log`, `continuation-ios-export.log` and
`packaged-backup-rules.json`. `verify-final.log` records the final verifier rerun
against the same candidate after the resource-table checks were added.

Independent review approved the scoped changes after fixes for rejected-file
cleanup feedback, the unusable Wi-Fi fallback, and the resource-alias bypass.
The reviewer built a valid AAB with an Android 31+ alias redirecting backup rules
to unprotected XML: the old reader accepted it and the updated reader rejects it.
Exact fixture sources, tested reconstruction commands and rejection evidence are
retained in `.local/cross-store/backup-alias-review/README.md` (ignored local
evidence). The app's actual AAB passed the updated backup checks. This review
approval is limited to these changes, not store acceptance or hardware behavior.

## Remaining release gates

The existing Plaud vendor logging/erasure, safe cancellation and Android codec
16 KB alignment findings remain open. No readiness flags are set to bypass them.
Physical iPhone/Android pairing, transfer interruptions, low storage and app
restart tests remain required, along with platform-console validation and owner
privacy/deletion operations. JavaScript export and local unit tests do not prove
native iOS compilation or real-device behavior.
