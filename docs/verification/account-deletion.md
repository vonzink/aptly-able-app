# Account deletion implementation and operator verification

Local implementation for audit C2/H5. Not deployed; no production account or vendor data was deleted during implementation.

## App/API interface

`createAccountClient({baseUrl,getCredential,fetch})` exposes `requestDeletion({password,confirmation:'DELETE'})` and `getDeletionStatus()`.

POST `/v1/account/deletion` verifies an unexpired pilot bearer session and password, takes an exclusive per-account database lock, captures minimal provider cleanup identifiers, inserts a durable request and revokes all sessions in one transaction. Returns HTTP 202 with:

```json
{
  "requestId": "<uuid>",
  "status": "pending",
  "requestedAt": "<ISO date>",
  "expectedCompletionAt": "<ISO date, seven days after acceptance>",
  "completedAt": null,
  "pendingWork": ["service_data", "provider_erasure", "backup_retention"]
}
```

Only the bearer credential used to accept the request can retry the POST or read GET `/v1/account/deletion` after revocation. A retry returns the original receipt and does not create new work, including after service-account cleanup. Other revoked sessions cannot use the receipt. The accepted credential becomes receipt-only access, not a session; login and normal authenticated routes stop working. The phone stores a separate recovery intent in SecureStore before POST (web preview uses sessionStorage), then saves the receipt and a per-request status credential before clearing the interrupted-request recovery intent. Reopening Settings → Delete account can recover a lost response with GET even after ordinary session restoration discards the revoked sign-in. No password is stored. The per-request status capability stays in SecureStore (sessionStorage for the web preview) until completion is saved. It cannot sign in, list recordings or act on another account. Settings → Delete account refreshes pending status on opening and provides a manual Check deletion status action after sign-out. Completion is confirmed in-app; there is no email or push completion notification. Receipt history preserves earlier requests on shared phones. Do not send a password or bearer credential to support.

The owner confirmed **within 7 days** on September 15, 2026. Additive migration `006_account_deletion_deadline.sql` stores an immutable due date for each new request; retries do not extend it. Earlier requests keep a null deadline rather than inventing a retroactive promise. `completedAt` appears only after all cleanup gates pass. An overdue request remains pending and is labelled late in the app. This commitment does not establish that vendor/backups can meet it: operator ownership and evidence still must be verified before distribution.

Malformed/missing confirmation returns 400, invalid session/password returns 401, unavailable service returns 503, and repeated attempts receive 429. Rate limiting is per-process/IP (10 attempts/minute, bounded map); production ingress should enforce an appropriate shared abuse policy across replicas.

## Durable service erasure

The API process runs the cleanup worker every 10 seconds. Requests remain in PostgreSQL through restarts. Worker row claims use `FOR UPDATE SKIP LOCKED`; failures preserve file references, increment attempts, store a non-sensitive error code and retry after one minute. It deletes known audio and temporary uploads before database references, then account-owned recordings/transcripts/jobs, setup operations, enrollment tokens, assignments, related audit rows, account/session credentials and user profile. Shared recorder inventory remains for other users. The per-account exclusive lock waits for active uploads and vendor operations, while DB triggers reject late writes from stale requests. Separate bounded upload/deletion pools preserve ordinary request capacity.

Uploads reserve their storage key in `account_audio_uploads` before any bytes are written. Crash-left reserved `.audio` and `.pending` files remain associated with the user until erasure. Historical orphan files created before this migration have no assured ownership: infrastructure review must resolve these before external/backup confirmation. The worker never scans or deletes another account's files.

Provider calls hold per-account shared locks through the existing provider checkpoint logic. Deletion cannot capture scope before an in-flight bind/upload/submission finishes or fails. After acceptance the transcription worker skips the account. Failed/ambiguous uploads and old retry tasks may not have complete provider IDs: the stored snapshot is a starting point, NOT proof of all vendor copies.

## Required operator procedure (not automated or verified here)

