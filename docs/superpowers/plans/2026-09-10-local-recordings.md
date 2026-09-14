# Functional recordings milestone

User steering: get a working app first; production authentication and security hardening move to a future session. Keep existing safeguards and separation of concerns. Work directly in this app directory; no parent repository edits, commits, deployment or external accounts.

## Outcome

Make Recordings usable with real local audio: import, persist, list/search, open, play/pause/seek, rename and remove the app's local copy. Allow attaching an exported text/SRT/VTT transcript and seek from timed segments. No fabricated transcription or hardware status. This supplies the library/detail/player needed by the accepted recorder-to-transcript MVP while hardware/API prerequisites are unresolved.

The optional hardware-path question received no reply during implementation; proceeded with the stated default of importing exported audio from the user's original Plaud Note. This doesn't implement direct pairing. The library/storage boundary can also accept future SDK-exported files. Files stay on the phone/browser for this phase; cloud upload and automatic transcription are separate next work.

## Design

- Mobile feature domain/controller and storage port are independent of React, routing, API and Plaud.
- Native adapter copies picked audio into app documents; web adapter stores Blob + metadata atomically in IndexedDB. Never depend on temporary picker/blob URLs for persistence. Resolve a playback URL on open and release web object URLs on close. Source files are preserved on remove.
- Each recording has UUID, title, original filename, importedAt, sizeBytes, mimeType, durationSeconds nullable, optional imported transcript. Transcript segments reuse the public timestamp shape; plain text has no invented timing. Names capped at 200 chars; accept MP3/WAV/M4A, max 250 MiB, and 2 MiB transcript files. These are functional validation limits, not a new security project.
- Shared RecordingProvider controls the library across routes. Screen-specific UI is split into library, detail/player, transcript and rename/remove controls. Keep the navy/Inter visual system. Show LOCAL on real recording screens; preserve SIMULATED on the isolated recorder demo.
- Expo DocumentPicker initiates from the import button. Expo Audio supports playback without microphone permission or background-recording setup. Player stops on leaving detail and releases resources.
- Home points primarily to the usable recordings library and retains enrollment/recorder preview access. Settings describes actual local storage and what remains.

## Work and ownership

1. Domain/controller/storage + transcript parser (worker): apps/mobile/src/features/recordings/{recording-model.ts,recordings-controller.ts,transcript-parser.ts}; apps/mobile/src/services/recordings/**; focused tests. Own only these files.
2. UI, provider and dependency wiring (root): screens/components in recordings, RecordingProvider, routes, Home/Settings/shared PageHeader, package/config, run commands.
3. Verify (root + read-only reviewer): meaningful persistence/failure/parser tests, actual browser import/playback/rename/reload/remove/transcript seek, mobile exports and available iOS simulator. Document actual device/SDK limits without blocking library delivery.

## Stable interface

`LocalRecording`: id, title, originalName, importedAt (ISO), sizeBytes, mimeType, durationSeconds (number|null), transcript (ImportedTranscript|null).
`ImportedTranscript`: fileName, text, segments: TranscriptSegment[], importedAt.
`AudioImport`: name, uri, sizeBytes, mimeType, blob?: Blob.
`RecordingPatch`: optional title, durationSeconds and transcript fields.
`RecordingStore`: list(), saveAudio(record, input), update(id, patch): Promise<LocalRecording>, remove(id), openAudio(id): Promise<{uri, release(): void}>. Metadata patches merge with the latest persisted version inside the storage transaction/queue to preserve independent edits from stale browser tabs.
`RecordingsController`: getSnapshot(), subscribe(), initialize(), reload(), importAudio(input): Promise<string|null>, rename(id,title):Promise<boolean>, remove(id):Promise<boolean>, attachTranscript(id,fileName,text):Promise<boolean>, setDuration(id,seconds):Promise<void>, clearError().
Snapshot: recordings:LocalRecording[], loading:boolean, busy:boolean, error:string|null.
`createRecordingsController({store,createId,now})`.
Platform export `recordingStore` from services/recordings/recording-store (native/web extensions).

## Progress ledger

Implemented the local library, platform storage and file pickers, audio player, rename/remove controls, transcript importer and search. Home opens the functional library. Web progress uses an HTML range input; native progress uses the platform touch/accessibility control.

Verification complete for the scoped browser/source milestone: 113 workspace tests, type checks, lint/import boundaries, package builds, formatting, Expo dependency compatibility and iOS/Android/web exports pass. Actual browser import/playback/seek/replay/transcript/rename/reload/search/remove and stale-tab metadata preservation pass. Source review findings are addressed. See [runtime verification](../../verification/LOCAL_RECORDINGS.md).

iOS simulator interaction remains unverified: the selected simulator returned to Shutdown before the app could be inspected. Exports are JavaScript/assets, not native signed builds or physical-device validation. Production security, direct Plaud transfer, cloud upload and automatic transcription remain future work. No new infrastructure, commits or deployment were needed for this milestone.
