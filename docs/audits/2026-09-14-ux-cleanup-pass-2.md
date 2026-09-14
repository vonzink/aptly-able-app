# UX cleanup — second pass

Status: implemented locally on `codex/aptly-reliability-cleanup`. This pass does
not update the published Android build, installed iPhone app, website, or backend.
Jake's physical pairing trial still uses the previously published build.

## Completed

- Added `ui/ConfirmationDialog.tsx` and used it for unpairing, temporary audio
  clearing, and recording deletion. The dialog accounts for safe areas, bounds
  its height, and scrolls when text is too tall. Pending deletion/clearing disables
  dismissal and duplicate submission. Native screen-reader behavior still needs
  verification on a device.
- Extracted `RecorderPairingCard.tsx` from `PlaudDeviceScreen.tsx`. Unpairing now
  explains the account/device release requirement before proceeding, preserves
  the existing partial-release retry actions, and rechecks recording/transfer
  activity and enrollment identity when confirmed. Pairing UI is remounted when
  the account, enrollment, or recorder changes. Leaving the screen closes the
  confirmation. Firmware Coming soon now follows actionable pairing content.
- Moved `RecordingStorageCard.tsx` into Settings, with a Storage shortcut from
  Recordings. Clearing now has a confirmation, completion feedback, and a retry
  action after library errors. Storage totals cover the whole installation,
  matching the existing cache-clearing scope, including earlier sign-ins. Only
  aggregate totals are exposed; recording entries remain filtered by owner.
  Unreadable entries are identified as a limitation on the totals.
- Replaced the recording library's ScrollView/map with FlatList under the shared
  `ScreenFrame`. The import action remains near the top, with a short supported
  file hint. Large storage/import explanation cards no longer precede the library.
  The existing recorder sync and recovery actions remain available.
- Extracted `RecordingRow.tsx` and `use-import-recording.ts`. Rows show audio
  availability and attached-transcript status separately. Search has an explicit
  clear control and a recovery action for no matches. Visible recording selection
  and search results are memoized; rows are memoized independently.
- Added a signed-out library explanation and sign-in action. This does not add
  session persistence or change account filtering.
- Reused the confirmation dialog for deletion in `RecordingDetailScreen.tsx`,
  guarded repeated deletion taps, and disabled blank/unchanged rename submissions
  through the Save name button.
- Typed Card styles as `StyleProp<ViewStyle>`, separated the screen frame from
  scrolling, enabled handled keyboard taps on ordinary screens, and removed the
  unused action gap from empty states without an action.

## Verification and limits

- `pnpm --filter @aptly/mobile typecheck`: passed.
- ESLint on all 12 source files changed in this pass: passed.
- `node scripts/verify-boundaries.mjs`: passed.
- Prettier applied only to those source files; `git diff --check`: passed.
- Local Expo web bundle compiled successfully. Recordings and Settings were
  visually reviewed in dark mode at 390 × 844. No horizontal overflow was found,
  and the Storage shortcut opened Settings with the storage card at the top.
- Preview used a fresh localhost origin and a localhost API URL. No real account,
  device, recording, or production data was changed during preview.
  The temporary preview tab and server were closed after review.
- Automated suites and physical-device checks were not run. Populated library
  virtualization, destructive-action confirmations, long-text/native dialog
  layout, VoiceOver/TalkBack, and hardware unpair/transfer recovery remain
  unverified at runtime. Typechecking and browser layout review do not establish
  native release readiness.

## Next cleanup, in order

1. Restore sign-in sessions reliably and add a clear account section in Settings.
2. Unify model/serial validation and the assignment-correction workflow.
3. Guide setup through enrollment, Bluetooth connection, and first successful sync.
4. Add true audio export, distinct from retaining an offline copy inside the app.
5. Simplify transcript/player rendering and consolidate transcript presentation.

Keep these changes separate from backend/SDK behavior changes. Before distributing
a new build, verify cancellation and confirmation for all three destructive
actions, session changes while a dialog is open, search/import/playback/navigation,
and physical pairing and transfer on iOS and Android.
