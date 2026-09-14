# Enrollment dashboard and mobile connection implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the bounded implementation tasks and independent final review. Existing user approval is the instruction to continue the accepted admin assignment → QR → enrollment flow. Keep all changes within this app workspace; do not commit, switch branches, deploy or touch sibling applications.

**Goal:** Make the persisted enrollment workflow usable from an administrator dashboard and the shared iOS/Android enrollment screen, with an honest local sign-in boundary.

**Architecture:** A separate React web admin app consumes strict shared HTTP contracts. The API owns role checks, assignment history and invitation lifecycle. The mobile feature resolves/claims an invitation through a platform-neutral API client and controller, with platform link/storage adapters and no privileged code in the mobile bundle.

**Tech stack:** Existing TypeScript, React, Expo, Fastify, pg, Zod, Vitest; Vite for the separate admin app. Preserve existing Inter/navy/blue/orange/mint Aptly Able styling.

**Spec:** docs/ENROLLMENT_FLOW.md and docs/ENROLLMENT_API.md, as approved in the conversation.

## Scope decisions

- Local sign-in verifies the already-configured, separate administrator/user development access codes against /v1/session. No credential is embedded in a client bundle or URL or saved in browser storage. No cloud account/provider is created in this phase. An optional question is pending about an existing sign-in provider; independent dashboard/API work proceeds.
- Add a display name to users via a NEW migration; 001 is already applied and immutable. Admin can choose known users and inspect assignments. Account provisioning stays with the seed now and the future real sign-in system later.
- Admin dashboard shows assignments with person, recorder, serial suffix, invitation and setup status; select an assignment to issue/replace a QR, revoke an invitation, or release/revoke the assignment with explicit confirmation. Preserve current QR only in memory and label replacement behavior. Paginate server reads, never silently truncate.
- Issued link targets /enroll on the local mobile web preview. Parse fragment tokens, remove them from browser history promptly, never send them as URL queries. Manual link/code entry remains available for native testing. Verified HTTPS associations, store installation continuation and supported physical Plaud hardware remain later prerequisites.
- Mobile enrollment keeps the pending link across sign-in in memory, verifies assignee ownership through the API, then claims with a stable UUID key. Resume saved operation IDs after refresh/restart without retaining raw tokens or bearer credentials in ordinary preferences; native secret storage may retain a retry token only if needed and supported. Do not let the generic simulated recorder stand in for the server-assigned recorder.
- Completion is "Enrollment saved" with pending recorder setup. Hardware access stays disabled for real enrollments until the actual SDK is available. Preserve the original explicitly simulated experience as a separate preview.
- Add explicit origin allowlisting for local browser API calls; no wildcard credentials/CORS. All interfaces carrying development credentials remain loopback-bound.

## Task 1: Shared API and admin read model (root)

Files: packages/contracts/src/session.ts, enrollment.ts; apps/api/src/modules/enrollments/admin-queries.ts; transport/http routes; bootstrap/config/seed; new SQL migration; shared API client package; boundary tests.

- [x] Write boundary/read-model/session/CORS tests, run failing checks.
- [x] Implement role-bearing session response, display-name migration and user/assignment paginated reads with safe invitation/setup summaries.
- [x] Implement shared API client with response validation, timeout/cancellation and safe errors. No storage/UI dependencies.
- [x] Verify unit and isolated Postgres integration tests.

## Task 2: Admin application (root)

Files: apps/admin package/config/src; shared client and contracts consumed directly.

- [x] Build accessible local access screen and responsive assignment dashboard in Aptly Able's visual style.
- [x] Add person/recorder assignment form, detail panel, invitation QR and explicit destructive-action confirmation.
- [x] Handle empty data, permission/session expiry, in-flight duplicate clicks, failure recovery and late responses after sign-out.

## Task 3: Mobile enrollment feature (implementer)

Files: apps/mobile/src/features/enrollment/**, features/session/**, services/**, app/enroll.tsx, layout/provider integration, feature tests. Preserve unrelated recorder simulation.

- [x] Test link parsing, stable retries and stale response/account switching behavior first.
- [x] Add authenticated enrollment/controller/screens with platform adapters and hidden /enroll route.
- [x] Distinguish backend enrollment saved/pending from real Bluetooth completion, handle revoked/expired/wrong-user cases and resume operation safely.
- [x] Verify typecheck/tests and mobile exports.

## Task 4: Local run, review and verification (root + independent reviewer)

- [x] Add reproducible local setup/seed commands without embedding development credentials.
- [x] Run full workspace gates and actual Postgres/API flow.
- [x] Browser-test admin assignment → QR link → assignee sign-in → claim → admin revoke → assignee stale-state refresh at desktop and phone sizes.
- [x] Independent review; fix actionable issues and rerun affected checks.
- [x] Update operational documentation and verification report; show local preview. No deployment or hardware-ready claim.

## Progress

Completed locally on 2026-09-10. All implementation tasks and independent review fixes are complete. Final gates: 76 unit tests, 16 Postgres integration tests, compiled API smoke, workspace builds/typechecks/lint, formatting, peer/lockfile checks, and iOS/Android/web JavaScript exports passed. Browser assignment, QR opening, claim, reload recovery, revocation, replacement and failed-follow-up-read paths passed. See docs/verification/ENROLLMENT_UI.md for evidence and limits. Production provider remains undecided; local development authentication is the implemented boundary. No commit or deployment performed.
