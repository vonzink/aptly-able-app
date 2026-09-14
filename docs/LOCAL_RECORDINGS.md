# Local recordings

The functional app milestone prioritizes importing, keeping and playing real audio. Production authentication and security hardening are deferred per the user's 2026-09-10 direction. Existing enrollment safeguards remain intact.

## Workflow

1. Export the audio from the Plaud consumer app to Files/the computer. Plaud's export documentation describes MP3/WAV audio export. This is the route for the original Plaud Note while direct Embedded pairing is unavailable.
2. In Aptly Able, open Recordings and choose Import recording. Supported file extensions are MP3, WAV and M4A, up to 250 MiB; actual playback depends on the audio encoding.
3. Open a recording to play/pause, skip back/forward, seek along the progress bar or change playback speed. Playback stops when leaving its detail screen.
4. Rename it, or attach a transcript exported as TXT, SRT or VTT (up to 2 MiB). Timed transcript segments support tap-to-seek; plain text is displayed without invented timestamps.
5. Search titles, original filenames and attached transcript text from the library.
6. Remove local copy deletes only Aptly Able's copy and its imported transcript. The source recording is preserved.

Audio/transcript imports are user-chosen local files. Importing, playback and attaching an exported transcript require no cloud setup or user access code. Upload starts only when you select **Generate transcript** in the separate generated-transcript panel. That optional workflow requires the local API, sign-in and Plaud developer configuration; see [automatic transcription](TRANSCRIPTION.md). Removing a local copy does not delete previously uploaded audio or generated transcripts from the server. Direct recorder transfer and a cross-device cloud library remain future work.

## Run

```sh
pnpm install --frozen-lockfile
pnpm dev:web
```

Open `http://localhost:8088/recordings`. The library persists in IndexedDB for this exact browser origin. A different browser/profile, hostname or port has separate storage. Clearing site data removes it; browser storage is not a cloud backup.

For Expo Go, use `pnpm dev:mobile` and open the development project on your phone. For an installed iOS simulator, stop any existing Metro process for this app and run:

```sh
pnpm --filter @aptly/contracts build
pnpm --filter @aptly/api-client build
pnpm --filter @aptly/mobile exec expo start --localhost --port 8088 --ios
```

The simulator runs JavaScript within Expo Go. This is distinct from compiling/signing a standalone app or proving Plaud hardware access. The existing local enrollment API still uses development access codes; local audio import/playback works independently of that API.

## Code boundaries

- `features/recordings/recording-model.ts`: local recording metadata and storage port.
- `features/recordings/recordings-controller.ts`: serialized library actions and user-visible state.
- `features/recordings/transcript-parser.ts`: text/SRT/VTT normalization.
- `services/recordings/`: platform persistence; native app documents and browser IndexedDB.
- `services/recording-picker.*`: platform file selection.
- `features/recordings/RecordingsProvider.tsx`: shared library instance across routes.
- `features/recordings/components/RecordingPlayer.tsx`: Expo Audio playback and real playback status.
- `features/recordings/components/PlaybackSlider.*`: native touch/accessibility seeking and web range control.
- `features/recordings/components/TranscriptPanel.tsx`: transcript import/rendering and timestamp navigation.

A future Plaud SDK adapter can deliver exported files through the same library storage boundary. Server processing contracts remain separate; importing a local file alone does not mark it uploaded or transcribed. Library search currently includes imported transcript text, not generated server transcripts.

## References

- [Plaud export guide](https://support.plaud.ai/hc/en-us/articles/50835453223705-Export-recordings-transcripts-and-summaries)
- [Expo Audio](https://docs.expo.dev/versions/v57.0.0/sdk/audio/)
- [Expo DocumentPicker](https://docs.expo.dev/versions/v57.0.0/sdk/document-picker/)
- [Implementation plan](superpowers/plans/2026-09-10-local-recordings.md)
- [Functional verification and phone-testing limits](verification/LOCAL_RECORDINGS.md)
