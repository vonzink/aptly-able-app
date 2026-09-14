# Device and recording polish

Implemented locally. No native build, installation, deployment, SDK update,
database migration, or backend change was made for this pass.

## Visual direction

Keep Aptly Able's existing Inter typography and navy identity: navy `#193E66`,
paper `#F5F7F9`, white `#FFFFFF`, slate `#5D6672`, green `#1C7A50`, and the existing
dark-theme equivalents. Model-specific product photography anchors the recorder
card. Use sentence-case labels, readable status values, clear media controls and
short explanations. Motion communicates a changed reading; it does not simulate
live hardware activity.

## Changes

- Bundled official NotePin S and Note Pro photos. `RecorderPhoto` and
  `RecorderIdentityCard` select the image from the actual assigned model. Native
  enrollment, the simulation view, dashboard model selection, and assignment
  details use the model-specific image. The existing two-model contract remains.
  Photo provenance is in `apps/mobile/assets/README.md`.
- Reworked battery and storage displays with icons, larger values, clearer labels
  and animated bars. `AnimatedMeter` clamps values, identifies unavailable data,
  handles reduced-motion preferences, and stops animations on teardown. Existing
  telemetry and warning thresholds remain the source of truth.
- Added shared `MediaControl` for recorder controls and playback. Large labeled
  play/pause and record/stop controls, explicit playback speed choices, and a
  larger draggable timeline replace the smaller controls. Existing SDK command
  handling, transfer locks and recording-session checks are preserved.
- Added optional `LocalRecording.notes`, a 10,000-character limit, validation,
  and one serialized `saveDetails` operation for title and notes. Older entries
  without notes remain readable. Existing filesystem metadata revisions and web
  IndexedDB updates persist the new field without a separate storage system.
- Added `RecordingDetailsEditor` and `RecordingNotesCard`. The editor has visible
  labels, keyboard avoidance, explicit saving, duplicate-submit protection,
  retained drafts on save failure, and an unsaved-edits discard confirmation.
  Opening it pauses playback. Notes appear between playback and transcript
  sections, with expandable long text and save feedback.
- Notes are searchable and previewed in recording rows. Cache-clearing copy now
  explicitly includes retained notes; deleting a recording also deletes its notes.

## Dictation and storage scope

The initial implementation uses the phone keyboard's dictation in the regular
multiline notes field. It does not add a dedicated speech-recognition button,
microphone permission, speech SDK, or Plaud-device dictation stream.

- [Apple keyboard dictation](https://support.apple.com/en-ie/guide/iphone/iph2c0651d2/ios)
- [Android Gboard voice typing](https://support.google.com/gboard/answer/2781851?hl=en-IN)

Availability depends on the installed keyboard and its dictation settings.
Notes are local to this installation. They survive temporary-audio clearing,
but are not automatically uploaded, backed up, or shared with another phone.
Deleting the recording or removing the app removes its local notes.

## Verification

- Mobile and admin TypeScript checks passed after the final source edits.
- ESLint on the 23 changed TypeScript/TSX files passed.
- Import-boundary verification passed. Changed files were formatted locally.
- Local Expo web preview compiled. Both product images and normal/low battery and
  storage presentations were reviewed at 390 × 844 in dark mode using explicit
  sample readings. These were not physical-device readings.
- A generated 20-second sample audio file was imported through the real local
  library controller. Its title and notes saved through the editor and survived
  a full page reload. Search found the record from a phrase in its notes.
- Canceling an unsaved edit showed the discard confirmation. Discarding the
  draft preserved the saved note. Playback controls and editor layout were
  visually reviewed in the browser.
- Automated suites, native dictation, native persistence, native drag behavior,
  reduced-motion changes, VoiceOver/TalkBack, and physical recorder commands were
  not tested. Dashboard model imagery was checked in source and typechecking.
  A new native build and device verification are needed before release.
- The disposable preview route was removed from the application route tree.
  Its fixture and synthetic audio remain under ignored `.local/device-design`.
  Temporary preview tabs and the server were stopped after review. The sample
  recording is confined to that localhost browser library, not a phone or server.

## Git handoff

At the start of this pass the application belonged to the parent repository
`/Users/zacharyzink/AptlyAble` on `codex/aptly-reliability-cleanup`.
During the work, an independent `.git` appeared in the app folder, with branch
`main` and commit `986de97` (`first commit`). Most app files are currently untracked
in that inner repository; the parent repository still tracks its existing files.
Both repositories were left intact. No source was reset, staged, committed, or
pushed. Decide which repository owns the application before the next commit.
