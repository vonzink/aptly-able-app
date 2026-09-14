# Enrollment backend independent review

Date: 2026-09-10. Review is limited to the approved local backend phase. Production authentication, frontend/native links, Plaud cloud binding and hardware completion are outside this phase.

## First pass: contracts, identity and HTTP transport

No actionable correctness or authorization findings in the inspected transport scope.

Inspected `packages/contracts/src/enrollment.ts`, `apps/api/src/bootstrap/config.ts`, `apps/api/src/modules/identity/development-identity.ts`, `apps/api/src/transport/http/{app,enrollment-routes,errors}.ts`, `apps/api/src/bootstrap/server.ts`, `scripts/copy-api-migrations.mjs`, related package scripts and HTTP/auth/config unit tests. Compared against `docs/superpowers/plans/2026-09-10-enrollment-backend.md` and `docs/ENROLLMENT_FLOW.md`.

Verified in source and focused tests:

- Credentials derive user/admin roles from separate server configuration; client role and identity headers do not grant authority. Configuration rejects production development credentials, partial pairs, duplicate identities/credentials and all-interface development listeners.
- Administrative endpoints check admin authorization before invoking persistence. Strict request contracts reject extra identity fields, query tokens, malformed identifiers, unsupported models and invalid invitation lifetimes.
- Claim uses POST and requires an authenticated actor plus a UUID idempotency key. No completion endpoint is exposed. Transport passes the authenticated actor to resolve, claim and operation lookup.
- Invitation destinations are explicitly configured and validated before issuing tokens. QR generation uses the same link returned to the caller, with the token in its fragment. Responses set no-store and no-referrer headers.
- Generic errors do not reflect driver details or request secrets. Automatic request logging is disabled; explicit generic-error logging contains only request ID, event and client-error classification.
- Server attaches database closure to application shutdown. Build copies source SQL migrations into the compiled migration directory.

Executed: `pnpm exec vitest run apps/api/test/config.test.ts apps/api/test/identity.test.ts apps/api/test/enrollment-http.test.ts` — 3 files, 17 tests passed. A subsequent `pnpm exec vitest run apps/api/test/app.test.ts` could not import `modules/enrollments/service.js` while persistence edits were ongoing; zero tests ran. This attempt is inconclusive and needs rerunning on the completed implementation.

Not yet independently verified: database transactions, ownership/expiry/replay checks inside the service, lock ordering, migration constraints/checksums, integration concurrency, actual runtime startup/shutdown and QR scanning by native clients. Persistence implementation was still being edited and intentionally excluded from this pass. HTTP tests use a mocked service and are not evidence of database authorization correctness. Runtime/log capture and full build remain root verification responsibilities.

## Final pass: completed persistence and runtime verification code

Final verdict: no actionable correctness, security or data-integrity findings in the approved backend scope. The first-pass persistence exclusion is superseded by this completed source review.

Additionally inspected `apps/api/src/modules/enrollments/{service,errors,postgres-repository}.ts`, `apps/api/src/infrastructure/{database,migrate}.ts`, `apps/api/src/infrastructure/migrations/001_enrollment.sql`, `apps/api/src/bootstrap/{migrate,seed-development,server}.ts`, `apps/api/test/enrollment.integration.ts`, `apps/api/test/runtime-smoke.mjs`, `vitest.integration.config.ts` and `docs/ENROLLMENT_API.md`.

Source review supports the following:

- The service validates inputs and administrative roles; the repository owns SQL and transactions. Neither depends on HTTP request objects.
- Lifecycle writes consistently acquire the recorder lock before assignment/token/operation writes. Claims recheck assignment state and token validity after acquiring that lock. Administrative release/revocation shares the same serialization point, preventing a pending operation from surviving an assignment-ending race.
- Same-token/same-key claims serialize and recover the persisted operation. Exact retries bypass expiry only for an active assignment, an unrevoked token and a pending operation. Different keys cannot reuse a consumed token. A same-user/key race across different recorders is protected by the database unique constraint; the losing transaction rolls back its token consumption.
- Resolve and operation reads filter by authenticated user. Wrong-user/unknown/unavailable token errors are deliberately uniform. Reassignment preserves the old assignment and invalidates old tokens and pending operations.
- Assignment ownership, recorder identity and assignment time are immutable through a database trigger. A partial unique index enforces one active assignment per recorder. Composite foreign keys bind each operation to the correct assignment owner and consumed token; restrictive deletes preserve references. The schema distinguishes expiry, redemption and revocation.
- Raw tokens are generated from 32 cryptographically random bytes and hashed before SQL. Mutation audits contain identifiers and fixed action names. Transaction failures roll back associated state/audits together.
- Migration history is checksum-validated under a transaction-scoped advisory lock, including missing and out-of-order migration protection. Seed inserts only the configured local identities and is repeatable. Compiled runtime smoke uses its own random schema and checks real HTTP role boundaries, claim retry, revocation and log secrecy.

Reviewer execution on finalized files: `pnpm exec vitest run apps/api/test/config.test.ts apps/api/test/identity.test.ts apps/api/test/enrollment-http.test.ts apps/api/test/app.test.ts` — 4 files, 23 tests passed. This resolves the earlier concurrent-edit import failure.

Evidence limits: the root reported successful full checks, 14 integration tests and compiled runtime smoke; this reviewer inspected those test implementations and did not redundantly rerun the database/full-build suites. The integration race cases use concurrent calls rather than a forced scheduler, so they exercise but do not exhaust every possible interleaving. Process termination during commit, database disconnect fault injection and native QR scanning were not independently exercised. The phase deliberately has no production authentication, cloud/local recorder mutation or setup completion API; this verdict does not certify those later capabilities.
