# Local enrollment API

The local API serves the administrator dashboard and mobile enrollment screen. Development access codes identify separate administrator/user accounts. Production sign-in, hosted installation continuation, verified native app links and Plaud binding remain future work. The recorder simulation is a separate feature.

## Local setup

From the app workspace:

```sh
pnpm dev:setup
```

Setup starts this project's local Postgres, applies migrations, seeds two users and creates `apps/api/.env` only if absent. Access codes are available in the owner-only, ignored `.local/development-access.txt`. Existing configuration is preserved. For manual configuration use the keys in `apps/api/.env.example`: a stable `DEV_USER_ID` and distinct `DEV_ADMIN_USER_ID`, each with its own random URL-safe bearer credential (32–256 characters). Keep these values out of client bundles and Git.

Then run:

```sh
pnpm dev:api
pnpm dev:admin
pnpm dev:web
```

Run the three servers in separate terminals. The seed creates/updates only the two configured users and their display names and can be run again. Roles derive from separate server credentials, never request fields. Production or an all-interface listener rejects these credentials. Production session verification is separate implementation work.

`ENROLLMENT_BASE_URL` must be set before issuing an invitation. Use an explicitly chosen HTTPS destination, maximum 512 characters, without credentials, query parameters or a fragment. Loopback HTTP is allowed for local testing only. `https://enroll.example.test/setup` is a test example, not a hosted Aptly Able page. Setting a URL does not configure iOS/Android app links or make that destination work.

The API defaults to `127.0.0.1:4100`. All responses are `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. Supply `Authorization: Bearer <credential>` and use JSON bodies for POST requests. Browser origins must exactly match `BROWSER_ORIGINS`; setup allows local ports 8088/8089. Preflight is handled explicitly without cookies or wildcard origins. Enrollment mutation/assignee endpoints reject query parameters; GET cannot consume an invitation. Admin lists alone accept `page` (1–100000), returning 25 rows plus `hasMore`.

## Endpoints

| Method and path                                             | Role                   | Body                                                                       | Result                                                             |
| ----------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `GET /v1/session`                                           | Any authenticated user | None                                                                       | Internal user ID, role and development mode                        |
| `GET /v1/admin/users?page=1`                                | Admin                  | None                                                                       | Known user IDs/display names and `hasMore`                         |
| `GET /v1/admin/recorder-assignments?page=1`                 | Admin                  | None                                                                       | Assignment summaries and `hasMore`                                 |
| `GET /v1/admin/recorder-assignments/:id`                    | Admin                  | None                                                                       | Assignment, assignee, recorder suffix, latest invitation/operation |
| `POST /v1/admin/recorder-assignments`                       | Admin                  | `{ "userId": "<known UUID>", "serial": "8810004812", "model": "notepro" }` | 201 assignment                                                     |
| `POST /v1/admin/recorder-assignments/:id/enrollment-tokens` | Admin                  | `{ "expiresInSeconds": 86400 }` or `{}`                                    | 201 invitation, enrollment URL, QR SVG                             |
| `POST /v1/admin/enrollment-tokens/:id/revoke`               | Admin                  | `{}`                                                                       | 204; safe to repeat                                                |
| `POST /v1/admin/recorder-assignments/:id/end`               | Admin                  | `{ "status": "released" }` or `"revoked"`                                  | 200 assignment; same-state retry is safe                           |
| `POST /v1/enrollments/resolve`                              | Assignee               | `{ "token": "<raw token>" }`                                               | 200 minimal recorder preview; no consumption                       |
| `POST /v1/enrollments/claim`                                | Assignee               | `{ "token": "<raw token>", "idempotencyKey": "<UUID>" }`                   | 200 setup operation                                                |
| `GET /v1/enrollments/operations/:id`                        | Assignee               | None                                                                       | 200 persisted operation                                            |
| `GET /v1/enrollments/claims/:id`                            | Assignee               | None; `id` is the original UUID idempotency key                            | Recover persisted operation without raw invitation token           |

Only `notepro` and `notepins` models are accepted. Full serials are supplied by the administrator and stored on the server. Serial suffixes are display-only; they never identify an assignment for authorization. There may be many active recorders for a user, but only one active assignment for any recorder. An assignment for a different owner conflicts until the administrator explicitly ends the old assignment. Historical ownership remains intact.

The assignment response contains `id`, `userId`, `recorderId`, `assignedAt`, and `status`. The invitation response contains `id`, `assignmentId`, `expiresAt`, `enrollmentUrl`, and `qrSvg`. It returns the secret once, inside `enrollmentUrl` as `#token=...` and encoded into the QR. The server stores only its SHA-256 hash. It never returns the full recorder serial in an invitation or assignee preview. The QR is generated locally with [node-qrcode](https://github.com/soldair/node-qrcode); no external QR service receives its contents.