No documented Plaud account/data deletion endpoint was established by this implementation. No vendor erasure API is invented. Every request remains pending for `provider_erasure` and `backup_retention`, even when there are no known transcriptions. Device SDK sessions and binding data can also exist at Plaud.

1. Assign an authorized operator and operational monitoring for the durable queue. Inspect pending/error counts, oldest request age, and `last_error`; investigate repeated cleanup failures. The owner-approved maximum is seven days, including provider and backup cleanup. A staffed queue, vendor agreement and alerting deployment are still required; code cannot establish that operational capacity.
2. Build the API, then use the restricted operational CLI with the intended environment selected explicitly:

   ```sh
   node apps/api/dist/bootstrap/account-deletion-operator.js queue
   node apps/api/dist/bootstrap/account-deletion-operator.js inspect REQUEST_UUID
   ```

   `queue` lists up to 100 pending requests ordered by deadline, with overdue and cleanup flags, retry count and sanitized error. It is read-only and does not send alerts.

   `DATABASE_URL` and `RECORDINGS_DIRECTORY` must point to the intended service. The inspect output contains cleanup identifiers: handle it as confidential and do not attach it to public tickets.

3. Obtain actual vendor confirmation covering the old account identity, SDK tokens/bindings, uploaded objects (including failed or ambiguous uploads), all current/historical transcription tasks/results, and downstream provider copies as applicable. Do not unbind a recorder's current owner after reassignment. Hardware audio and external copies are outside this API's control. Resolve vendor retention exceptions explicitly; do not mark pending work complete based only on sending a request, unpairing hardware, or a generic privacy policy.
4. Verify hosting/backups/logs and historical orphan-file inventory, actual backup expiry/deletion and restore handling. A restore must retain/replay outstanding deletion tombstones so erased accounts are not resurrected. Do not mark backup work complete merely because a future expiry date is scheduled. Retention exceptions keep the request pending until the evidence is sufficient.
5. Record confirmed evidence in a private JSON file containing `providerEvidence`, `backupEvidence`, `confirmedBy` and literal `allAccountDataConfirmed: true`. Include verifiable ticket/evidence references, confirmed scope and dates, and the operator identity. The CLI requires non-empty evidence; it cannot independently prove that an operator's statements are truthful.

   ```sh
   node apps/api/dist/bootstrap/account-deletion-operator.js confirm-external-erasure REQUEST_UUID /absolute/private/evidence.json
   ```

   This records evidence and wakes the durable queue; it does not itself declare success. The worker sets `complete` only after service erasure and both recorded external confirmations. Provider scope is cleared after confirmed vendor erasure. A minimal deletion ledger (request/user UUID, hashed receipt credential, timestamps and evidence references) remains for status and restore protection; owner-reviewed ledger retention is still required. Never put raw recordings, transcripts or account passwords in evidence.

## Local verification

Meaningful tests cover missing/wrong credentials, password reauthentication, loss-of-response idempotency, session/login lockout, another account remaining usable, missing operator evidence, honest pending status, successful evidence-gated completion, filesystem failure/retry ordering, reserved temporary file cleanup, ongoing upload/bind/provider-failure concurrency, post-request provider suppression, malformed HTTP confirmation and bounded HTTP attempts. Existing processing, identity, device and capacity integration tests remain green against disposable schemas in local PostgreSQL at 127.0.0.1:55432.

Production migration application, provider cleanup agreements, infrastructure/backup inventory, queue ownership/alerts, restore testing and end-to-end real-account erasure remain required before claiming operational/App Store readiness.

## Phone recovery safeguards

The mobile workflow serializes submission, GET-only recovery and local cleanup retry across screen instances. Persistence failure before POST prevents submission; network/5xx uncertainty retains the original receipt credential. Accepted cleanup targets only recordings with the deleting actor ID and never deletes manually imported files or another account’s downloads. A receipt is not proof of provider/backup completion. Thirty pure workflow/status tests cover interruption, actor switching, origin isolation, journal/status persistence failure, mismatched references, prior receipt history, overdue dates, stale retries and concurrency.
