# Aptly Able mobile

**Future device support:** [Recorder-provider design](docs/RECORDER_PROVIDER_DESIGN.md) records the September 18 direction for adding other manufacturers behind separate SDK adapters while retaining one shared app/library. Plaud is the only external recorder provider currently implemented.

The iOS/Android foundation for the Aptly Able recorder-to-transcript app. This workspace is self-contained under `aptly-able-app` inside the existing AptlyAble Git repository.

**Current source status — September 14, 2026:** the latest cleanup is local and has not been tested or built, at the user's request. Earlier verification below describes prior builds. See the [cleanup record](docs/audits/2026-09-14-cleanup-without-testing.md) and [SDK capability review](docs/PLAUD_CAPABILITIES.md) for current changes, proposed features, and remaining work.

**One app codebase for iOS and Android.** The shared Expo/React Native app uses Swift and Kotlin bridges for native Plaud operations. iPhone pairing and recording transfer have been verified. The Android emulator uses a separate preview install of this same app with an explicitly simulated recorder; see [Android preview](docs/ANDROID_PREVIEW.md). The Android SDK was recovered from a public fork; a signed standalone native APK builds and launches in the emulator without Metro; see [SDK provenance](apps/mobile/modules/plaud-sdk/android/libs/SDK_PROVENANCE.md). Real Android pairing and transfer still need testing on a physical phone. Start with [native setup](docs/PLAUD_NATIVE_SETUP.md), [phone development](docs/PHONE_DEVELOPMENT.md), and [recording sync verification](docs/verification/RECORDING_SYNC.md).

The existing recording library still imports real MP3/WAV/M4A audio, supports playback/search/rename, and attaches TXT/SRT/VTT transcripts. With Plaud transcription credentials configured, explicitly upload audio to generate a separate transcript with status tracking and tap-to-seek. That pipeline is fixture-tested; live Plaud acceptance is pending credentials. See [local recordings](docs/LOCAL_RECORDINGS.md) and [transcription setup](docs/TRANSCRIPTION.md).

The administrator dashboard and mobile enrollment remain available separately: assign recorders, generate expiring QR invitations, claim as the assigned user and restore pending setup through the API. Assignments, invitation hashes and setup operations are stored separately in Postgres. Pilot email/password signup and sign-in are now implemented with owner-scoped recorder management. Public-launch authentication features and security hardening remain future work.

The confirmed target is NotePin S. Direct recorder transfer is verified on iPhone; Android hardware acceptance is pending. AI summaries are not implemented. The original Plaud Note is unsupported by the selected Embedded integration; its audio exports can still be imported locally. The explicitly simulated recorder experience remains available through the development configuration.

## Run the local workflow

