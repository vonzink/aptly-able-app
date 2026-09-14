# Assignment and enrollment backend

Approved scope: implement the database and API portion of docs/ENROLLMENT_FLOW.md. Work stays local in the existing app directory; no commits, branch changes, deployment, real login, app-link hosting or Plaud SDK integration in this phase.

## Design

- Shared strict request/response contracts; HTTP transport authenticates, validates, and maps safe domain errors. Server-side actor roles distinguish local administrator and assignee credentials. Neither credential is permitted in production.
- Enrollment service and Postgres repository own transactional state, independent of Fastify and mobile code. Versioned SQL migrations run explicitly with checksums and a migration lock. Development seed creates only configured user IDs.
- Store users, recorders, immutable-owner assignments, hashed enrollment tokens, pending/revoked setup operations, and minimal audit events. One active assignment per recorder. Tokens contain 32 random bytes; only their SHA-256 digests persist.
- Administrative APIs create assignments from a known user and full recorder serial, issue/replace enrollment invitations, revoke invitations, and end assignments. No implicit reassignment. Reassignment follows explicit release/revocation and a new assignment.
- All lifecycle mutations lock the recorder, then its assignment, then its tokens/operations. Claim rechecks ownership, active state, expiry, revocation and single use after locking. A user-scoped UUID idempotency key returns the original operation on an exact retry, including after token expiry, but never revives a revoked assignment/operation. A key reused with a different token conflicts.
- Token issuance returns an enrollment URL and QR SVG once. Require an explicitly configured HTTPS enrollment base URL (loopback HTTP allowed locally); put the token in the URL fragment. Landing page and native link handling are subsequent work. No full serial, user identity, or authentication credentials appear in the QR.
- A setup operation remains pending. There is no completion API until device/cloud evidence can be verified.

## Tasks

1. Root: shared contracts, local admin identity, HTTP validation and QR response handling; tests for auth and input boundaries.
2. Backend implementer: migration runner/SQL, seed support, service/repository, actual Postgres integration tests including concurrency, replay, expiry, replacement, revocation, reassignment and audit/secret persistence.
3. Root: server wiring, runnable commands, explicit development configuration, integration and runtime smoke checks, updated API and verification documentation.
4. Independent review of schema/service/transport; resolve actionable findings and rerun affected checks.

## Verification

Keep ordinary unit tests database-independent. Run integration tests explicitly against newly created isolated test schemas in the task's local Postgres container; never truncate application tables. Prove migrations are repeatable and detect edited history, single-use claims are transactional, simultaneous retries converge, wrong users cannot learn assignment details, and tokens never persist in plaintext. Run pnpm check, format check, actual Postgres integration suite, migration twice and runtime API smoke. Preserve the existing mobile preview and mock behavior.

## Progress

- Tasks 1–3 complete: contracts, role/config boundaries, HTTP/QR handling, migrations, service/repository, seed commands, isolated database/runtime tests and API documentation implemented.
- Task 4 complete: independent final review found no actionable issues; 23 reviewer-run boundary tests passed.
- Final gates: pnpm check (38 unit tests), Postgres integration (14 tests), compiled API smoke, formatting, peers and frozen lockfile install passed.
- Local migration applied twice; one version retained, zero application users/assignments. Temporary schemas removed and database container stopped with volume retained.
- Exact scope and operational evidence are recorded in docs/verification/ENROLLMENT_BACKEND.md.
