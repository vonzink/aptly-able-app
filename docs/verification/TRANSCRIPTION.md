# Automatic transcription milestone verification

Date: 2026-09-11. Scope: the approved local import → upload → automatic transcript milestone in `/Users/zacharyzink/AptlyAble/aptly-able-app`. Production security work, deployment, direct recorder transfer and AI summaries remain deferred.

## Implemented

- Typed recording processing contracts and a separate API client. The shared `ApiError` module removes a Metro circular import while preserving the public API.
- Authenticated recording registration/read/retry and raw audio upload; exact-length file staging, SHA-256 duplicate checks and ownership checks. Applied migration 003 stores the durable job and generated transcript separately from recorder assignments/enrollment tokens.
- A Postgres-coordinated worker, provider task checkpoint/recovery, bounded polling and explicit acknowledgement of potentially duplicate submissions.
- A real Plaud adapter for partner/user authentication, managed multipart upload, ETag/MD5 completion, transcription submission and normalized results. Production uses actual fetch; there is no synthetic provider runtime setting.
- Separate generated/imported transcript panels, explicit upload, status/polling, saved-result restoration, cancellation and timestamp playback. Previously saved transcripts remain accessible while new transcription is disabled.
- Backend-only configuration and [setup instructions](../TRANSCRIPTION.md). No Plaud credentials were added to the real API environment.

## Automated acceptance

The final workspace typecheck, ESLint/import-boundary checks, **198 tests across 24 files**, and shared-package/API/admin builds passed. These include the previous local-recording/enrollment coverage plus the new contract, storage, provider, client/controller and native normalization regressions.

`pnpm format:check` passed. `pnpm --filter @aptly/mobile export` successfully bundled web, iOS and Android JavaScript/assets after the final native upload and shared-client changes. This does not compile/sign an IPA/APK or prove physical-phone operation. Expo emitted only terminal color-environment warnings during export.

The full PostgreSQL integration run passed **22 tests across three files**, including six new processing tests with isolated schemas and actual temporary audio files. Coverage includes owned/idempotent registration, upload byte integrity, durable completion, ambiguous submission recovery and explicit retry, retained polling identity, real Fastify raw HTTP handling, advisory-lock exclusion and interrupted-upload recovery.

The compiled API runtime smoke also passed after the final build: idempotent migrations/seed, user/admin sessions and roles, assignment read models, QR issuance, resolve, concurrent claim/recovery, revocation and release. This confirms the shared API bootstrap still serves the existing enrollment workflow.

The native upload regression first reproduced Expo replacing the binary content type with an audio MIME type. It now passes an ArrayBuffer and executes the installed Expo body/header normalizer to verify exact bytes, retained authorization and `application/octet-stream`. Only the unavailable native filesystem/HTTP bridges are substituted. Native upload still buffers a whole file; no physical device execution is claimed.

## Browser acceptance

Used an isolated Playwright Chromium session at 393×852 and 320×740, separate from the user's open app tabs. Imported the existing synthetic 45-second WAV fixture (1,440,044 bytes) and SRT fixture into its IndexedDB library.

1. Against the actual development API on port 4100, verified the absent-configuration message and **View saved transcript** action. The API currently reports `available: false`, `reason: not_configured`.
2. Routed only that test browser's API requests to the isolated harness on port 4101. This runs the actual API routes, staging filesystem, separate PostgreSQL schema, durable worker and real Plaud adapter. Only external Plaud HTTP responses are substituted. The browser route proxy is not evidence of native networking or a live provider call.
3. Signed in with a nonproduction fixture account and selected **Generate transcript**. The harness confirmed all 1,440,044 bytes reached multipart completion with the expected digest, exactly one transcription submission, and two polls (pending then complete).
4. Verified both generated segments appeared and the existing imported SRT text remained separate. Clicking the generated 0:10 timestamp moved the real audio player's slider to 10 seconds; playback could then be paused.
5. Reloaded the browser, signed in again and restored the saved generated text. Submission count remained one.
6. Disabled new transcription in the test harness, reloaded, used **View saved transcript**, signed in and retrieved the saved text. No generation button was offered and the submission count stayed one.
7. Signed out: generated server text cleared while imported transcript text remained available.
8. Checked no document horizontal overflow at 320 pixels. Visually inspected the narrow generated/saved-result panel and missing-configuration screen. The app uses its existing scroll container and fixed bottom navigation; screenshots capture a viewport, not the entire internal scrolling page.

Evidence images in the ignored `output/playwright` folder:

- `transcription-not-configured.png`
- `transcription-generated-393.png`
- `transcription-generated-320.png`
- `transcription-disabled-restored.png`

The console initially reported the new API-client circular import; it was fixed and did not recur after reload. Initial GET requests for an unregistered recording returned the expected 404 before registration. A first acceptance script was interrupted by development hot reload clearing in-memory sign-in; it passed after signing in again. Another script expected the optional access button after sign-out although the already-open sign-in form correctly remained visible; correcting that expectation passed without an application change.

The test fixture API shut down cleanly. Its temporary schemas, staging directories and metadata file were removed, and the isolated browser session was closed. Confirmed zero processing records in the actual application's table after the test; no synthetic transcript was inserted into the user's app data. The real local database has migrations 001, 002 and 003 applied.

## Source review and limits

The independent [source review](transcription-review.md) passed with no outstanding findings after fixing saved-result sign-in access and native MIME normalization. Further details are in the [provider report](plaud-provider.md) and [mobile report](transcription-mobile.md).

Live Plaud credentials/entitlement, signed upload URLs, actual audio decoding, transcript accuracy, WAV/M4A managed-upload compatibility and physical iOS/Android behavior remain unverified. Start live acceptance with a short MP3 speech export. Full-size native memory use, long audio and background uploads need separate device work.

Recovery tests simulate persisted checkpoint states; they are not a killed-process/database-disconnect fault campaign. Unknown database COMMIT outcomes, the full backoff/24-hour deadline, and shutdown during an external provider call were source-reviewed rather than directly fault-injected. The single worker coordinator and local disk staging are appropriate to this initial local milestone; distributed workers/object storage are future changes.

The library remains local. Generated results have no offline cache, cross-device list, generated-text search, server deletion UI or automated retention yet. Removing a local recording explicitly leaves its uploaded server copy. No AWS resources, production deployment, commits or parent-repository edits were made.
