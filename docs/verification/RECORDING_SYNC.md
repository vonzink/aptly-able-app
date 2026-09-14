# Recorder receipt and server integration stub

Date: 2026-09-11

## Delivered scope

The user approved automatic recorder receipt and explicitly requested a stub for server integration. This slice adds a separate app-level Plaud file-transfer coordinator and file port, sharing the existing verified connection. When the app is active and the assigned recorder is ready, it requests files and exports MP3 audio sequentially. It refreshes after recording-stop events, reconnects and periodic checks. Progress appears under Recordings; external audio import remains secondary.

The local library persists the source owner, exact recorder serial, session ID and source byte size with each copied audio file. Repeated lists and reconnects skip that saved source revision. Native exported files are restricted to the SDK's app-private export folder and copied into the existing persistent recording store before the cache export is removed. Recorder originals are retained. Plaud recordings are displayed only for the source owner currently signed in. This was the initial behavior; the storage revision below replaces it with persistent dismissal receipts.

`RecordingServerPort` defines future upload and processing/transcript retrieval. `services/recording-server.ts` is intentionally unconfigured and rejects calls; it contains no HTTP implementation or fake success data. Synced recordings show pending server integration in the transcript panel and do not enter the pre-existing manual transcription flow. Outside imports retain their manual transcription option. No backend, database, S3 or hosted AI changes were made.

## Verification

- `pnpm check` passed: **315 unit tests**, all workspace typechecks, lint/import boundaries and workspace builds. An initial lint failure in the new coordinator was corrected before the successful run.
- New controller tests exercise automatic receipt, saved-source deduplication, exact serial filtering, invalid device files, recording start/pause/stop, missing list callbacks, serialized exports, sign-out/owner changes and stale completion after timeout. Additional filesystem coverage verifies source metadata and real audio bytes survive recreation of the store, without a duplicate import.
- Expo exported iOS, Android and web JavaScript bundles. This is not an Android native compile; the missing vendor AAR remains a separate blocker.
- Scoped formatting passed. The final removal-dialog clarification changes prose only.
- The browser Recordings page rendered the direct-recorder card, optional Import audio file action, and explicit pending-server/transcript notice. The browser correctly requires the installed phone app for hardware receipt.
- A bounded metadata-only `getFileList` probe of the physical iPhone returned no callback within its observation window. Its temporary listener/global properties were cleaned up. No physical transfer/playback success is claimed. The user was asked to open the app with the recorder nearby and confirm the secure Ready state before live acceptance.

## Physical acceptance still needed

1. On iPhone, confirm Recorder shows **Ready · secure connection confirmed**.
2. Open Recordings with a finished short recording on the NotePin S. Observe transfer progress and one newly saved recording, then play it.
3. Check again/reconnect and confirm the same saved source is not duplicated.
4. Record another short conversation, stop it and verify automatic receipt while the app remains open.

The bridge has no export-cancellation method. A stalled export holds its lane until its native promise settles, preventing overlapping exports; a stuck operation may require reopening the app and reconnecting. Background/terminated-app transfer, server upload, automatic transcription and AI processing are not implemented by this slice. Source growth produces a separate revision, not an overwrite of previously received audio.

Local evidence logs: `.local/plaud-native-research/recorder-sync-check.log`, `recorder-sync-export.log`, and `recorder-sync-format.log`. No app reinstall or native framework changes were required.

## Storage revision — 2026-09-11

Requested: receive recordings without filling the phone, allow explicit download and app deletion, and investigate the save error.

