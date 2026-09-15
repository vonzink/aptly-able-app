# Account deletion operator runbook

Scope: the accepted account-deletion request and its original **seven-day** completion deadline. This procedure supports both mobile stores. The CLI observes service state and records human evidence; it does not contact Plaud, expire backups, install monitoring, or establish that a deletion promise has been fulfilled. The implementation is local until separately deployed.

## Before assigning live requests

Assign a named queue owner and backup operator, a private evidence location, and an escalation recipient. Deploy the status check with an owner-approved cadence that allows action before the earliest deadline; verify both an exit-2 alert and an exit-1 monitoring failure reach the responsible operator. Neither scheduling nor delivery is supplied by this CLI. An unstaffed queue is an open distribution gate.

Confirm the deployed API, applied migrations, intended database, worker availability, hosting/storage inventory, vendor contact/process and actual backup behavior. Obtain evidence that these can meet seven days; a retention period longer than the promise is an unresolved issue, not authorization to alter the due date. No provider erasure endpoint or new retention policy is defined here.

Only authorized operators may access the database credentials or `inspect` output. Run from a reviewed API build with the intended service environment explicitly selected. The commands below rely on that environment; they do not load an arbitrary `.env` file. Keep `DATABASE_URL` and `RECORDINGS_DIRECTORY` out of tickets and shell transcripts.

## Observe and triage

```sh
node apps/api/dist/bootstrap/account-deletion-operator.js status
node apps/api/dist/bootstrap/account-deletion-operator.js queue
node apps/api/dist/bootstrap/account-deletion-operator.js inspect REQUEST_UUID
```

`status` prints JSON from one database snapshot and counts the entire deletion ledger. It contains no account identifiers, receipt hashes, provider scope or evidence text. Counts overlap because one request can have several unfinished gates.

