# Automatic transcription

The app can explicitly upload imported audio, track a durable Plaud transcription job and display the generated text separately from an imported transcript. This is a local development implementation. Live Plaud acceptance is pending developer credentials; no real Plaud transcription has been claimed from the synthetic verification results.

## Enable it locally

1. Run `pnpm dev:setup` if the local API/database have not been set up. For an existing setup, run `pnpm db:migrate` to apply migration 003 without changing earlier migrations.
2. In the existing ignored `apps/api/.env`, add the three values from the same Plaud Developer Portal application. Preserve the database and local access settings already in that file:

   ```dotenv
   PLAUD_CLIENT_ID=<your application client ID>
   PLAUD_CLIENT_SECRET=<your application client secret>
   PLAUD_API_KEY=<your transcription API key>
   PLAUD_REGION=us
   ```

   The API key and client secret are different credentials. Use `jp` instead of `us` for an application in Plaud's Japan region. Keep all three values on the backend; do not add them to Expo public variables or paste them into chat. The client ID/secret pair alone enables native SDK sessions and pairing; adding the API key enables transcription. Leaving all three absent disables both. A lone client ID/secret, a key without its client pair, or empty configured values are rejected at startup.

3. Restart the API with `pnpm dev:api`, then run `pnpm dev:web`. The administrator dashboard is not required for this workflow.
4. Open [Recordings](http://localhost:8088/recordings), import a short audio export, and open it. In **Generated transcript**, enter the local **user** access code from the ignored `.local/development-access.txt`. Select **Generate transcript**.
5. Watch the upload/processing status. On completion, tap a generated timestamp to seek the local audio. After a browser reload, sign in again to restore the saved result without creating a new request.

`GET http://127.0.0.1:4100/v1/transcription/capabilities` reports whether the API has the required configuration. `available: true` means configuration is present; it does not verify account entitlement, available transcription credits, credential validity or provider acceptance. First use should be a short MP3 export with clear speech, followed by checking the actual text and timestamps.

No separate AWS bucket is needed for this implementation. Verified incoming audio is staged under this workspace's ignored `.local/recordings` directory (override with `RECORDINGS_DIRECTORY`). The backend uploads to Plaud's managed file service and submits its returned download URL. Keep this directory with the matching Postgres data if restarting the local API.

## User behavior

- Importing audio alone does not upload it. Generation requires an explicit action and the existing local sign-in.
- A completed audio upload queues server processing. Leaving the detail screen cancels an unfinished client upload; accepted jobs continue on the server.
- Reopening the same recording reads its stored job. Refreshing or repeated taps do not intentionally create another transcription.
- Generated and imported transcripts are separate. Existing imported transcripts remain editable, searchable and playable by timestamp.
- Missing Plaud configuration displays a clear setup message. **View saved transcript** still permits sign-in and retrieval of an existing result while new generation is disabled.
- A failed request exposes retry. A lost response during submission can mean Plaud accepted the request; the app requires an explicit acknowledgement before making a potentially duplicate request. Retrying a polling interruption resumes the known task.
- Removing a local recording deletes its local audio and imported transcript only. Uploaded audio and generated transcripts remain on the server. Server deletion and retention controls are future work.

## Structure and recovery

```text
local recording
  → authenticated metadata registration
  → verified binary audio upload
  → Postgres processing queue
  → Plaud managed multipart upload
  → Plaud transcription submission and polling
  → persisted generated transcript
  → recording detail and timestamp playback
```

The public record UUID matches the local recording UUID. Ownership is enforced by the authenticated internal user ID. Registration tolerates a local title rename while rejecting a changed original filename or size. Upload publishes only after exact byte-count and digest validation; duplicate identical uploads return the existing state.

Processing progresses through `awaiting_upload`, `queued`, `uploading`, `submitting`, `transcribing` and `complete`, with `failed` and `submission_uncertain` terminal states. Postgres holds the status, provider task ID and generated transcript. The worker checkpoints before submission, preserves returned task IDs, and never blindly repeats an ambiguous submission after a restart. One advisory-locked worker step runs at a time. This initial queue processes a single provider operation at a time; scaling the queue is a later infrastructure change.

The HTTP routes live in `apps/api/src/transport/http/recording-routes.ts`; owned metadata/storage in `modules/recordings`; the worker and provider interface in `modules/transcription`. The Plaud adapter can be replaced without changing mobile UI. The separate processing client and `features/transcription` controller handle typed responses, cancellation, polling and presentation.

## Current limits

- Live credentials, account permissions and real transcription results have not been verified. File upload and transcription endpoint documentation describe different sets of example formats; MP3 is the first live acceptance target, followed by WAV and M4A.
- Audio is capped at 250 MiB. Native upload currently buffers the entire file; near-limit files need physical-phone memory testing. There is no background native upload service or automatic long-audio splitting.
- The library is still local. Generated results are retrieved for recordings on that device; there is no cross-device recording list, generated-transcript offline cache or generated-text library search yet.
- The development API is loopback-only. Physical-phone server features need a reachable API with an appropriate authentication configuration. Bundling iOS/Android JavaScript does not establish a working signed native app.
- Direct recorder pairing/transfer, AI summaries, app-store installation and production deployment remain separate work. The original Plaud Note workflow here uses exported audio.
- Production authentication and security hardening remain deferred as requested. No infrastructure was provisioned for this milestone.

## Evidence and references

- [Integrated verification](verification/TRANSCRIPTION.md)
- [Provider protocol verification](verification/plaud-provider.md)
- [Mobile and native transport verification](verification/transcription-mobile.md)
- [Independent source review](verification/transcription-review.md)
- [Plaud managed file upload](https://docs.plaud.ai/plaud-embedded/file-api-overview.md)
- [Plaud transcription submission](https://docs.plaud.ai/api-reference/transcription-api/submit-audio-for-transcription.md)
