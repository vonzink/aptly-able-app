# Enrollment persistence verification

Verified locally on 2026-09-10 against PostgreSQL 17 in the repository Compose service. The integration suite uses `TEST_DATABASE_URL` and creates a random `enrollment_<random>` schema. Its pool sets that schema as `search_path`; cleanup drops only that test schema.

## Implemented boundaries

- `apps/api/src/infrastructure/migrations/001_enrollment.sql` creates users, recorders, immutable historical assignments, hash-only enrollment tokens, persisted setup operations, and minimal audit events. Foreign keys preserve history and compound keys bind operations to the same assignment, user, and token.
- `apps/api/src/infrastructure/migrate.ts` discovers SQL relative to `import.meta.url`, serializes runs with a transaction-scoped advisory lock, stores SHA-256 checksums, and rejects changed, removed, or newly inserted out-of-order migration history.
- `apps/api/src/modules/enrollments/service.ts` is the public use-case boundary. It validates actors and inputs, enforces administrator-only mutations, and exports safe `EnrollmentError` values.
- `apps/api/src/modules/enrollments/postgres-repository.ts` owns SQL transactions and the recorder, assignment, token, and operation lock order. Claims consume a token and create an operation atomically.
- `apps/api/src/bootstrap/migrate.ts` and `seed-development.ts` provide explicit local commands with bounded database timeouts and concise failure output. Seed uses only validated configured development user/admin identities and refuses production.

## Checks run

```text
TEST_DATABASE_URL=postgres://aptly:aptly_local_only@127.0.0.1:55432/aptly_mobile pnpm vitest run --config vitest.integration.config.ts
Result: 1 file passed, 14 tests passed.

pnpm exec tsc -p apps/api/tsconfig.json --noEmit
Result: exit 0.

pnpm exec eslint apps/api/src/modules/enrollments apps/api/src/infrastructure/migrate.ts apps/api/src/bootstrap/migrate.ts apps/api/src/bootstrap/seed-development.ts apps/api/test/enrollment.integration.ts vitest.integration.config.ts
Result: exit 0.

pnpm build
Result: exit 0; the API build copied SQL into dist/infrastructure/migrations.

DATABASE_URL=postgres://.../aptly_mobile?options=-csearch_path%3Dcompiled_enrollment_7e91c4a2 node apps/api/dist/bootstrap/migrate.js
Result: two consecutive compiled-runner executions exited 0; schema_migrations contained one applied migration. The isolated compiled_enrollment_7e91c4a2 schema was then dropped.
```

The suite proves repeatable migration execution; checksum and removed-history rejection; assignment immutability and the database partial unique constraint; recorder model conflicts; unknown users; suffix-only previews; hash-only token persistence; uniform wrong-user, unknown, expired, revoked, replaced, and used-token handling; exact replay after expiry; same-token same-key convergence; same-token different-key exclusion; cross-assignment same-key rollback with the losing token left unused; token and assignment revocation; explicit reassignment; claim/end races leaving no pending operation; actor authorization; and secret-free audit records.

Running the integration config without `TEST_DATABASE_URL` exits during config load with `TEST_DATABASE_URL is required for integration tests.` The two bootstrap entrypoints were also run without required configuration and exited 1 with concise messages that did not include connection details.

## Limits

The ordinary test command remains database-independent because the integration filename does not match its `*.test.ts` include. No migration was applied to the default/public application schema during this verification. Setup operations intentionally stop at `pending`; completion, hardware discovery, Plaud cloud binding, QR rendering, app links, and production identity remain outside this persistence slice.
