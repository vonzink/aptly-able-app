# Aptly Able mobile architecture and readiness review

Date: 2026-09-10  
Status: Architecture accepted for the first foundation slice. Hardware integration remains unverified.

Implementation update: [Enrollment backend](verification/ENROLLMENT_BACKEND.md) now provides explicit SQL migrations, local admin/assignee roles, assignment/token lifecycle and pending setup operations. The earlier library list below is design history: this slice uses parameterized `pg` queries and versioned SQL rather than introducing an ORM.

Update 2026-09-10: The owner has an unsupported original Plaud Note and authorized beginning with the mock foundation. Enrollment is now admin-assigned and QR-led; see [ENROLLMENT_FLOW.md](ENROLLMENT_FLOW.md) for the updated setup contract. The original native-first sequencing below is retained as review history; physical proof remains a later gate.

## 1. Objective and boundaries

Build one shared TypeScript mobile application for iOS and Android that connects to a real supported Plaud recorder, exports MP3, uploads it to private Aptly Able storage, obtains a Plaud transcript, and displays audio and timestamped text. Both platforms are acceptance targets, not an eventual port.

The user has confirmed the supplied MVP and requested professional organization, separation of concerns, future security, and expandability. This document proposes the architecture; it does not approve implementation or claim the dependency stack is proven.

Source precedence: current user decisions, then the narrow technical MVP handoff, then the visual design for appearance and interactions. The original `plaude intergration` brief and visual prototype include later AI features. They do not expand this MVP. Preserve original handoff files as reference material.

Include now: connection, recording discovery, foreground MP3 export, private upload, transcription, player, timestamp seeking, rename, proper unbinding, development diagnostics and explicit mock mode. Exclude AI analysis, Wi-Fi transfer, recovery, OTA, notifications, automatic deletion, enterprise identity, sharing, organization administration, and background/resumable BLE. Recovery is a separately reviewed exception only if needed for the test recorder.

## 2. Approach comparison

| Approach | Advantages | Costs | Decision |
| --- | --- | --- | --- |
| Shared React Native/Expo app, thin native bridge, modular Node backend | Shared product behavior, isolated platform code, cohesive transactions, straightforward testing | Native integration still needs separate iOS/Android proof | Recommended |
| Separate Swift and Kotlin apps with shared backend | Direct access to each native SDK | Two UI implementations and duplicated product logic | Reserve for a demonstrated limitation of the shared approach |
| Shared app with microservices/event infrastructure immediately | Independent deployment and scaling | Extra contracts, operations and distributed failure cases before hardware is proven | Defer; module boundaries allow extraction later |

Use a modular monolith: one backend codebase with explicit feature modules and a worker entry point. Initially run one API process and one worker process from the same build. Postgres owns durable state and queued work. No Redis, message broker, service mesh or generic plugin framework in the initial design.

## 3. Proposed repository structure

The current folder is inside the existing Git repository at `/Users/zacharyzink/AptlyAble`; it is not an independent Git repository. Do not initialize a nested repository or change the parent build/deployment configuration implicitly. The following workspace can live under this folder.

```text
aptly-able-app/
  apps/
    mobile/
      src/
        app/                       route composition only
        features/
          session/
          recorder/                connect, status, unbind UI/use cases
          recordings/              library, sync, detail, transcript
          playback/                single player controller
          settings/
        platform/                  permissions, lifecycle, local files
        services/                  API, recorder and upload adapters
        ui/                        tokens and reusable native components
        bootstrap/                 dependency wiring; real/mock selection
      modules/plaud-sdk/            pinned vendor bridge, Swift/Kotlin/binaries
      plugins/                     reproducible native configuration
      app.config.ts
    api/
      src/
        bootstrap/                 config, API and worker entry points
        modules/
          identity/
          recorders/
          recordings/
          transcription/
        infrastructure/            database, S3, jobs, logs, secrets
        transport/http/            route registration and middleware
      migrations/
  packages/
    contracts/                     versioned Zod HTTP schemas and DTOs
    plaud-client/                  backend-only HTTP client and normalization
    tooling/                       shared TS/lint configuration when needed
  docs/
    ARCHITECTURE_READINESS_REVIEW.md
    decisions/                     approved architecture decisions
    verification/                  version manifest and hardware evidence
  pnpm-workspace.yaml
  pnpm-lock.yaml
  package.json
  aptly-able-app-handoff/           existing technical references
  design_handoff_aptly_able_mobile/ existing design reference and assets
```

