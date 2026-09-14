# Local recordings storage verification

Implemented September 10, 2026. Scope is local imported audio and imported transcripts. This feature does not pair with a recorder, upload audio, generate transcription, or establish production identity/security behavior.

## Contract

`recording-model.ts` owns domain records, the storage port, basic file validation, and the shared metadata-patch guard. `recordings-controller.ts` has no React/platform/API dependencies and serializes all reloads and writes. Its snapshot remains referentially stable between notifications. Import, rename, removal, transcript, and duration changes only enter the published library after their storage operation succeeds. Failure keeps the last published data and permits retry. `RecordingStore.update(id, patch)` accepts only title, duration, or transcript and returns the latest persisted merged recording; this preserves independent edits from stale controller snapshots.

Accepted audio: MP3, WAV, M4A, positive size, maximum 250 MiB. File extensions supply canonical audio MIME values when OS pickers do not. Names are trimmed and limited to 200 characters. These checks validate import usability; codecs are ultimately validated by playback.

Accepted transcripts: UTF-8 text represented as a JavaScript string, TXT/SRT/VTT, maximum 2 MiB counted in UTF-8 bytes. Plain text has zero timed segments. SRT/VTT retain supplied start/end times and speaker prefixes/voice annotations. Multiple VTT voices sharing one cue retain both names without falsely assigning one speaker to the entire cue. Invalid timestamps, reversed intervals, empty/binary text and unsupported extensions fail cleanly. This is a basic transcript importer, not a complete subtitle styling renderer; VTT notes/style/region blocks and supported formatting are omitted from the spoken transcript.

## Native persistence

`recording-store.native.ts` uses Expo FileSystem 57.0.6. The installed `src/internal/NativeFileSystem.types.ts`, `File.ts`, `Directory.ts`, `Paths.ts`, and iOS/Android filesystem source were read before integration. File copying and directory/file moving are asynchronous in this installed version and are awaited. This adapter uses modern `File`, `Directory`, and `Paths` APIs.

Storage root is `Paths.document/aptly-recordings-v1/`. Each recording has its own UUID directory and `audio.<extension>`. Imports copy the picker source to a hidden staging directory, verify copied byte size, write metadata, then move the completed directory into the UUID location. No picker URI is persisted, and original files are preserved.

Metadata updates write a new pending file and commit it to a new `metadata-000000000N.json` filename. The highest committed revision is authoritative. Only after a successful commit are old revisions removed. This avoids Expo's overwrite-move behavior, whose iOS implementation deletes the existing destination before attempting the move. A failed commit retains the previous metadata. The wrapper rejects existing move destinations because Expo otherwise nests a moved directory inside an existing directory.

Removal first moves the UUID directory to `.deleted-<uuid>` and then removes it. If OS cleanup fails after that durable library removal, the hidden copy is reclaimed on a later list attempt. Removal never addresses the source file. Listings read metadata only. Opening native audio returns a document-file URI with a no-op release callback.

Native filesystem tests run the storage core against real temporary Node filesystem directories and inject only the failure boundary. This verifies the persistence protocol, not an actual iOS/Android filesystem runtime. Device playback/import remains a separate integration check. No claim of crash-proof storage or operating-system-level atomic guarantees is made.

## Browser persistence

`recording-store.web.ts` uses IndexedDB database `aptly-able-local-recordings-v1` with separate `metadata` and `audio` stores. Import adds metadata and the Blob in one read/write transaction and resolves only on transaction completion. Metadata updates merge only the changed fields with the latest stored recording inside one read/write transaction, preserving other tabs' independent edits; they never reload or rewrite audio. Removal deletes both stores in one transaction. Duplicate IDs fail without replacing audio. Missing IndexedDB and Blob/size mismatches fail explicitly; there is no fallback to transient memory or persisted temporary URLs.

List operations access only `metadata`. Opening audio loads the selected Blob and allocates an object URL; its release callback is idempotent and revokes that URL. `createWebRecordingStore` accepts an isolated database name and injectable IndexedDB/object-URL boundaries for browser testing. Browser storage is local to the origin/profile and can be cleared/evicted by the browser; it is not an archival backup.

Node tests cover browser unavailability and invalid file/Blob boundaries. Actual IndexedDB commit/reload/playback behavior requires the main integration run in a browser and is not claimed by these Node tests.

## Executed checks

```sh
pnpm exec vitest run apps/mobile/test/local-recordings.test.ts apps/mobile/test/local-recordings-storage.test.ts apps/mobile/test/local-recordings-web.test.ts apps/mobile/test/transcript-parser.test.ts
pnpm --filter @aptly/mobile typecheck
pnpm exec eslint apps/mobile/src/features/recordings/recording-model.ts apps/mobile/src/features/recordings/recordings-controller.ts apps/mobile/src/features/recordings/transcript-parser.ts apps/mobile/src/services/recordings apps/mobile/test/local-recordings.test.ts apps/mobile/test/local-recordings-storage.test.ts apps/mobile/test/local-recordings-web.test.ts apps/mobile/test/transcript-parser.test.ts
```

Focused test result: 37 passed across four files. Tests cover publication-after-save, failed writes/retries, serialized concurrent changes, independent edits from two stale controller snapshots against the real filesystem core, removal without resurrection, size/type/title/duration guards, stable snapshots, reopening persisted audio/metadata, source preservation, partial-copy failure, failed metadata commit, duplicate IDs, confinement of IDs, metadata-only listings, immutable audio identity, failed deletion commit and later cleanup retry, plain/SRT/VTT parsing, multiple voices, extra blank VTT separators, and invalid/oversize transcripts.

No package installation, commits, deployment, or changes outside the assigned domain/storage/test/verification files were performed by the storage worker.
