# Enrollment backend verification

Date: 2026-09-10. Status: local backend phase complete. No deployment, push or commit was performed. All implementation work remains in the app directory within the parent AptlyAble Git repository.

## Delivered

- Versioned Postgres migration for users, recorders, immutable-owner recorder assignments, hashed enrollment tokens, setup operations and audit events. One active assignment per recorder; reassignment preserves the original ownership history.
- Separate local administrator and assignee credentials, with production and non-loopback rejection. HTTP input validation, authorization and safe errors are separate from the enrollment service and transactional Postgres repository.
- Administrative assignment, QR SVG generation, bounded expiration, replacement and revocation. An explicit enrollment destination is required; raw tokens appear once in the response URL/QR, while only hashes are stored.
- Authenticated assignee resolution and atomic single-use redemption. Exact retries recover the same pending operation, including after token expiry. Token or assignment revocation blocks retries and cancels pending operations. Concurrent use of one key across assignments leaves the losing token unconsumed.
- Explicit migration and local seed commands, compiled SQL packaging, API documentation and reproducible integration/runtime checks.

## Executed checks

| Command/check                                 | Result                                                                                                                                                                                                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                  | Pass: workspace TypeScript, ESLint, import boundaries, 38 unit tests in 7 files, compiled contracts/API                                                                                                                                               |
| `TEST_DATABASE_URL=... pnpm test:integration` | Pass: 14 real-Postgres tests in an isolated temporary schema                                                                                                                                                                                          |
| `TEST_DATABASE_URL=... pnpm test:api-smoke`   | Pass: compiled migration twice, seed twice, actual HTTP readiness, denied user admin access, assignment, QR, assignee resolve, wrong-user denial, concurrent exact claim retries, operation read, token revocation, replay denial, assignment release |
| Runtime log inspection in smoke script        | Pass: generated user/admin credentials, invitation token and full test serial absent from collected API/CLI logs                                                                                                                                      |
| `pnpm format:check`                           | Pass                                                                                                                                                                                                                                                  |
| `pnpm peers check`                            | No peer dependency issues                                                                                                                                                                                                                             |
| `pnpm install --frozen-lockfile`              | Pass                                                                                                                                                                                                                                                  |
| Independent final review                      | No actionable findings; reviewer independently ran 23 HTTP/app/config/identity tests                                                                                                                                                                  |

The integration suite also checks expiry/replacement, ownership conflicts, direct database assignment constraints, idempotency collisions/rollback, assignment termination racing claim, migration repeatability and checksum/missing-history rejection. Expiry cases set persisted test timestamps into the past; they do not wait for real invitation lifetimes.

## Local database state

The dedicated development database was initially empty. Applied `001_enrollment.sql` using `pnpm db:migrate`, then reran the command successfully. One applied migration record and seven public tables were confirmed. Migration SHA-256:

```text
c9e1fe5afe880d5f791613c53015e461c091c7d53784eff5f9a23422480a9db8
```

The retained application schema contains zero users and zero assignments; test users, recorders and secrets were confined to temporary schemas that were removed. No API `.env` or persistent bearer credentials were created. The test API processes exited. The dedicated Postgres container was returned to its stopped state with the migrated volume retained; `pnpm db:up` starts it again. Other projects' containers were not changed.

## Scope and limits

This is the backend portion of enrollment, not completed phone pairing. The mobile preview still uses the existing simulated invitation and adapter. No actual recorder was assigned, scanned or paired. No production login provider, admin dashboard, hosted enrollment page, app-store handoff or native app-link configuration was implemented. A configured URL does not establish a working web destination or native link association.

Setup operations deliberately remain `pending` or `revoked`; there is no completion endpoint without verified cloud/device evidence. Real Plaud integration and physical iOS/Android testing are future work. This phase did not rerun native exports because mobile implementation was unchanged; previous foundation exports were JavaScript/asset bundles, not signed application builds. No public-production security or hardware-readiness claim follows from local tests.

## References

- [API setup and contracts](../ENROLLMENT_API.md)
- [Approved enrollment flow](../ENROLLMENT_FLOW.md)
- [Implementation plan and progress](../superpowers/plans/2026-09-10-enrollment-backend.md)
- [Persistence implementation report](enrollment-persistence-report.md)
- [Independent review](enrollment-review.md)