The resolve response contains `assignmentId`, `recorder: { id, model, serialSuffix }`, and `expiresAt`. The operation response contains `id`, `assignmentId`, `status` (`pending` or `revoked`), and `createdAt`. No response implies that cloud binding or Bluetooth setup has completed. There is no completion endpoint in this phase.

Admin read models expose display names, serial suffixes, assignment state, latest operation and safe invitation timestamps. They never return token hashes, invitation secrets or full serials. Full QR/link material is available only from issuance and is held in dashboard memory. Reloading requires issuing a replacement if the unused QR needs to be shared again.

## Retry and revocation behavior

An invitation defaults to 24 hours and can be issued for 60 seconds through 7 days. Issuing a replacement revokes outstanding unused invitations for the same assignment in the same transaction. If an issuance response is lost, request a replacement; the old secret cannot be recovered from storage. A replacement does not cancel an already claimed operation. To cancel a claimed setup, explicitly revoke its token or end its assignment.

Claim requires the authenticated assignee, an active assignment, an unexpired and unrevoked token, and a fresh UUID idempotency key. Keep that same key for retries of the same claim. The token is consumed and the setup operation recorded atomically. An exact retry returns the original pending operation, including after the token's expiry. A used token with a new key cannot start another operation; a key reused with a different token conflicts. A revoked token, operation or assignment cannot be revived by retrying.

The mobile controller persists the actor and key before sending a claim, then adds the operation ID after success. On restart it verifies the actor and uses operation-ID or claim-key lookup. A lost response can therefore be recovered without storing the raw token. Missing or other-user operations return the same 404. Transient recovery failures retain the journal and offer retry; a confirmed missing claim asks for the invitation again. Web recovery lasts for the current tab session; native journals use SecureStore. Explicit sign-out clears the journal and in-memory credential. This phase tracks one selected enrollment per client journal; the server supports multiple assignments.

Ending an assignment revokes every token and pending operation associated with it. A new assignment uses a new row; the old user cannot reuse the old QR. Expiring an unclaimed token does not change the assignment. `used_at` means successful redemption, not completed recorder setup.

Errors include a safe `error.code`, `error.message`, and `error.requestId`. Missing authentication is 401; insufficient admin role is 403; invalid input is 400; assignment/key conflicts are 409. Wrong-user, unknown, expired, revoked, and unavailable used invitations return the same 404 recovery response. A missing configured link destination or disabled persistence returns 503. Unexpected failures are sanitized; bearer tokens, raw invitation tokens and database errors are not logged.

## Database and verification

Versioned SQL lives under `apps/api/src/infrastructure/migrations/`. Run migrations explicitly; the API never auto-migrates. The runner takes a transaction-scoped migration lock and validates checksums. Add a new migration instead of editing applied SQL. The build copies SQL alongside the compiled runner.

```sh
pnpm check
pnpm format:check
TEST_DATABASE_URL=postgres://aptly:aptly_local_only@127.0.0.1:55432/aptly_mobile pnpm test:integration
TEST_DATABASE_URL=postgres://aptly:aptly_local_only@127.0.0.1:55432/aptly_mobile pnpm test:api-smoke
```

Integration tests create and remove isolated random schemas. They do not truncate application tables. The ordinary test suite does not require a database. See [backend verification](verification/ENROLLMENT_BACKEND.md) and [current UI verification](verification/ENROLLMENT_UI.md) for results and limits.
