# Original recorder account recovery — September 14, 2026

## Cause

The original NotePin S ending 5641 was assigned to the local development user.
The installed build 4 uses the live pilot API, which did not contain that user,
assignment or claimed setup. A new website login initially had a different user
UUID. The Plaud provider uses this UUID as its partner user identity, and the
phone also uses it to scope enrollment recovery and local recordings.

## Recovery completed

- Confirmed the local and live environments use the same Plaud partner and region.
- A read-only Plaud binding request confirmed the recorder remained bound to the
  original identity. No bind or unbind request was made.
- Backed up the live database and verified the backup archive could be listed.
- Exported only the original user, recorder, active assignment, claimed setup,
  its consumed enrollment token, and seven related user audit events.
- Ran the guarded transfer in a serializable transaction and rolled it back.
  Repeated the same guarded transaction with a commit after successful validation.
- Restored the original UUID and enrollment identifiers on the live server. The
  new signup's display name, email, password hash, creation date and two existing
  sessions were retained. The fresh signup identity had no recorder assignments,
  server recordings or audit events; guards reject a merge if that changes.
- Removed the now-empty signup identity inside the same transaction. Password
  hashes were copied only inside Postgres and were never included in tool output.
- Added the audit action `pilot.local_setup_migrated`.

No app source, installed binary, local recording files, SDK ownership, backend
image, database schema, DNS or Vaultwarden service was changed by this recovery.
The original local database was left intact.

## Verification

The live HTTPS API verified the recovered user session, dashboard assignment,
original setup operation and Plaud SDK session. A fresh one-hour iPhone invitation
was issued through the existing owner-scoped enrollment endpoint and successfully
resolved to the recovered assignment. The short-lived diagnostic session used for
these checks was removed afterward; existing account sessions were retained.

The installed iPhone app was restarted with the recovery enrollment link, and
`devicectl` confirmed the launch succeeded. User sign-in, the visible recorder
screen and physical Bluetooth reconnection still require confirmation on the phone.
No additional app build or reinstall is required for this database recovery.

## Private evidence

Ignored directory: `.local/recorder-recovery/20260914T223724Z/`.

It contains the pre-recovery database backup, original setup export, guarded
dry-run/apply SQL and results, binding check, API verification, and phone launch
result. The invitation JSON, QR and launch logs contain a private enrollment link;
do not commit or publish them. The database backup includes account data and must
remain private. Reassess any later changes before using it for rollback.