For the recording library alone, run `pnpm install --frozen-lockfile` then `pnpm dev:web` and open [Recordings](http://localhost:8088/recordings). The database/API setup below is needed for enrollment and automatic transcription; the dashboard is needed only to administer recorder assignments.

Use Node 24.13.0 and pnpm 11.19.0, matching `.node-version` and `packageManager`. Start Docker, then:

```sh
cd /Users/zacharyzink/AptlyAble/aptly-able-app
pnpm install --frozen-lockfile
pnpm dev:setup
```

Setup creates a local API environment only if one is absent, generates separate user/admin access codes, starts this project's Postgres container, applies versioned migrations and seeds two local accounts. Existing environment configuration is preserved. Credentials are written to the ignored `.local/development-access.txt` with owner-only permissions; do not share them or put them in a client bundle.

Run these in separate terminals:

```sh
pnpm dev:api
pnpm dev:admin
pnpm dev:web
```

1. Open [the administrator dashboard](http://localhost:8089) and enter the administrator code from `.local/development-access.txt`.
2. Assign a supported recorder model and complete serial to the local user, then generate an enrollment QR.
3. Click **Open setup** to open [mobile enrollment](http://localhost:8088/enroll), or use the manual invitation input for testing.
4. Enter the user access code and select **Continue setup**. The result is **Enrollment saved**, with hardware setup still pending.
5. Refresh the dashboard to see the claim. Revoking the invitation or ending the assignment also revokes its pending setup; refresh mobile status to see the change.

These URLs work on this computer. A phone cannot reach this computer through its own `localhost`. For local phone testing, use the explicit [private-network API bridge](docs/PHONE_DEVELOPMENT.md); the API's default listener remains loopback. Hosted pilot authentication, platform-specific QR installation continuation and AWS packaging are implemented. Remote backend provisioning, verified native phone continuation and TestFlight distribution still require acceptance.

## Mobile preview and native bundles

`pnpm dev:web` runs [the local app](http://localhost:8088), including the recording library and enrollment. `pnpm dev:mobile` starts Expo for the custom development client. Native toolchain/signing setup is required before using `pnpm --filter @aptly/mobile ios` or `android` to compile and install on a physical phone. Plaud connection requires this native build; the browser and Expo Go cannot use its SDK.

`apps/mobile/app.config.ts` declares `recorderMode: 'native'`. The Recorder page requires a phone build when the native module is unavailable. Setting this explicitly to `mock` restores the isolated simulation for development; simulation does not complete a real server-assigned connection. One app-level native controller shares connection state between Home and Recorder and keeps Bluetooth connected across tab navigation. Home shows a connected recorder only after the full handshake; signing out or changing enrollment invalidates the session. Finished recordings now transfer to the local library automatically while the app is active. The server-upload/transcript adapter is deliberately unconfigured; new recorder audio uses a capped 100 MiB temporary cache. Users can download a permanent in-app copy or delete a recording without it automatically returning; cleared audio can be loaded again from the recorder. Cloud backup remains pending. See [the recording sync design](docs/superpowers/specs/2026-09-11-automatic-recording-sync.md). Background/relaunch reconnection remains future work.

The enrollment URL carries its secret in a fragment that the web adapter removes from the address bar. Bearer codes and raw invitation tokens remain in memory. Only actor ID, idempotency key and operation ID are journaled: web uses session storage (survives same-tab reload), native uses Expo SecureStore. Reopening the app requires sign-in again; explicit sign-out removes recovery state. The native custom scheme is `aptlyable`, with platform link adapters; actual device link behavior is not yet verified.

## API and database

The API binds to `127.0.0.1:4100` and reads the ignored `apps/api/.env`. Without configured persistence or development credentials, those capabilities stay disabled. `/health/live` checks the server; `/health/ready` probes Postgres. `/v1/session` requires a bearer credential and returns the authenticated internal user ID and role.

Browser API access requires an exact `BROWSER_ORIGINS` allowlist. The setup command configures local ports 8088/8089. There are no cookie credentials or wildcard origins. Development authentication is rejected in production or on an all-interface listener. Hosted pilots enable PILOT_AUTH_ENABLED and use database-backed email/password accounts with expiring hashed sessions; self-registration never grants administrator access.

Postgres is exposed only at `127.0.0.1:55432`. `pnpm db:down` stops this project's container/network while preserving its volume. Migration 001 creates enrollment tables; migration 002 adds display names and read indexes; migration 003 adds recording processing jobs and generated transcripts; migration 004 adds pilot accounts and sessions. The API never auto-migrates. Applied SQL is checksummed and must remain unchanged; add a new migration for future changes.

Automatic transcription stages verified uploads under the ignored `.local/recordings` directory and uses Plaud's managed file upload API before submitting a transcription job. No separate AWS bucket is required for this local implementation. Credentials remain in the API environment. Missing credentials disable new jobs while previously saved transcripts remain readable after sign-in.

Native recorder sessions/bind/unbind live under `/v1/plaud`. SDK setup needs `PLAUD_CLIENT_ID` and `PLAUD_CLIENT_SECRET`; `PLAUD_API_KEY` additionally enables transcription. The API derives the Plaud identity and serial from the authenticated user's owned enrollment. Unpair before revoking the enrollment: a revoked enrollment can release its cloud association but cannot obtain a new Bluetooth session to finish physical release.

See [the enrollment API guide](docs/ENROLLMENT_API.md) for endpoints and retry rules.

## Organization

```text
apps/admin/src/features/assignments/   administrator UI and application state
apps/mobile/src/app/                   thin route composition
apps/mobile/src/features/enrollment/   enrollment controller, links and screen
apps/mobile/src/features/session/      local user access UI
apps/mobile/src/features/recorder/     isolated simulated recorder feature
apps/mobile/src/features/plaud-device/ native connection state and recorder UI
apps/mobile/src/features/recordings/   library, player, transcript and local recording use cases
apps/mobile/src/features/transcription/ generated transcript state, polling and UI
apps/mobile/src/services/recordings/   persistent native-file/IndexedDB storage adapters
apps/mobile/src/services/              platform link, credential and journal adapters
apps/mobile/modules/plaud-sdk/         pinned official Swift/Kotlin bridge and iOS SDK binaries
apps/mobile/src/ui/                    shared native components and design tokens
apps/api/src/bootstrap/                validated configuration and entry points
apps/api/src/modules/identity/         replaceable session verification boundary
apps/api/src/modules/enrollments/      use cases and transactional repositories
apps/api/src/modules/recordings/       owned recording metadata and verified audio storage
apps/api/src/modules/transcription/    durable worker and replaceable Plaud provider
apps/api/src/modules/plaud-devices/     owned SDK sessions and cloud bind/unbind
apps/api/src/transport/http/           HTTP routes, role checks and origin policy
apps/api/src/infrastructure/           Postgres and immutable migrations
packages/contracts/src/                strict public schemas and inferred types
packages/api-client/src/               platform-neutral validated HTTP client
scripts/verify-boundaries.mjs          executable dependency-boundary checks
```

Client applications cannot import backend/Plaud server code. Contracts cannot depend on applications; the API client cannot depend on UI or server implementations. Shared package builds precede mobile/admin startup and native exports.

## Verify

```sh
pnpm check
pnpm format:check
TEST_DATABASE_URL=postgres://aptly:aptly_local_only@127.0.0.1:55432/aptly_mobile pnpm test:integration
TEST_DATABASE_URL=postgres://aptly:aptly_local_only@127.0.0.1:55432/aptly_mobile pnpm test:api-smoke
pnpm --filter @aptly/mobile exec expo install --check
pnpm --filter @aptly/mobile export
```

`pnpm check` runs workspace TypeScript, lint/import boundaries, tests and contracts/client/API/admin builds. Integration and runtime smoke checks use temporary schemas, not application-table truncation. The Expo export bundles iOS, Android and web JavaScript/assets; it does **not** compile/sign an IPA or APK or prove physical hardware operation.

## Remote pilot

The dashboard supports self-registration, owner-only assignments and an Android/iOS selector before QR generation. The QR opens a phone installation page with explicit return-and-continue behavior after installation. Android's signed standalone APK uses the real native SDK and bundles JavaScript; physical Android pairing and transfer still need testing.

Use `pnpm android:pilot` with an explicit `EXPO_PUBLIC_API_URL=https://api.plaud.aptlyable.info` for Android, and `pnpm pilot:package` for the Amplify website ZIP and separate backend archive. [Amplify hosting](docs/AMPLIFY_PILOT.md), [existing EC2 server setup](docs/EXISTING_EC2_PILOT.md), and [Android pilot details](docs/ANDROID_PILOT.md) give exact steps. See [current verification](docs/verification/REMOTE_PILOT.md) for what is live versus locally tested.

The temporary website is configured for `https://plaud.aptlyable.info`, with an API at `https://api.plaud.aptlyable.info`. The user will identify the existing Vaultwarden EC2 host; the API will be added separately after inspecting its current services. TestFlight requires Apple distribution setup; an unconfigured iOS download is shown as unavailable. Automatic server audio upload/transcription, AI summaries, cross-device storage, email verification/password reset and public-launch hardening remain separate work.

See [the enrollment flow](docs/ENROLLMENT_FLOW.md), [architecture review](docs/ARCHITECTURE_READINESS_REVIEW.md), [enrollment UI verification](docs/verification/ENROLLMENT_UI.md), and [hardware acceptance test](aptly-able-app-handoff/docs/HARDWARE_TEST.md).

# aptly-able-app

## App Store readiness

The `pilot` release channel preserves the current test workflow. `APTLY_RELEASE_CHANNEL=store` selects the narrower store feature surface and requires explicit production/native configuration. See [implementation status](docs/verification/app-store-readiness.md), [account-deletion operations](docs/verification/account-deletion.md), [iOS packaging](docs/verification/ios-store-packaging.md), [policy review](docs/APP_DATA_POLICY_REVIEW.md), and [reviewer preparation](docs/APP_STORE_REVIEW.md). Run `pnpm test:ios-store` for packaging fixture checks. Source readiness does not imply deployment, a signed distribution build or Apple approval.