Place the local Expo module under the mobile app rather than the monorepo root, avoiding a custom autolinking assumption. Verify discovery during the native feasibility milestone. Keep vendor attribution, upstream commit and binary checksums with the module; document local bridge changes separately.

Within a backend feature, separate HTTP handlers, application use cases, pure domain rules and persistence adapters where each has actual responsibility. Do not create empty architectural layers. No global miscellaneous `utils` or service holding all recording behavior.

Dependency rules:

- Screens call feature hooks/use cases; they never call the vendor SDK, S3 or Plaud HTTP endpoints.
- HTTP handlers validate/authorize input and invoke use cases; they contain no SQL or provider orchestration.
- Domain rules know no React, Expo, Fastify, AWS or database objects.
- Infrastructure implements narrow ports required by use cases. Wire dependencies explicitly at startup; no dependency-injection framework initially.
- Mobile may import contracts, never backend or Plaud server client packages. Contracts contain no database models or secret configuration.
- Features use public module APIs, not another feature's internal repositories. Enforce imports with lint restrictions.

## 4. Mobile architecture: iOS and Android

Use React Native + Expo development builds, TypeScript strict mode and Expo Router with thin route files. Native Plaud code requires a custom binary; Expo Go is not the hardware validation target. Expo documents the distinction in its [development build guidance](https://docs.expo.dev/develop/development-builds/introduction/).

Own state deliberately:

| State | Owner | Persistence |
| --- | --- | --- |
| Recording list, transcript, processing status | TanStack Query and backend | Postgres is authoritative |
| Recorder connection/session | Recorder coordinator with typed reducer; Zustand for observation | Connection itself is never restored as connected |
| Export/upload attempt | Transfer coordinator | Small local journal with account, recording, path, phase and attempt ID |
| Playback position/rate | One playback controller | Per-account recording preferences; no signed URLs |
| Form input and sheets | Local component state | None unless required |
| App session | Session adapter | Secure storage when persistence is required |

Start with one active recorder and one export at a time. A sequential sync queue can follow single-recording proof. Foreground transfer, reconnection, permission denial, Bluetooth-off, app backgrounding and screen navigation are different events. Navigating away must not destroy a valid coordinator subscription.

On restart, reconcile the journal with file existence and backend status. Never infer a successful export from a saved progress percentage. Retry interrupted BLE export from the beginning unless the pinned SDK proves resumability. Retry upload from a verified local MP3 where possible. Do not retain transcripts in ordinary persistent query caches by default.

Use a dedicated mock build configuration that excludes the vendor binary from unsupported simulator builds. A JavaScript availability guard cannot fix a native linker failure. Never silently switch a hardware build to mock mode. Display an obvious mock indicator.

Playback uses one source of truth for current time, highlighting and seek. Use platform audio interruption handling; on expired playback URL, obtain another authorized URL and restore position. Keep local paths and signed URLs out of domain identity.

Preserve the supplied colors, typography, light/dark modes, assets and native accessibility. Adapt unavailable screens to the MVP: no AI summary tab, recovery action, deletion toggle or promise of completion notifications. Processing copy should say that the transcript continues processing and can be checked later. Do not fabricate transfer time estimates or waveform data as measured audio.

## 5. Native Plaud boundary

`RecorderAdapter` exposes initialize, replace token if supported, scan/stop, connect, disconnect, list files, export MP3, depair and dispose. An event subscription exposes typed scan results, connection stages, ready evidence, battery/storage, export progress and failures. Capabilities explicitly identify supported cancellation/token-update/status operations; unsupported methods return a typed error.

The real adapter translates vendor data into app-owned models. The mock implements the same contract. UI code does not know vendor callback names. Preserve serial number as durable recorder identity and BLE address/UUID only as session connection data.

The coordinator registers listeners before commands, associates callbacks with a connection/export generation, ignores stale completions, removes listeners on disposal, and serializes conflicting operations. Native bridge code must marshal events appropriately and resolve each command exactly once, including timeouts and teardown.

Cloud bind success and BLE readiness are separate facts. Do not declare ready from an HTTP response or a generic transport-connected event. Determine the actual secure-ready callback evidence on both pinned native implementations during feasibility testing.

Do not expose source-file deletion through the MVP adapter. Keep Wi-Fi/recovery/OTA as documented future capability boundaries rather than unused implementations.

## 6. Backend and security foundations

Recommended libraries: Fastify for HTTP, Zod for contracts, Drizzle + `pg` for explicit SQL/migrations, AWS SDK v3 for S3, pg-boss for durable jobs, Pino for structured logs, Vitest for pure/backend tests, React Native Testing Library for UI behavior. These are proposed selections, not installed or compatibility-tested dependencies. Use the Node runtime's HTTP facilities for the small Plaud client.

Every use case receives a server-established `ActorContext` with a stable internal user ID. Identity verification and resource authorization are separate. Do not trust a mobile-supplied user ID as authentication. Ownership checks apply to reads, token minting, recorder actions, retries, transcripts and every signed URL.

For local proof, allow a dedicated development session mechanism only in explicit development configuration. It maps an opaque credential to an internal UUID on the server, is excluded from production configuration, and fails startup if enabled in production. Do not distribute a shared credential in a public build. A real identity provider is required before broader distribution, but the domain layer remains unchanged when one is added.

Baseline design requirements now:

- Private S3, TLS outside loopback development, encryption at rest and least-privilege runtime access.
- Backend-only partner credentials and transcription key; short-lived user tokens provided only to the authorized mobile session.
- Validate input and provider output; cap text lengths, page size, file size and request rates.
- Never log tokens, transcripts, audio, signed URL query strings or unredacted vendor bodies. Request IDs and sanitized error codes provide diagnostics.
- Check ownership through scoped queries, not only UI filtering. Add cross-user denial tests immediately.
- Keep app-private temporary audio; clean it up after confirmed upload when no longer needed. Logout clears session/cache/journal references and follows an explicit local-file cleanup policy.
- Maintain an audit event boundary for recorder binding, upload confirmation and processing retries. Store actor/resource/action/time/outcome, not content.

Future organization security belongs behind an authorization policy boundary. Do not pretend a nullable `tenant_id` provides isolation. Before multi-tenancy, add organizations/memberships, backfill ownership, enforce scoped foreign keys and indexes, consider database RLS, and prove cross-organization denial. Existing identity and ownership data make this a migration rather than a rewrite.

Future AI analysis consumes a persisted transcript/audio reference through a new application use case. Give it its own attempts, results and authorization. A failed AI task must not make an available transcript disappear or change a completed recording back to failed.

## 7. Plaud HTTP boundary

`packages/plaud-client` owns partner-token acquisition/refresh, user-token minting, cloud bind/unbind/binding lookup, transcription submission/status, response validation, timeouts and sanitized provider errors. Application services own workflow decisions and persistence.

Cache partner tokens with expiry skew and single-flight refresh in the process. Avoid concurrent refresh-token rotation across processes: initially only the API manages partner tokens; the worker uses the separate transcription API credentials. Multi-instance deployment requires a coordinated token manager before scaling that path.

Maintain separate credentials for the two API families. The mobile app calls only our backend for HTTP operations. Keep Plaud binding's true/false/null state distinct from local Bluetooth state. Do not retry ownership conflicts, malformed requests or every POST indiscriminately.

The transcription endpoint, separate header authentication and polling behavior match the supplied handoff. There are still documentation discrepancies described in section 13. See [Plaud transcription overview](https://docs.plaud.ai/plaud-embedded/transcription-api-overview) and [endpoint reference](https://docs.plaud.ai/api-reference/transcription-api/submit-audio-for-transcription).

## 8. Proposed database schema

Use UUID identifiers, UTC `timestamptz`, explicit status checks, foreign keys and append-only migrations. Durations use fractional seconds where appropriate; storage sizes use `bigint`. Map values safely at the JSON boundary. Index ownership plus list ordering and due jobs.

| Table | Main fields and constraints |
| --- | --- |
| users | id, identity_issuer, identity_subject, created_at; unique issuer/subject for authenticated identities |
| recorders | id, serial_number unique, model, last_seen_at, optional firmware/status metadata |
| recorder_assignments | id, user_id, recorder_id, assigned_at, status; one active assignment per recorder; assignment owner/recorder identity immutable |
| enrollment_tokens | id, assignment_id, token_hash unique, expires_at, used_at nullable, created_at; recommended revoked_at nullable for QR cancellation/replacement |
| recordings | id, user_id, recorder_assignment_id, source_session_id, title, recorded_at nullable, duration_seconds, size_bytes, status, revision, timestamps; unique assignment/session |
| upload_attempts | id, recording_id, object_key unique, expected_size/checksum, object_version, status, expires_at, completed_at |
| transcription_attempts | id, recording_id, provider, provider_task_id unique when known, state, attempt_number, next_poll_at, sanitized_error_code, timestamps |
| transcripts | id, recording_id unique, successful_attempt_id, language nullable, full_text, normalized_segments JSONB, schema_version, created_at |
| audit_events | id, actor_id, action, resource_type/id, outcome, request_id, created_at |
| job tables | pg-boss-owned schema; durable dispatch and retries |

Assignments and enrollment tokens have separate lifecycles. `recorder_assignments.status` describes allocation (`active`, `released`, `revoked`), not Bluetooth readiness. One assignment can have multiple historical enrollment tokens so an expired or replaced QR does not require a new assignment. Reassignment closes the old assignment and creates a new row; it never edits the old row's user or recorder. Revoking/releasing an assignment invalidates all of its outstanding tokens and incomplete setup operations.

`enrollment_tokens.used_at` records successful authenticated redemption into a persisted setup operation, not scanning the QR and not completing Bluetooth pairing. Consume the token and create the operation atomically. Retry interrupted pairing through that operation without making the QR reusable. Keep cloud/local setup progress on the setup operation, separate from assignment status and token usage. See [the enrollment data model](ENROLLMENT_FLOW.md#data-model) for fields, constraints and retry behavior.

Recordings retain their original owner when a recorder changes hands. Keep assignment history so the new owner cannot inherit the previous owner's database records. The physical recorder may still contain earlier recordings; do not auto-import all files on reassignment. Surface the limitation for product policy before supporting shared/resold recorders. The single-user proof does not establish safe hardware handover.

The assignment/session uniqueness is an initial deduplication rule. Verify source session ID stability and reuse behavior on hardware; if IDs can repeat within an assignment, extend the fingerprint before accepting duplicates. Never use the mutable title as identity.

Store normalized segments as `{startSeconds, endSeconds, text, speakerId?, language?}`. Validate finite/nonnegative times, end >= start, and deterministic ordering. Missing speakers stay absent; do not invent diarization. JSONB is adequate for MVP display; move segments to rows only when querying/editing needs justify it.

## 9. S3 MP3 and transcription flow

1. Export a real MP3 to app-private storage and record its size/checksum where practical.
2. Create/get a recording by the authorized assignment and source identity. Repeated requests must return the existing resource.
3. Request a bounded upload attempt. Server chooses its unique object key and signs a PUT for that attempt with required headers and expiry. The client cannot choose arbitrary bucket keys.
4. Stream the local file directly to S3 without loading the whole audio into JS memory. A native-capable upload adapter reports actual progress; exact transport is selected during feasibility testing.
5. Complete upload with the attempt ID. Backend authorizes it, checks object existence, expected length and checksum where available, and rejects an invalid attempt. Content type alone is not proof of MP3 validity.
6. Use versioned S3 objects and pin the verified object version, so an unexpired PUT cannot replace the audio used by transcription. Confirm this through integration tests. Alternatively promote to a server-owned immutable key; choose one strategy, not both. Recommendation: versioning plus version-specific reads.
7. Atomically persist accepted upload state and durable dispatch intent. Verify the selected job library's transaction integration; otherwise use an outbox row in the same database transaction and a dispatcher. A process crash cannot lose the task.
8. Worker generates a temporary GET for the verified version and submits to Plaud. It persists the returned provider ID, polls, validates and normalizes the successful result, then commits the transcript and complete status together.
9. Mobile polls our status endpoint; authorized playback URL issuance is separate and refreshable. The bucket remains private.

PUT URLs initially expire after 15 minutes; playback URLs after 15 minutes. Transcription fetch URLs initially target one hour, bounded by the signing credential lifetime. These are proposed defaults, not verified provider fetch guarantees. Confirm delayed fetch behavior during real testing; generate fetch URLs only when dispatching, not when upload begins.

Poll after approximately 15, 30, then 60 seconds with jitter. Coordinate submission and polling under a shared per-application rate budget, honor Retry-After, cap retries and age, and persist next-attempt times. Use one worker initially; add global coordination before multiple independent workers. Long-running or unknown provider states require a visible delayed/needs-attention status, not endless polling or invented success.

An HTTP timeout after submission may mean Plaud accepted a task whose ID we never received. No provider idempotency guarantee was verified. Mark that attempt `SUBMISSION_UNKNOWN`, stop automatic resubmission and surface a deliberate retry/reconciliation action with possible duplicate processing. Do not claim exactly-once provider submission. Known task IDs are polled again, not resubmitted.

## 10. State machines and recovery

Model connection and cloud ownership separately.

```text
Connection:
DISCONNECTED -> PERMISSION_CHECK -> SCANNING -> FOUND
 -> CLOUD_BINDING -> CONNECTING -> SECURING -> READY

Branches: PERMISSION_DENIED, BLUETOOTH_OFF, SCAN_TIMEOUT,
OWNERSHIP_CONFLICT, CONNECTION_FAILED, DISCONNECTED_UNEXPECTEDLY

Removal:
READY -> CLOUD_UNBINDING -> LOCAL_DEPAIRING -> DISCONNECTED
                                -> LOCAL_DEPAIR_PENDING (on failure)
```

Only verified SDK readiness enters READY. The administrator creates an assignment first. Authenticated enrollment-token redemption creates a persisted setup operation before cloud mutation so an interrupted setup can be reconciled. Token redemption does not mark pairing complete. On cloud success/local failure, retain the partial operation state and re-query before retrying. Unbind requires an available connection; do not report success until both halves finish. A successful transport disconnect alone does not release ownership. If local depair succeeds but its acknowledgement is lost, reconcile instead of promising a clean result.

```text
Phone transfer:
ON_RECORDER -> EXPORTING -> LOCAL_READY -> UPLOADING -> UPLOADED
              |                         |
         EXPORT_FAILED             UPLOAD_FAILED

Backend processing:
AWAITING_UPLOAD -> UPLOADED -> QUEUED -> SUBMITTING
 -> TRANSCRIBING -> COMPLETE

Branches: SUBMISSION_UNKNOWN, TRANSCRIPTION_FAILED, NEEDS_ATTENTION
```

Terminal actions are guarded by attempt ID and revision so late callbacks/jobs cannot overwrite a newer result. Export retry preserves the recorder source; upload retry reuses only a verified local file and gets a new upload attempt when necessary; transcription retry preserves uploaded audio. Cancellation ends the local attempt and ignores stale events; actual SDK cancellation support must be tested. Source recordings are never deleted.

## 11. Proposed HTTP contract

All `/v1` endpoints require the app session except a deliberately isolated development session exchange. Server derives ownership. Request bodies and responses use shared schemas; errors have a stable code, safe message and request ID. List endpoints use bounded cursor pagination.

| Method/path | Purpose |
| --- | --- |
| POST /v1/plaud/user-token | Mint token for authenticated actor, never an arbitrary user |
| GET /v1/recorders | Actor's recorder assignments and cloud/setup state |
| POST /v1/recorders/bind | Start/reconcile cloud bind operation |
| GET /v1/recorders/:id/binding-state | Authorized ownership lookup |
| POST /v1/recorders/:id/unbind | Start/retry cloud unbind |
| POST /v1/recorders/:id/local-state | Record mobile readiness/local depair outcome against operation ID; never grant authorization based on it |
| POST /v1/recordings | Idempotently register source recording |
| POST /v1/recordings/:id/upload-attempts | Issue/renew scoped upload attempt |
| POST /v1/recordings/:id/complete-upload | Verify the attempt and schedule processing |
| GET /v1/recordings | Paginated library |
| GET /v1/recordings/:id | Recording detail and transcript availability |
| GET /v1/recordings/:id/transcript | Normalized transcript |
| GET /v1/recordings/:id/status | Compact processing state |
| POST /v1/recordings/:id/playback-url | Issue authorized temporary audio URL |
| PATCH /v1/recordings/:id | Rename with optimistic revision check |
| POST /v1/recordings/:id/transcription-retries | Explicit eligible retry with attempt guard |
| GET /health/live; GET /health/ready | Minimal operational health, no secrets/config disclosure |

The local-state endpoint records reported device evidence; it does not establish trusted cloud ownership. Concrete body schemas and transition guards are part of the implementation plan after design approval. Splitting registration from upload issuance supports retry without duplicate recordings.

## 12. Versions and cross-platform readiness

Evidence checked on 2026-09-10. The current [Expo compatibility table](https://docs.expo.dev/versions/latest/) lists Expo 57.0.0 with RN 0.86, React 19.2.3, Android 7+, compile/target SDK 36, iOS 16.4+, Xcode 26.4+, and Node minimum 22.13.x. This is the proposed compatibility family; it is not a tested lockfile.

| Component | Proposed baseline | Verification status |
| --- | --- | --- |
| Expo | 57.0.0 compatibility baseline; resolve supported exact patch before install | Official table and Plaud README agree on SDK family |
| React Native | Expo-compatible 0.86 patch, not independently selected | Exact patch not retrieved |
| React | 19.2.3 | Listed by Expo; not built locally |
| Plaud native SDK | Evaluate published 1.0.13 | Changelog entry verified; bundled binaries not verified |
| Plaud Expo bridge | Immutable upstream commit plus binary SHA-256 hashes | Unresolved: direct source/API requests returned 404 |
| iOS / Xcode | 16.4+ / 26.4+ for proposed Expo family | Product minimum is a proposal; local tools unverified |
| Android | Android 7+; compile/target SDK 36 | Exact Gradle, AGP, Kotlin and JDK combination must follow retrieved template/module |
| Node / pnpm | Supported Node release meeting Expo minimum; exact Node and pnpm versions recorded together | Not pinned or installed in this phase |

The [Plaud changelog](https://docs.plaud.ai/plaud-embedded/changelog) lists 1.0.13 on August 24, 2026. The [repository README](https://github.com/Plaud-AI/embedded-react-native) describes an Expo 57 demo and local iOS/Android module. However, requests for its `main` commit, demo package.json, podspec, Gradle file and TS interface via GitHub API/raw URLs all returned 404. A readable or cached README cannot establish a source hash, available binary or build compatibility. The direct Plaud React Native docs page also failed retrieval.

Do not fill the missing pins with guesses. Obtain source access or a vendor archive, inspect dependency manifests and licensing, capture checksums, resolve a complete exact lockfile, and build both platforms before signing off the version manifest. If support for iOS 15 is required, revisit the Expo family explicitly; do not merely lower deploymentTarget.

Physical iPhone + Android handset + Note Pro or NotePin S are required. Supported recorder models are confirmed by [Plaud's device page](https://docs.plaud.ai/plaud-embedded/devices). Plaud's [iOS SDK page](https://docs.plaud.ai/plaud-embedded/ios-sdk) explicitly excludes simulator support. Portal credentials, signing access, hardware, AWS configuration and reachable Postgres have not been verified in this review.

## 13. Corrections and unresolved external discrepancies

| Handoff/source claim | Finding | Proposed resolution and reason |
| --- | --- | --- |
| iOS 15.1, Xcode 16, Expo 52+, Node 20+ are conservative defaults | Expo 57 has higher requirements | Use the compatible complete stack in section 12; older independent minima do not establish compatibility |
| Version pins can be selected from docs | Source/manifests inaccessible in direct requests | Hold exact pin approval until source and binaries are available |
| Generated Plaud client could use supplied OpenAPI | Downloaded transcription JSON fails strict parsing at line 131, column 23 (trailing comma) | Use a small manually validated client initially; preserve a documented corrected fixture if code generation is later justified |
| Transcription maximum is 24h | Endpoint reference says 24h / 6h diarization; overview recommends chunking above 5h | MVP uses short recorder clips, never claims 24h validation; confirm limits with Plaud before long audio support |
| One canonical transcript shape | Overview uses segments/speaker; OpenAPI uses results/speaker_id | Normalize both and test fixtures; app sees one contract |
| Automatic resume implied by UI | No pinned SDK proof of resumed export | Say retry; restart BLE transfer unless support is demonstrated |
| Device owner on a single mutable devices row | Reassignment can mix historic ownership | Separate recorder identity, assignment history and immutable recording owner |
| Source deletion allowed after upload in design | Technical MVP prohibits recorder deletion entirely | Omit deletion controls and methods |
| Settings say disconnect | Transport disconnect and full ownership removal differ | Use clear confirmation and two-part unbind workflow; retain partial failure |
| Security is a later phase | Deferring ownership and secrets boundaries creates rework | Put baseline checks in now; defer enterprise policy/UI |
| Database comes after binding phases | Bind needs persistent identity/partial-operation state | Bring minimum user/recorder/assignment migrations into backend foundation |
| Tests/debug/mock added at the end | Integration depends on reliable transitions and evidence | Add them alongside each slice |
| AI/recovery/notifications shown in visual handoff | Outside confirmed technical MVP | Remove those actions/promises from initial native screens |

These discrepancies are reported before implementation, as required by the handoff. The review can proceed; integration code must wait for resolution of its relevant external contracts. No vendor calls using private credentials were made.

## 14. Verification and implementation order

First implementation milestone after approval: **prove a real local MP3 export on both phone platforms**, using a minimal test screen and backend token boundary. This is smaller and more informative than building all designed screens first.

Sequence:

1. Obtain/inspect Plaud sources and manifests; record immutable pins and licensing. Confirm test recorder and phone OS versions, developer access and backend credentials without putting secrets in chat.
2. Build a minimal native harness and backend token endpoint; include stable identity and the minimum persistent assignment state needed for safe binding. Keep vendor demo secrets out of the app.
3. On physical iOS and Android, scan, bind, observe verified ready state and battery/storage, discover a short real recording, export a playable MP3, then cleanly unbind before moving the recorder between test identities/builds.
4. Capture exact build/toolchain versions and hardware outcomes. A single platform passing does not close this milestone. If the bridge lacks required behavior, propose a narrow native change before expanding the UI.

After that milestone: build the shared product shell and design tokens; add validated S3 upload; add durable transcription; complete library/player/transcript; run the full supplied hardware acceptance test independently on both platforms. No production deployment is part of this design phase.

Verification belongs to each slice:

- Unit tests for connection/transfer transitions, stale callbacks, retry eligibility and normalization.
- Adapter contract tests for event cleanup, error mapping, timeout and cancellation behavior.
- Database/API tests for cross-user access denial, duplicate registration/completion, reassignment history and optimistic updates.
- Job tests for process restart, upload-to-job dispatch durability, duplicate delivery and ambiguous submission.
- S3 integration tests for checksum/length validation, wrong object/attempt rejection, version-pinned reads and expired URL renewal.
- Native UI tests for permissions, navigation, large text and playback behavior; hardware evidence for actual BLE/audio.
- CI type checks, import-boundary linting, unit/integration tests and both native build targets. Simulator tests use the mock build; they do not count as hardware proof.

## 15. Review decisions

Recommended approval scope: architecture and module boundaries, baseline ownership/security controls, both mobile platforms, the smaller native feasibility milestone, and treating supplied designs as MVP-adapted visual references.

Unresolved prerequisites are explicit: exact vendor source/binary access, complete version pins, compatible physical phones/recorder, credentials/signing and the actual supported minimum OS decision. The proposed modern baseline is iOS 16.4+ and Android 7+, subject to native proof and the owner's support requirements. Neither an implementation schedule nor a hardware-ready claim is justified yet.

This review was originally design-only. Foundation implementation status is now tracked in `docs/verification/FOUNDATION.md`. Parent-repository settings remain outside this project scope.
