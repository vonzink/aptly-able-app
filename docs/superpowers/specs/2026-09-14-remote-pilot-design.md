# Remote recorder pilot

The approved experience starts with one website URL. A tester creates an account,
registers their own NotePin S, chooses Android or iOS, and generates a QR. The QR
opens an installation page on the phone. After installing, the tester returns to
the page and opens the enrollment in Aptly Able, signs in with the same account,
and connects over Bluetooth.

## Boundaries

- Preserve the shared React Native UI and Swift/Kotlin hardware adapters.
- Preserve existing local development sign-in and the working iPhone pairing and
  recording transfer. Do not uninstall or unpair devices.
- Separate assignments from enrollment tokens. Tokens remain hashed in Postgres
  and travel in URL fragments. Merely opening the installation page never claims
  or consumes an invitation. A replacement QR invalidates the earlier invitation.
- Public account creation creates a user with self-service capability, never an
  administrator. Every workspace query and mutation is limited to that user.
- Use email/password accounts for this private pilot, scrypt password hashes,
  expiring opaque server sessions, throttled authentication, and explicit logout.
  Email delivery, verified-email claims and password reset are not provided by
  this pilot. The account UI must not promise them.
- Android downloads a signed standalone APK with bundled JavaScript and the real
  Plaud SDK. iOS installation uses a configurable TestFlight URL. An unavailable
  build gets clear unavailable copy, not a broken or fabricated download.
- Website installation does not automatically resume after a new app install.
  Provide explicit return-and-continue instructions and retain the invitation in
  the browser fragment. Never pass passwords or sessions in the QR.
- The user authorized deployment and DNS setup during implementation. Host the
  website/APK on Amplify and reuse the identified Vaultwarden EC2 host for a
  separate API/Postgres deployment. Do not create the declined Lightsail server.
- No server audio upload or AI processing is added; existing stubs remain honest.
- New migrations only. No edits to applied SQL. No broad git staging or commits:
  the application is currently untracked inside a larger working repository.

## Interfaces

`ActorContext` gains optional `selfService: true`; only the hosted account verifier
sets it. Session verification may be asynchronous. Existing `/v1/admin` endpoints
remain admin-only; `/v1/workspace` endpoints expose the same assignment operations
to the owner, with ownership checked transactionally before mutation.

`POST /v1/auth/register` accepts displayName, email and password. Login accepts
email and password. Both return `{ credential, expiresAt, session }`. Session mode
is `pilot` for these accounts and `development` for existing local credentials.
Logout revokes the session. `GET /v1/auth/config` exposes available sign-in modes.

Invitation issue requests optionally include `platform: android | ios`. Existing
clients may omit it. If present, only the non-secret platform goes in the query;
the invitation token always stays in `#token=...`.

The hosted admin app serves `/enroll`, with configured download URLs. The normal
mobile build embeds the chosen HTTPS API URL; it never embeds Plaud server keys.

## Acceptance

Test registration/login/logout/expiry; cross-account denial of list/read/create/
issue/revoke/end; continued admin restrictions; platform-specific QR URLs; invalid
and absent invitation handling; unavailable iOS build handling. Run workspace
checks, database integration tests in temporary schemas, browser walkthrough, and
compile the full real Android APK. Emulator launch proves packaging, not Bluetooth.
Physical Android pairing and transfer and TestFlight distribution require external
acceptance and are reported separately.

## Approved hosting update

The final hostname supersedes the earlier temporary zvzsolutions.com proposal.
The website and APK are packaged for Amplify at https://plaud.aptlyable.info.
The API uses https://api.plaud.aptlyable.info on the prepared backend server.
Direct HTTPS API calls avoid proxying authenticated requests through the static
website cache. The mobile API origin is rebuild-time configuration; retain the
old API hostname during a later domain migration until testers have updated.

The final user steering selects plaud.aptlyable.info (DNS at Porkbun) and an existing
EC2 instance running Vaultwarden. API hostname api.plaud.aptlyable.info. Do not
create a paid Lightsail instance. Inspect the existing host before installing a
separate API/Postgres service; preserve Vaultwarden and reuse its proxy safely.
