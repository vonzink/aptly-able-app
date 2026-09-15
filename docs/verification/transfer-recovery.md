# Stabilization step 4: recording-transfer interruption and recovery

Implemented locally September 15, 2026, on `main` based on `f968a4a`, preserving
the uncommitted work from steps 1–3. No commit, push, deployment, phone install,
live account change or Plaud device operation was performed in this pass.

## Problems reproduced and fixed

1. **Unreadable library treated as empty.** A failed root read was caught by the
   recordings controller without telling sync that its empty snapshot was not
   trustworthy. Sync could export and save another copy of an existing recording.
   The snapshot now exposes `readable`; sync stops until the library can be read.
2. **Duplicate import after an uncertain save.** Audio/metadata could commit,
   then the following library refresh could fail. Retrying compared only the
   stale in-memory list. Device imports now reconcile persisted identities before
   deciding to write, including imports invoked before initialization. This is
   serialized with the existing recording operations. Failed reads also make
   initialization retryable.
3. **Repeated list entries transferred twice.** Each device-list result is now
   deduplicated by its existing full source identity before queuing exports.
   Source identity remains account + full serial + session ID + device file size.
4. **Start/stop race during discovery or transfer.** Checking only the current
   idle flag missed a recording that started and stopped while an export was
   pending. File discovery and transfer now require the recording revision to
   remain unchanged. Invalidated output is discarded and cleaned up; the next
   cycle reads a fresh list. Account/connection generation checks remain intact.
5. **Repeated progress concealed stalled transfers.** Only advancing, finite,
   matching-session progress refreshes the inactivity deadline. Slow transfers
   may take longer than the deadline overall if they continue advancing. Late
   SDK progress after export completion cannot restart the deadline during a
   local save.
6. **Stall guidance vanished across reconnect.** `restartRequired` describes
   the still-occupied native export lane independently of connection changes.
   It clears only after that export settles. The UI displays a full app-restart
   instruction and does not offer an unusable Retry or Wi-Fi action meanwhile.
7. **Load audio waited indefinitely behind a stalled export.** A queued request
   now returns on disconnect or stall, allowing its loading UI to stop. This
   cancels the waiting UI request, not the underlying native export ownership.

## User-visible behavior

- Recoverable failures offer **Retry transfer**. Existing saved files are
  skipped; interrupted unsaved files are received again after reconnection.
- **Saving the recording on this phone…** distinguishes local persistence from
  Bluetooth/Wi-Fi reception. Batch completion follows the save.
- A hung SDK export instructs the user to close Aptly Able completely, reopen
  it and reconnect. Switching tabs or reopening a screen is not a native reset.
- The same restart guidance appears on the recording detail and Wi-Fi screens.
  Existing offline audio can still be retained without starting a new transfer.
- A failed Wi-Fi transfer can be retried over Bluetooth once the native operation
  has settled. Deletion/dismissal, cache retention, transcripts and notes retain
  their existing behavior.

## Ownership and recovery contract

- `plaud-sync-controller.ts` owns connection/activity generations, scheduling,
  file discovery, queues, recorder controls and public progress/state.
- `plaud-audio-transfer.ts` owns one export's progress subscription, inactivity
  deadline, returned-file validation, local import/restore and export cleanup.
- `transfer-recovery.ts` owns shared Retry versus restart presentation rules.
- `recordings-controller.ts` reconciles the committed library before a device
  import. Existing file-store staging and atomic metadata commits remain the
  durable boundary; this step adds no new persistence schema or journal.

The SDK's terminal callback remains the authority for releasing the export
lane. A JavaScript timeout, connection loss or Wi-Fi stop does **not** authorize
another export over the same native writer. No new native cancel/reset capability
is claimed. Process restart recovery rechecks the recorder's list and committed
library; it does not resume an interrupted file from a byte offset.

Known export paths returned by the SDK are cleaned up even when their result is
stale. Crash-orphaned files inside the SDK export directory are not swept by this
change; that needs a native lifecycle boundary that proves no exporter still owns
those files. Library staging recovery and the limited app audio cache remain in
place. This pass does not repair duplicates already created by earlier builds.

## Verification

- **439 tests passed across 42 files** (`pnpm exec vitest run`). Seventeen
  additional tests cover the failures above and successful long transfers,
  interrupted batches, and Wi-Fi-to-Bluetooth recovery.
- Persistence regression tests use the real file store in disposable local
  filesystem directories, including committed-write/failed-read recovery and
  controller recreation. Sync tests use the real sync and recording controllers
  with a controlled SDK boundary; they do not exercise physical Bluetooth/Wi-Fi.
- `pnpm typecheck`, `pnpm lint` and import-boundary checks passed.
- `pnpm build` passed for contracts, API client, backend and dashboard.
- Expo production export succeeded for iOS and Android Hermes bundles and web
  in `.local/transfer-recovery-export`. Each uses the production API origin;
  the old LAN address is absent. These are JavaScript exports, not IPA/APK
  builds, installations, or physical-device acceptance.
- No native Swift/Kotlin or backend production source changed in this step.
  Earlier uncommitted native changes belong to the Settings diagnostics step.

## Physical acceptance still required

1. Receive a normal recording on iPhone and Android and play it fully.
2. Interrupt a multi-file batch with Bluetooth loss; reconnect and confirm only
   unsaved files are received and each recording appears once.
3. Close the app during transfer, reopen, sign in if needed and reconnect. Check
   completed recordings, notes and titles survive and interrupted audio retries.
4. Start/stop recording during transfer and discovery; confirm a fresh list is
   read and the completed recording is playable afterward.
5. Interrupt/cancel Wi-Fi, then use Bluetooth. Confirm no overlapping exports,
   correct system hotspot cleanup and clear retry or full-restart guidance.
6. Test low storage, a long recording and Load audio during another transfer.
   Check errors do not create duplicates or permanently loading UI requests.
7. Sign out/switch accounts while exporting; ensure late audio never appears in
   the new account's library.

The website/downloadable APK and installed iPhone app have not been updated.
Build and distribute both native apps before physical acceptance.
