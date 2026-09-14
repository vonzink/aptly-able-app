# Local recordings source review

Date: 2026-09-10

Scope: the functional local recordings milestone in `docs/superpowers/plans/2026-09-10-local-recordings.md` and `docs/LOCAL_RECORDINGS.md`. Reviewed domain/controller/parser, filesystem and IndexedDB stores, platform pickers, provider, library/detail/player/transcript UI, Home/Settings/PageHeader, routes and audio configuration. This review deliberately excludes production authentication/security work and unrelated enrollment implementation.

## Review status

**PASS for this scoped source/unit review.** All three findings R1/R2/R3 are **ADDRESSED**. The reviewer independently verified R1/R2 with source inspection and **37 passing tests across four focused test files**, then reviewed the platform-specific slider correction for R3. Root subsequently reported successful browser verification of seeking/replay and cross-tab metadata preservation. No outstanding actionable finding remains in this scope. Browser and platform evidence is attributed separately below.

## Findings

### R1 — P2: stale browser-tab edits overwrite unrelated saved metadata

Status: **ADDRESSED — source and regression verified**.

Original locations: `apps/mobile/src/features/recordings/recordings-controller.ts:84` and `apps/mobile/src/services/recordings/recording-store.web.ts:130`.

The original controller derived a complete `LocalRecording` from its own cached snapshot. The original web store read current metadata but checked only immutable audio details before writing the complete caller-supplied record. IndexedDB serializes transactions, but that did not prevent this stale replacement.

Reproduction:

1. Open the same existing recording in two browser tabs, A and B, before attaching a transcript.
2. Attach `notes.txt` in A.
3. Rename the recording in B.
4. Reload A. The name from B persists, but the transcript has become `null`.

The reviewer independently reproduced the original controller behavior with two actual `createRecordingsController` instances sharing a clone-on-read store. Output before B's rename was `Keep these actual words.`; output after B's rename and A's reload was `null`. The original web adapter's unconditional `metadata.put(record)` confirmed that the persistence path had the same replacement semantics. This was a source/controller reproduction, not a claim of browser execution.

Verified correction: `RecordingStore.update(id, patch)` accepts only title, duration and transcript fields. The web implementation reads, merges and writes inside one IndexedDB readwrite transaction (`recording-store.web.ts:126`); the native core does the same under its storage queue (`file-recording-store.ts:110`). The controller publishes the returned merged record (`recordings-controller.ts:84`). The passing two-controller regression uses actual temporary filesystem persistence and verifies that independent transcript, rename and duration edits survive reload.

Root-reported browser verification also passed against actual IndexedDB: tab A replaced an SRT transcript with TXT, stale tab B renamed the recording, and both the replacement text and new title survived B's reload. This runtime result was supplied by root, not independently executed by this reviewer.

### R2 — P2: valid VTT files with repeated blank lines fail import

Status: **ADDRESSED — source and regression verified**.

Original location: `apps/mobile/src/features/recordings/transcript-parser.ts`, the `normalized.split(/\n[ \t]*\n/)` block split and subsequent block loop.

