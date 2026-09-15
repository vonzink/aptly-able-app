# App Store Readiness Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for bounded implementation and review. Checkboxes track local completion, not publication or Apple acceptance.

**Goal:** Implement the audit's actionable submission blockers without breaking the existing pilot or claiming unverified vendor/legal readiness.

**Architecture:** Separate account-erasure lifecycle from identity and recorder assignment; expose versioned API contracts to a native account screen. Public privacy/support content has one shared source. An explicit store release profile hides unfinished promotions and rejects incomplete release metadata. Native resource packaging and distribution validation are reproducible build steps.

**Tech Stack:** Existing Expo/React Native/Swift/Kotlin, Fastify/PostgreSQL, Zod, pnpm/Vitest.

**Spec:** `APPLE_APP_STORE_AUDIT.md` and user's request to add the fixes.

## Global Constraints

- Preserve all existing uncommitted cleanup; no reset, broad formatting, deployment, push or real account deletion.
- New migrations only. No deletion claims until durable service/vendor work actually completes.
- Preserve recording audio unless the user explicitly confirms account-data deletion; explain hardware/external copies.
- Never invent a legal entity, support address, retention promise, vendor API or privacy assertion.
- Store profile must fail validation when mandatory owner/vendor evidence is absent; pilot remains usable.
- Physical testing, vendor attestation and Store upload approval stay explicit verification items.

### Task 1: Account deletion API and durable cleanup

**Files:** new `apps/api/src/modules/account-deletion/*`, migration `005_account_deletion.sql`, `transport/http/account-routes.ts`; wire server/app/identity/worker as required. New `packages/contracts/src/account.ts`, `packages/api-client/src/account.ts`; tests under matching test directories.

**Interface:** `POST /v1/account/deletion` with password and literal confirmation; typed request receipt, status and honest pending work. Client `createAccountClient({baseUrl,getCredential,fetch})` with `requestDeletion(input)`.

- [x] Write meaningful tests for unauthorized/wrong-password requests, idempotency, session revocation, worker/provider failure, erasure ordering and account isolation.
- [x] Implement a transactionally durable deletion request, account lockout and retryable erasure workflow. Coordinate in-flight device/transcription operations; do not fabricate vendor deletion endpoints. Track unresolved provider erasure explicitly and supply an operator procedure that cannot report success prematurely.
- [x] Implement contracts/client and document exact behavior for native UI integration.
- [x] Run focused tests and database integration when local Docker is available; no production operations.

### Task 2: Reproducible iOS resources and distribution validation

**Files:** `apps/mobile/plugins/withStoreReadiness.cjs`, `scripts/ios-store.mjs`, `scripts/verify-ios-store.mjs`, dedicated native manifest resources/configuration, script tests.

- [x] Inspect official Apple/SDK sources for correct manifests/reason declarations; never manufacture vendor attestation.
- [x] Fix reproducible copying of supplied Expo privacy resource bundles and remove unused FaceID declaration. Identify SDKs by provenance: React Native maintainers distinguish Meta Hermes from Apple-listed Imgur/Hermes. Do not require an unrelated vendor manifest by name alone; retain real required-reason and SDK privacy validation.
- [x] Add dry-run/unsigned archive validation and explicit distribution export path, production origin/native mode checks, required legal metadata checks, get-task-allow rejection and manifest inspection.
- [x] Keep pilot signing unchanged; document remaining SDK/signature/physical checks. Do not upload or regenerate shared native projects concurrently.

### Task 3: Public privacy/support and native account controls

**Files:** shared content under `packages/product-content`, mobile privacy/support/account screens, settings/account access links, public admin `/privacy` and `/support` routes.

- [x] Provide an accurate local-readable data handling page and public policy draft with explicit configuration for legal name/email; store validator requires owner-reviewed final values.
- [x] Add native support entry, privacy link at login, password-confirmed deletion UI with clear copy, recovery and durable success receipt.
- [x] Clear local session/device association after accepted deletion and offer scoped local recording cleanup without removing another account's data.
- [x] Verify accessibility labels, cancellation and failure behavior; typecheck and frontend preview.

### Task 4: Complete store feature surface and informed recording/sharing

**Files:** mobile release profile/config, firmware/transcription/settings/detail/home, shared recording-state banner, generation consent.

- [x] Use explicit `store` profile with supported local recorder workflow; hide unfinished promotions and manual cloud transcription until enabled deliberately with consent/deletion evidence.
- [x] Add persistent hardware recording state and participant-awareness messaging; do not falsely claim a disconnected device stopped recording.
- [x] Put named Aptly Able/Plaud upload disclosure and explicit affirmative consent before manual cloud transcription; retain local playback when declined.
- [x] Clarify temporary/kept audio, source files and server copies.

### Task 5: Integration, review and release handoff

- [x] Run workspace typecheck/lint/tests/build and relevant migration/lifecycle regressions; review complete change set against the audit.
- [x] Back up and complete non-clean store-profile native generation and Pod installation; confirm EXApplication/ExpoClipboard registration.
- [x] Complete and inspect a fresh unsigned native archive after the owner restarts the Mac. Xcode reported ARCHIVE SUCCEEDED and the packaged privacy/profile/permission checks passed.
- [ ] Complete physical testing, distribution signing/export and Apple validation after the remaining owner/vendor evidence is supplied.
- [x] Produce `docs/verification/app-store-readiness.md` mapping every critical/high audit item to implemented, owner input, vendor evidence or physical validation.
- [x] Keep App Store policy draft, metadata checklist, hardware review notes and exact distribution commands ready for owner review; no claim of deployment/submission.

## Decisions and progress

- Existing dirty source stays in the current checkout on a dedicated `codex/app-store-readiness` branch; moving it into a new worktree would split the user's active cleanup.
- Work starts immediately under the user's implementation approval. No additional plan-approval pause is needed.
- Corporate pages supplied by the user identify Aptly Able, LLC and info@aptlyable.com. These verified contacts are used; policy review flags remain false because the current corporate policy is website-focused.
- Account deletion is a request plus reliable erasure, not merely sign-out or recorder unpair.

## Completion evidence

- Source tasks completed locally; full remediation status is in `docs/verification/app-store-readiness.md`.
- Durable native recovery intent and a global deletion workflow lock were added after independent review caught response-loss and overlapping-screen risks. The follow-up review found no additional must-fix issues.
- 477 unit/model tests, 44 local database integration tests, 8 release/security fixtures, workspace typecheck/lint/build passed. Physical/device/distribution work remains pending.
- Existing source changes remain uncommitted alongside this implementation; no push, deployment or submission.

## Follow-up improvements

- Owner approved deletion within seven days. Migration 006 snapshots the deadline; status API returns deadline/completion time.
- In-app account creation uses the existing API; invitations remain in place.
- Pending status refresh works after sign-out, preserves receipt history and credentials on persistence failures, rejects wrong references/account changes, and reports overdue requests honestly.
- Supplied SDK reason declarations are aggregated into and verified against the main app privacy manifest without overwriting app collection/tracking fields.

- Remediated two transitive npm advisories with scoped, compatible overrides; malformed-link, normal enrollment URL and Xcode ID regressions pass. No advisory ignores were added.

- Post-restart native archive succeeded for build 6. Corrected the mistaken Meta Hermes/Imgur SDK-name privacy check using React Native maintainer guidance; all other SDK/privacy/evidence checks remain.
