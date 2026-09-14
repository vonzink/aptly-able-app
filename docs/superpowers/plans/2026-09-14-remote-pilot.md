# Remote pilot implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or inline execution. Preserve this untracked working application; do not commit or change branches.

**Goal:** Make one website the starting point for self-service recorder enrollment and app installation.

**Architecture:** Hosted pilot accounts feed the existing identity boundary. Owner-scoped workspace routes reuse enrollment persistence. A platform-aware installation page opens the existing native enrollment route. Amplify hosts the dashboard/APK. Docker Compose isolates the API/database on the existing EC2 host, behind its existing Caddy proxy.

**Tech Stack:** Node 24.13, pnpm 11.19, Fastify 5, Postgres 17, React 19, Expo 57, Android Gradle, Caddy.

**Spec:** ../specs/2026-09-14-remote-pilot-design.md

## Global constraints

Preserve Swift/Kotlin/shared UI, local sign-in, assignment/token separation and fragment tokens. Never grant admin through signup. Do not alter applied migrations, uninstall devices, create the declined Lightsail server, or commit unrelated/untracked files. Later user authorization covers Amplify deployment, the identified EC2 host and DNS setup. Do not claim hardware acceptance from emulator tests.

## Task 1: Hosted accounts

Files: new `packages/contracts/src/auth.ts`, `packages/api-client/src/auth.ts`,
`apps/api/src/modules/identity/pilot-identity.ts`, password helper,
`apps/api/src/transport/http/auth-routes.ts`, migration 004 and auth tests.
Modify identity types, session contract, bootstrap config/server/app and async
authentication call sites. Do not modify enrollment/admin route authorization
beyond awaiting verification; the orchestrator owns workspace endpoints.

- [x] Implement strict schemas: registration displayName 1–120, normalized email,
  password 12–128; login email/password; `{credential, expiresAt, session}` response.
- [x] Add account/password and hashed session tables. Register user and account in
  one transaction; duplicate email cannot create orphan users. Use bounded scrypt
  work and constant-time verification. Unknown users still perform password work.
- [x] Implement pilot identity factory over pg.Pool, register/login/verify/logout,
  seven-day expiry, session revocation and selfService capability. Never admin.
- [x] Expose auth config/register/login/logout with bounded throttling and safe
  errors. Wire `PILOT_AUTH_ENABLED=true` to require a database. Keep dev credentials
  forbidden in production. Add fetch auth client independent of UI.
- [x] Add meaningful auth unit/integration tests; use temporary database schemas.

## Task 2: Owner workspace and platform QR

Files: enrollment service/repository, admin queries, HTTP admin/enrollment routes,
contracts enrollment schema, API client types/index, owner integration tests.

- [x] Add self-service permission to domain validation. For non-admin actor,
  require `input.userId === actor.userId` before create and enforce ownership on
  locked assignment for issue/revoke/end. Filter every query by owner.
- [x] Keep `/v1/admin` admin-only. Register equivalent `/v1/workspace` routes for
  hosted testers. API client option `workspace: 'self'` selects that route prefix.
- [x] Add optional platform to invitation request. Build HTTPS URL with
  `url.searchParams.set('platform', platform)` and `url.hash = new URLSearchParams({token})`.
- [x] Test two users cannot inspect or mutate each other's records/tokens and
  invalid platform is rejected before token creation.

## Task 3: Account UI, QR choice and installation continuation

Files: admin App/session/dashboard/assignment components, new installation feature,
admin styles and mobile LocalAccessCard; API auth client consumed by both.

- [x] Show registration/login for configured hosted pilot; retain explicit local
  code entry only when backend advertises it. Same account signs into phone.
- [x] Default a sole assignee to self and NotePin S as model. Add Android/iOS radio
  choice immediately before Generate QR. Changing choice clears any displayed QR
  so platform copy never disagrees with the invitation.
- [x] Route `/enroll` to a page validating the fragment token without consuming
  it. Display platform download and an `aptlyable://enroll#token=...` continue link.
  Missing download gets unavailable copy. Explain return after installation.
- [x] Verify desktop and narrow phone layout and cross-platform invitation parsing.

## Task 4: Standalone builds and AWS handoff

Files: new Android pilot build script, app config plugin for release signing,
deployment Dockerfiles/Compose/Caddy configuration, example environments, handoff.

- [x] Pin an explicit HTTPS pilot API URL, bundle JavaScript, sign with a private
  ignored pilot keystore and build normal native Android release. Preserve preview
  application package. Verify signature, package and bundled assets; launch in
  emulator if possible without claiming Bluetooth acceptance.
- [x] Produce production Docker images, persistent Postgres/audio volumes, HTTPS
  reverse proxy, static install/download hosting, migration command and healthcheck.
- [x] Document commands to provision server, attach DNS, copy private environment,
  start services, verify health, back up signing key/database and roll back images.
- [x] Run `pnpm check`, relevant integration tests, UI walkthrough and native build.
  Record exact remaining physical Android and Apple/TestFlight actions.

## Progress

Implementation and hosted web/API acceptance completed. Physical Android acceptance and signed iOS/TestFlight distribution remain open; see docs/verification/REMOTE_PILOT.md. User authorized deployment and DNS setup; no additional design approval is required. Work remains in the supplied application directory
because git worktrees would omit its currently untracked source and SDK assets.