- New Plaud audio goes into an app-private **100 MiB temporary cache** under `Paths.cache`. Metadata and transcripts remain in Documents. Eviction removes oldest unleased cache audio and keeps library entries. Files too large for the cache retain their metadata; Download to phone permits explicit retention within the existing 250 MiB per-file limit.
- **Download to phone** means a permanent copy inside the app, not an export to Files. Explicit downloads and external imports remain until app deletion. Existing permanent copies are preserved.
- **Clear temporary audio** preserves metadata/transcripts and any open player audio. **Load audio** retrieves a cleared file only from its matching connected recorder. It shares the same single export lane with automatic receipt, rechecks ownership/generation, and preserves the existing recording identity.
- **Delete from app** removes audio and metadata and persists a dismissal scoped to owner, serial and session. Size changes do not resurrect that session. No recorder-original deletion or cloud upload is performed.
- Failed imports now expose the actual library error. Sync stops periodic retries after an error instead of repeatedly exporting the same failing recording and attributing all failures to disk capacity.
- The server API remains a stub. No cloud backups or automatic transcripts exist for received recorder recordings yet. Cleared audio depends on the original still being available on the recorder.

### Verification of this revision

- Workspace checks, typechecks, lint and builds passed with **326 tests** (`recording-cache-check.log`).
- Filesystem regression tests use real bytes and cover bounded eviction, playing-file leases, permanent downloads, oversized-cache entries, OS cache removal, restart-safe dismissals, owner/session isolation, and restoration without duplicate entries. Sync tests cover actual save-error propagation, stopping failed automatic retry loops, dismissal skipping, explicit restoration and disconnected recorder requests.
- iOS, Android and web JavaScript exports succeeded (`recording-cache-export.log`). Android native compilation is still unverified because the vendor AAR is missing.
- The browser renders the new Phone storage card and current direct-receipt/server-stub copy.
- On the physical iPhone, the actual native recording store saved, reopened and removed an isolated 11-byte temporary test file successfully. The probe and temporary globals were removed. The phone reported 371,818 MiB free at inspection, so the prior generic message is not evidence of disk exhaustion.
- The development session was reopened and its existing enrollment restored. A scan could not find the assigned recorder nearby. **At that stage**, the original real-recording save failure had not been reproduced; the investigation below supersedes this status. No user recording was deleted, and no uninstall or unpair was performed.

### Next physical acceptance

Wake the NotePin S near the iPhone, open Recorder and reconnect. Then use Recordings to verify real receipt/playback, Download to phone, Clear temporary audio/reload, and deletion staying deleted after another check. SDK export work may temporarily use space beyond the retained cache limit. Small catalogs, transcripts and dismissal receipts are durable; the limit is for temporary audio, not all app storage.

## Alphanumeric serial fix — 2026-09-11

A live debugger capture reproduced `Invalid recorder source` in `dismissalPath` while the NotePin S was securely connected. The enrolled 16-character serial contains a letter. Both recording metadata validation and the dismissal-path guard incorrectly required all digits after the model prefix, although the shared enrollment contract accepts alphanumeric serials. This also explains the earlier library save rejection that the UI misreported as a disk-space issue.

Both storage checks now use one `isRecorderSerial` predicate backed by the existing enrollment schema. Stored identities must already be trimmed; malformed/path-like serials are rejected. The sync fixture now uses an alphanumeric serial, and a real-filesystem regression exercises import, permanent download, deletion and restart-safe dismissal with that serial format. No enrollment/SDK/server contract was broadened or replaced.

`pnpm check` passed with **331 tests**, workspace typechecks, lint and builds. iOS, Android and web JS bundles exported successfully. Evidence: `alphanumeric-serial-red.log`, `alphanumeric-serial-check.log`, and `alphanumeric-serial-export.log` under the ignored local research directory.

On the physical iPhone, the fixed app received its first real recorder MP3 (164,769 bytes) into temporary storage, with no library error. The next recording began transferring normally. The iPhone native audio player loaded that real MP3 successfully: `isLoaded: true`, duration 20.7 seconds, no playback error. Audio was not played aloud; the player and file lease were released after the check. No user audio or recorder original was deleted. The app's existing development session was restored after Fast Refresh; no reinstall or unpair was needed.

Final physical result: **all five recorder files were received into the temporary cache**, each reports local audio available, the library has no error, and sync returned to `idle` while the recorder remained `ready`. The temporary native player verified the first file without playing its contents aloud.