| Field or result                           | Required interpretation/action                                                                                                                                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pending`, `oldest_requested_at`          | Full backlog and oldest accepted request; compare with the case register and previous checks.                                                                                                                                            |
| `overdue`, `oldest_overdue_deadline_at`   | A pending request has passed its promised date. Escalate the missed commitment immediately with the request ID, owner, unfinished gate and next action. Keep it pending; never extend the deadline or confirm unfinished work.           |
| `due_within_24_hours`, `next_deadline_at` | Upcoming work needs proactive follow-up. The 24-hour window is a triage aid, not an additional retention promise or grace period. Exit 0 can still include these requests.                                                               |
| `missing_deadline`                        | Legacy accepted request has no recorded due date. Inspect its original intake and escalate uncertainty; do not invent or silently backfill a promise.                                                                                    |
| `service_pending`, `service_failures`     | Inspect attempts, `last_error` and `next_attempt_at`, worker health and storage access. Repair the underlying cause and let the durable worker retry. Do not discard file references or delete another account's data to bypass failure. |
| `provider_pending`, `backups_pending`     | Obtain scope-specific completion evidence; an empty provider snapshot does not prove there was no SDK/provider processing.                                                                                                               |
| `ready_for_completion`                    | Service and both external confirmations are recorded but the worker has not closed the request. Check worker health if it persists.                                                                                                      |
| `completed_late`                          | Historical missed deadlines remain visible after closure; compare with the prior count and retain the incident record. This history alone does not generate exit 2.                                                                      |
| Exit 2 / `attention_required: true`       | At least one overdue, missing-deadline or service-failure condition needs operator attention. The JSON remains valid.                                                                                                                    |
| Exit 1 or absent/invalid JSON             | The observation failed. Investigate configuration/database/command failure; never interpret it as an empty queue.                                                                                                                        |
| Exit 0                                    | The checked attention conditions were absent. It is not proof of worker activity, vendor progress, monitoring delivery or seven-day compliance.                                                                                          |

`queue` is limited to the first 100 pending requests, ordered by missing/earliest deadline and acceptance time. Use `status` to detect work beyond this display. `inspect REQUEST_UUID` is the confidential per-request record; `overdue: null` means a legacy unknown deadline. All three commands are read-only. They never complete requests or advance deadlines.

For each accepted request, open a private case keyed by its request UUID. Record the original `requested_at` and `expected_completion_at`, operator, pending gates, evidence references and next action/check time. Track progress from acceptance; do not wait until day seven to contact the vendor or inspect backup expiry. Support requests made outside the app also need verified identity and a tracked handoff through the authorized deletion process; this CLI does not create requests or bypass password authentication.

## Establish evidence for every gate

1. **Service:** inspect for `service_erased_at`, no outstanding cleanup error, and expected account isolation. The worker removes owned storage before DB references and retries failures. Preserve the accepted receipt deadline. Do not delete the ledger as a shortcut.
2. **Provider:** use the confidential captured scope to locate the deleted account's SDK identity, token/binding data, uploads, historical/retried transcription tasks/results and any downstream processing. Include failed/ambiguous uploads without known object/task IDs in the vendor request. Obtain dated, scope-specific confirmation or documented confirmation of nonexistence. A sent request, successful unbind, empty task list, generic policy or expired API token is insufficient. Check current recorder ownership before any device action; never unbind a reassigned recorder's new owner.
3. **Infrastructure and backups:** reconcile actual hosting stores, logs, snapshots, backup copies, exported service data and historical orphan uploads. Record which sets contained the account, how deletion or expiry was verified and when it occurred. Future scheduled expiry alone is insufficient. Verify restore protection: retain/replay the deletion ledger so a restore cannot resurrect erased accounts. Unknown coverage or unresolved retention exceptions keep this gate pending and require escalation.

Each evidence reference must be accessible to an authorized reviewer and identify the system/scope, confirmation time and verifying party. Keep content minimal: no recordings, transcripts, passwords or bearer credentials. Do not claim erasure of audio on disconnected hardware, recipient exports or other copies outside service control; document these limits separately. Owner-reviewed retention for the minimal deletion ledger/evidence remains unresolved until explicitly established.

## Record confirmation and verify closure

Prepare a private JSON file with these exact fields. This deliberately incomplete example cannot pass the CLI until reviewed:

```json
{
  "providerEvidence": "Replace with verified provider scope, completion date and private evidence reference.",
  "backupEvidence": "Replace with verified infrastructure/backup coverage, completion date and private evidence reference.",
  "confirmedBy": "Replace with accountable operator identity.",
  "allAccountDataConfirmed": false
}
```

Set `allAccountDataConfirmed` to `true` only after both external gates have actual evidence. If either remains unknown, do not submit. The CLI validates structure and an attestation, not its truth.

```sh
node apps/api/dist/bootstrap/account-deletion-operator.js confirm-external-erasure REQUEST_UUID /absolute/private/evidence.json
node apps/api/dist/bootstrap/account-deletion-operator.js inspect REQUEST_UUID
node apps/api/dist/bootstrap/account-deletion-operator.js status
```

Confirmation records evidence and makes the worker eligible to evaluate completion. It does not erase service data or directly declare success. Identical retries leave the original confirmation unchanged, including after completion. Different evidence/operator values are rejected; investigate a mistaken attestation through an authorized review rather than overwriting history with another CLI attempt.

Wait for the ordinary worker, then verify `completed_at` and empty `pending_work` for the same request. Compare completion with the original deadline and record any missed commitment. Preserve the minimal case reference and outcome. User status remains pending until this worker transition; the app has a manual status refresh and no automatic completion email/push. Do not promise an automated notification.

## Evidence needed before distribution

Demonstrate a real authorized deletion end to end, within the original seven-day deadline: service cleanup, provider proof, actual backup handling, restore protection, operator receipt of monitoring failures/overdue alerts, and user-visible completion. Record what was observed and any excluded or unresolved scope. Synthetic integration tests, this runbook and a successful `status` command do not close these operational release gates.
