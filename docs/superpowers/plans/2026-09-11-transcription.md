# Automatic transcription implementation plan

> Execution: inline integration with independent provider and mobile work delegated using the parallel-agent skill; source review before completion. Existing approval covers this implementation. No commits or parent repository changes.

**Goal:** upload imported audio, persist/recover a Plaud transcription job and display its generated transcript.
**Architecture:** modular API + Postgres queue, local audio staging and replaceable provider; mobile action and polling alongside current local library.
**Tech stack:** existing TypeScript, Fastify, pg, Expo, React Native and Zod. Use installed platform/file/network APIs.
**Spec:** ../specs/2026-09-11-transcription-design.md

## Global constraints

- Work only under aptly-able-app; preserve concurrent/unrelated files; no commits, deployment or cloud provisioning.
- Production security and hardware work are deferred; preserve existing actor checks and local features.
- Secrets remain backend-only, never log audio/transcript/provider response bodies.
- Actual Plaud credentials absent: complete implementation and test substitutes, label live provider acceptance unverified.
- Applied migrations are immutable; add 003.
- Audio maximum 250 MiB; requests publish only verified files. No automatic resubmission after ambiguous provider POST.

## Tasks and interfaces

1. Root: public contracts in packages/contracts/src/transcription.ts + meaningful schema tests. Define registerRecordingSchema, processingRecordingSchema, transcriptionCapabilitiesSchema, retryTranscriptionSchema; corresponding inferred types. Both workers consume these stable interfaces.
2. Provider worker: apps/api/src/modules/transcription/{provider.ts,plaud/**}, apps/api/test/plaud-transcription.test.ts. Implements the exact provider port in the spec; Node file reads in bounded parts, MD5, sequential ETag upload, explicit auth, strict status/result normalization. HTTP transport is injectable and defaults to fetch. Read Plaud skill/official docs. Unit protocol tests precede implementation.
3. Root: infrastructure migration003, disk storage, record service/repository, worker loop and HTTP routes. Test streamed wrong length, duplicate registration/upload, account isolation, crash recovery, ambiguous submission, polling/retry and terminal states using actual temporary files/Postgres. Root wires config, server lifecycle and migration setup. Use the provider port from task2.
4. Mobile worker: separate processing API client; feature controller/provider/UI and native/web audio upload transport. Reuse current sign-in, preserve imported transcripts and local deletion. Root wires shared credentials and processing context; worker owns generated transcript display integration. Test stale results, cancellation/account changes, polling and duplicate button actions. Actual binary uploads use local saved audio, never temporary picker state.
5. Root + read-only reviewer: run checks, local migration, browser acceptance, all-platform bundles, and document what is live versus fixture-tested. Resolve review findings and add setup instructions without inventing provider readiness.

## Progress

- Contracts, provider, backend storage/worker/routes, mobile controller/UI and shared credentials integration are implemented.
- Migration 003 is applied locally. Existing enrollment migrations remain unchanged.
- 198 workspace tests and 22 PostgreSQL integration tests pass. The independent source review passes after fixes for saved-result access and native MIME normalization. Browser synthetic end-to-end acceptance, reload recovery, disabled-provider retrieval and timestamp playback pass.
- Metro's shared ApiError circular import was removed. Native regression executes the installed Expo request normalizer; the literal test import also passes the unchanged import-boundary verifier.
- Setup and limits are documented in `docs/TRANSCRIPTION.md`; evidence is recorded in `docs/verification/TRANSCRIPTION.md` and the provider/mobile/review reports. Final formatting and iOS/Android/web exports passed.
- Live Plaud and physical-device acceptance remain pending credentials and device execution. No production deployment or security expansion was performed.
