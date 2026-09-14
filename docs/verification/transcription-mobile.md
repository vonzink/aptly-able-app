# Mobile transcription verification — 2026-09-11

## Implemented behavior

- The recording detail screen shows separate generated and imported transcript panels. Imported transcript metadata and saved audio remain unchanged.
- The public capability request runs before sign-in. Missing provider setup is stated directly. An optional **View saved transcript** action permits sign-in and restoration of previously generated results while new transcription is unavailable.
- Authenticated users explicitly select **Generate transcript**. The controller first queries the UUID for existing server state, registers missing metadata, opens audio through the saved recording store, and uploads only an `awaiting_upload` record.
- Web opens the store's Blob URL and uploads the resulting Blob. Native opens the installed modern `expo-file-system` `File`, obtains its `ArrayBuffer`, and uploads those bytes with `expo/fetch`. This preserves `application/octet-stream` through Expo's normalization, which otherwise replaces the header with a File/Blob's audio MIME type. No native File constructor enters the web module. See [Expo's FileSystem API](https://docs.expo.dev/versions/latest/sdk/filesystem/).
- The shared client uses authenticated JSON metadata/retry requests and raw `application/octet-stream` audio. Uploads receive at least a 120-second request timeout. Caller cancellation is propagated, and only known safe error messages leave the request boundary.
- Active server status is queried three seconds after each completed status request. Polls do not overlap; terminal statuses stop polling. Temporary polling errors preserve the last known record and resume polling.
- Blur/unmount, sign-out, and actor changes cancel active work. Epoch checks discard stale responses, account changes clear displayed server data, and saved audio URLs are released on success, failure, or cancellation.
- Lost upload or retry responses are reconciled against current server state before another mutation. Failed transcription exposes an explicit retry. An uncertain provider submission requires an explicit **Start a new request anyway** action with concrete duplicate-request copy.
- Generated timestamps use the existing playback seek callback. Local removal copy states that uploaded audio and its generated transcript remain on the server.

## Automated evidence

Executed successfully in the local workspace:

```sh
pnpm exec vitest run packages/api-client/test/transcription.test.ts apps/mobile/test/transcription-controller.test.ts apps/mobile/test/transcription-upload.test.ts apps/mobile/test/transcription-native-upload.test.ts
pnpm --filter @aptly/api-client typecheck
pnpm --filter @aptly/mobile typecheck
```

The targeted suite contains 29 passing tests. Coverage includes public capabilities without credentials, exact route/header/body contracts, response validation, safe error mapping, platform transport selection, upload timeout/cancellation, explicit generation, duplicate taps, stored-result restoration, missing-configuration restoration, serial polling, transient failure recovery, actor change and sign-out stale replies, URL release including delayed acquisition, failed/uncertain retry behavior, and response-loss reconciliation.

The web integration test uses a real Blob URL and the real controller, web upload preparation, and shared API client. An injected HTTP boundary receives the exact four-byte fixture `[0, 255, 13, 10]` and returns a generated transcript fixture with a 4.5-second segment start. This proves the local byte conversion and client/controller integration; it is not a live Plaud transcription.

The native regression uses the real native preparation code and shared API client with a temporary audio file. Only the device filesystem bridge and HTTP dispatch are substituted; the test executes the installed Expo `normalizeBodyInitAsync`, `normalizeHeadersInit`, and `overrideHeaders` functions. Before the fix it failed with `expected 'audio/wav' to be 'application/octet-stream'`. After changing the body to `File.arrayBuffer()`, it verifies the final octet-stream header, authorization header, and exact six fixture bytes after normalization.

Installed-source evidence for the native MIME behavior and memory cost:

- `apps/mobile/node_modules/expo/src/winter/fetch/RequestUtils.ts`: ArrayBuffer normalization retains explicit headers; File/Blob normalization reads the full body and overrides `Content-Type` with `body.type`.
- `apps/mobile/node_modules/expo/src/winter/fetch/fetch.ts`: applies the normalized body's header overrides before native dispatch.
- `apps/mobile/node_modules/expo-file-system/src/File.ts`: `arrayBuffer()` awaits `bytes()` and returns its backing buffer; `slice()` calls `bytesSync().slice(...)` and constructs a new Blob. The implementation uses `arrayBuffer()` to avoid that extra synchronous slice copy.

Targeted ESLint and Prettier checks cover all files owned by this mobile/client change. Whole-workspace checks and platform exports are performed by the integrating task.

## Unverified or intentionally limited

- Live Plaud acceptance and physical iOS/Android uploads require actual provider credentials and device execution. Native transport has TypeScript and installed-normalization-boundary verification; the integrating task runs native bundle exports.
- Native uploads buffer the entire saved file before HTTP dispatch. The 250 MiB limit is not a promise of streaming or of safe memory use on every phone; a near-limit file can require at least that much buffer memory plus runtime/transport overhead. The buffer read cannot itself be interrupted; an abort during the read prevents the subsequent request. A future file-backed native upload API would be needed for bounded-memory uploads.
- Browser acceptance, provider-disabled reload/sign-in/restoration, and the backend/Postgres end-to-end harness belong to the integrating task's verification record.
- Leaving the detail screen cancels a current audio upload. After the server accepts the upload, server processing continues independently. Reopening checks stored state and allows explicit upload recovery when still awaiting audio.
- Generated transcripts remain server data. This slice adds no generated-transcript offline cache, cross-device library, server deletion action, or background native upload service.
- No installs, commits, deployment, provider calls, or cloud provisioning were performed by this mobile implementation task.
