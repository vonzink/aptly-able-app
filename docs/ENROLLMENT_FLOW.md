# Assigned recorder enrollment

Status: Accepted product direction, 2026-09-10. The backend phase implements persistent assignments, QR invitation generation, token lifecycle and authenticated claims using local development identities. The mobile app still simulates setup. Real sign-in, web landing pages, native app-link handling and Plaud enrollment remain future work. See [API guide](ENROLLMENT_API.md) and [verification](verification/ENROLLMENT_BACKEND.md).

## Intended experience

1. An administrator assigns a supported Plaud recorder, identified by its complete serial number, to a user.
2. The administrator generates an enrollment QR code.
3. The user scans the code. If Aptly Able is installed, the verified link opens it. Otherwise a web landing page offers the appropriate app store and explains how to return to setup after installation.
4. The app opens enrollment: “Your Plaud recorder is ready to set up.” It shows only the recorder model and serial suffix, such as •••• 4812.
5. The user allows Bluetooth when prompted.
6. The app finds the assigned recorder and offers “Connect recorder.”
7. The app completes authorized cloud binding and the local secure connection. Only then does it say setup is complete.

The original Plaud Note owned by the project owner is unsupported by Embedded. The foundation uses a conspicuously labeled simulated Note Pro assignment. It never treats that simulation as a real assignment, permission grant or connection.

## Ownership and QR security

A QR points to an opaque, random, expiring enrollment token on a verified HTTPS app-link domain. It must not contain Plaud credentials, user access tokens, personal details or the recorder's full serial. Generate at least 256 bits of cryptographic randomness, store only the token hash, scope it to one assignment, and record expiry/revocation/redemption state.

Administrative assignment reserves the recorder in Aptly Able. It does not alone perform Plaud cloud binding or establish a Bluetooth connection. Cloud binding runs on behalf of the authenticated assigned user during setup.

The backend owns the full serial and compares it with the assigned identity. The final four digits are display-only and not a unique authorization key. The app may show the suffix, but must not connect an arbitrary recorder with the same suffix.