The original split consumed one blank line at a time, leaving empty blocks when a file contained longer runs of blank separators. The loop treated the empty block as an invalid cue. This rejected otherwise valid imported transcript content; the [W3C WebVTT file structure](https://www.w3.org/TR/webvtt1/#file-structure) permits extra line terminators between blocks.

Reviewer reproduction, using the actual parser:

```ts
parseTranscript(
  'notes.vtt',
  'WEBVTT\n\n\n\n00:01.000 --> 00:02.000\nOne.\n\n\n\n00:03.000 --> 00:04.000\nTwo.\n',
);
```

Original result: invalid/missing timestamps error. The same two cues with `\n\n` separators imported successfully. Verified correction: `transcript-parser.ts:83` consumes the full run with `/\n(?:[ \t]*\n)+/`. The passing regression covers extra blank lines after the header and between cues, and the existing multiline cue regression remains green.

### R3 — P2: browser progress-bar taps did not seek

Status: **ADDRESSED — source reviewed; root browser rerun passed**.

Evidence supplied by root: with playback paused at approximately 16 seconds, tapping the intended 44-second position left playback at 16 seconds. Root traced the original shared React Native `Pressable` calculation to a browser `MouseEvent` without `nativeEvent.locationX`. The reviewer did not independently execute that browser reproduction.

The reviewer inspected only the subsequent `PlaybackSlider.tsx`, `PlaybackSlider.web.tsx` and `RecordingPlayer.tsx` changes. The web variant uses a native HTML range control, derives seconds from `event.currentTarget.value`, and provides duration bounds, a 0.1-second step, disabled state and accessible value text. The native variant retains native layout/press coordinates and accessibility increment/decrement actions. The shared props import is type-only, so the web component does not load the native component at runtime.

The player imports the platform-resolved slider at `RecordingPlayer.tsx:73` and routes slider changes through its existing clamped seek function. Slider seeking preserves a paused recording's state; timed transcript navigation continues to request playback. No additional actionable defect was found in this narrow source review.

Root subsequently reported the actual browser rerun passing: click seeking, play/pause, back 15 seconds, forward 30 seconds, and a transcript jump to 10 seconds. The end/replay check sought precisely to 43 seconds, reached the 45-second end, then replayed from the beginning to approximately 1 second. A screenshot was captured. No Expo Audio status patch was required. These are root-reported runtime results, distinct from this reviewer's source inspection.

## Boundaries and behavior reviewed

- Domain metadata, controller and parser do not import React, routing, an API client or Plaud. The parser reuses the public transcript segment shape.
- UI owns routing, file-picking interactions, editing/confirmation state and playback presentation. Platform storage owns persistence and playback URI allocation; the controller publishes successful writes after persistence finishes.
- Native import stages a copied audio file and metadata before directory commit. Metadata edits commit a new immutable revision before removing older versions. Remove operates on the app's directory, preserving the selected source file.
- Web audio and metadata import/removal share IndexedDB transactions. Persisted playback uses a stored Blob, not the original picker URL. The playback-source hook releases object URLs, including when an asynchronous open finishes after the view has closed.
- Detail blur unmounts `RecordingPlayer`; Expo Audio's installed hook owns and releases its player. No microphone permission or background-recording setup is added.
- The app identifies actual library screens as LOCAL and continues to label recorder setup SIMULATED. Home and Settings describe import/exported transcripts rather than claiming generated transcripts, uploads or hardware connectivity.

## Verification evidence and limits

Reviewer commands:

```sh
pnpm exec vitest run apps/mobile/test/local-recordings.test.ts apps/mobile/test/local-recordings-storage.test.ts apps/mobile/test/transcript-parser.test.ts
pnpm exec vitest run apps/mobile/test/local-recordings-web.test.ts
```

Final independent runs at 20:41 UTC: **35 passed in the first command; 2 passed in the second; zero failures**. The reviewer also inspected the finished patch API, its merge locations, the two-controller regression and the revised blank-line parsing.

An earlier run while the implementation worker was adding a regression had **32 passed, 1 failed**. That failure was the newly added multi-voice VTT cue test: the previous parser assigned all cue text to the first named voice. The worker corrected the parser to retain each supplied voice label in cue text without assigning the entire cue to one speaker. This regression passes in the final run.

The filesystem tests exercise the storage abstraction with actual temporary Node filesystem files, including persistence across store recreation, source preservation, partial-copy failure and metadata commit failure. They do not execute the Expo native filesystem adapter. The two web boundary tests cover unavailable IndexedDB and invalid import bytes; they do not execute IndexedDB transactions. The later slider correction received a narrow source review; the 37-test result predates that UI-only correction and does not validate pointer interaction. No independently executed browser or iOS simulator result is claimed by this reviewer.

Root supplied the successful browser results documented under R1/R3, plus removal verification: cancel the removal, then remove the recording and confirm an empty library after reload. Root also reported mobile typecheck and all-platform export passing. Export success is compilation/bundling evidence, not proof of native device interaction. See the separate [root runtime verification report](LOCAL_RECORDINGS.md) for runtime artifacts and platform limits.

No commits, dependency installs or application edits were performed by this reviewer.