QR possession alone is not proof that the person is the named assignee. An existing authenticated app session must match that assignee. On a fresh install, perform the smallest necessary identity verification before claiming enrollment (for example, the product's future sign-in/email-code flow). The provider is not chosen in this foundation. No public endpoint may mint a Plaud token solely from an arbitrary user ID.

GET requests only display/resolve a link; they never consume it. Email previews and QR scanners can open links automatically. Authenticated claim uses POST and atomically sets `enrollment_tokens.used_at` while creating a persisted setup operation. Finalize the operation after verified device setup. A retry with the same authenticated actor and claim idempotency key returns the existing operation; a used QR cannot create another operation. Expired, revoked, wrong-user and used tokens get safe recovery instructions; user cancellation must not permanently strand the assignment.

Claim and completion require transactional guards against two simultaneous requests. Admin revocation and reassignment invalidate outstanding tokens and incomplete setup operations. Backend checks that the original assignment remains active and belongs to the authenticated actor before each cloud mutation. Keep a minimal audit event for who assigned, generated, claimed, revoked and completed enrollment; do not log the raw token or complete link.

The current backend places the token in the enrollment URL fragment (`#token=...`) and accepts it only in authenticated POST bodies. Tokens in URL paths/query strings can leak through access logs, analytics and referrers. The landing/app-link implementation must suppress those logs, set a restrictive referrer policy, avoid third-party content on enrollment pages and exchange the token for server session state promptly. Never persist it in an ordinary app preference store.

## Data model

Owner-specified core tables:

```text
recorder_assignments
  id             uuid primary key
  user_id        uuid not null references users(id)
  recorder_id    uuid not null references recorders(id)
  assigned_at    timestamptz not null
  status         text not null

enrollment_tokens
  id             uuid primary key
  assignment_id  uuid not null references recorder_assignments(id)
  token_hash     text not null unique
  expires_at     timestamptz not null
  used_at        timestamptz null
  created_at     timestamptz not null
  revoked_at     timestamptz null
```

An assignment represents who has been allocated the recorder. An enrollment token is temporary, single-use permission to begin setup for that assignment. The relationship is one assignment to many historical tokens. An expired QR does not expire the assignment or disconnect an already paired recorder.

Assignment rules:

- Use `active`, `released` and `revoked` for assignment status. `active` includes an assigned recorder that has not yet been paired; connection status belongs to the setup/recorder subsystem.
- Enforce one active assignment per recorder with a partial unique index. A user may have multiple assignments; this schema does not impose a one-recorder-per-user restriction.
- Keep `user_id`, `recorder_id` and `assigned_at` immutable. Reassignment closes the old row and creates a new row, preserving recording ownership and enrollment history.
- Use foreign keys that preserve history; do not cascade-delete tokens or recordings to implement reassignment.

Token rules:

- Generate the raw token with a cryptographically secure random generator. Store only its SHA-256 hash; the random raw token appears only in the issued link/QR.
- Require `expires_at > created_at`; evaluate expiry with server/database time. Successful redemption requires `used_at IS NULL`, an unexpired/unrevoked token and an active assignment for the authenticated assignee.
- Approved additional field: `revoked_at timestamptz null`. It supports the already planned QR cancellation and replacement without falsely marking an unused token as used. Retain `used_at` exclusively for successful redemption.
- Generating a replacement QR revokes the assignment's outstanding unused tokens in the same transaction. Keep historical rows; only the new link may initiate setup.
- Lock/recheck the assignment and token when claiming, set `used_at`, and create the setup operation in one transaction. A simultaneous second claim cannot consume the token again. Apply the same assignment locking discipline to admin reassignment/revocation.
- Persist claim idempotency and setup progress separately from the token. The operation references the assignment and consumed token, records its actor and cloud/local state, and survives app restarts. A matching retry can recover that operation after a lost response. It does not clear `used_at` or resurrect a revoked assignment.

This replaces the earlier combined `enrollments` table sketch. `enrollments` remains the name of the product workflow; its invitation credentials live in `enrollment_tokens`, and pairing progress lives in a setup operation. The first versioned migration implements these tables plus users, recorders, setup operations and minimal audit events. Setup operations currently have only pending/revoked states; they cannot establish hardware readiness.

## Backend contracts

Implemented local endpoints (see the API guide for bodies and responses):

| Endpoint                                                  | Authorization and purpose                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| POST /v1/admin/recorder-assignments                       | Admin-only assignment by exact serial and internal user ID                            |
| POST /v1/admin/recorder-assignments/:id/enrollment-tokens | Admin generates/replaces an expiring QR link                                          |
| POST /v1/admin/enrollment-tokens/:id/revoke               | Admin revokes a QR token                                                              |
| POST /v1/enrollments/resolve                              | Authenticated actor receives minimal assigned-recorder display data                   |
| POST /v1/enrollments/claim                                | Atomically verify/consume token for the active assignment and return setupOperationId |
| POST /v1/admin/recorder-assignments/:id/end               | Admin releases/revokes an assignment and invalidates tokens and pending setup         |
| GET /v1/enrollments/operations/:id                        | Assignee retrieves persisted pending/revoked setup state                              |

A completion endpoint is deliberately deferred until cloud/local evidence can be verified. Existing recorder assignment history remains authoritative. Data from the phone is reported local evidence; it cannot grant cloud ownership or bypass assignment checks. API workflow names do not imply that assignment and token state share a database table.

## Cross-platform link behavior

Use an owned HTTPS domain with iOS Universal Links and Android App Links. Configuration includes the site's association files, signed app identifiers and app routing. The domain and store listings are future prerequisites, not needed for the current local shell.

Do not assume scanning once will automatically resume the token after an app-store installation. Provide “Already installed? Open Aptly Able” on the landing page and instructions to revisit the link or scan the same QR. Any seamless post-install continuation requires a separately verified design on both operating systems.

Official references: [Apple associated domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains), [Android App Links](https://developer.android.com/training/app-links).

## Foundation adaptation and acceptance

The mock app starts from an assigned-recorder invitation, explains that permission and connection are simulated, and proceeds through discovery and connect for that assignment. It does not open a camera, ask for unnecessary Bluetooth permissions, accept real enrollment secrets or expose an admin dashboard.

Later verification must include wrong-recorder/same-suffix discovery, wrong user, expired/revoked/replayed QR, double claim, replacement QR with the same assignment, reassignment invalidating an old QR, claim response loss followed by idempotent retry, app already installed, first installation, app closed mid-enrollment, cloud bind conflict and cloud-success/local-failure. Both platforms must pass before enrollment is complete.
