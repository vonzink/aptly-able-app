# Complete recorder removal

## Behavior

The phone's Unpair recorder action now completes these steps in order:

1. Confirm Plaud cloud unbind and the native device's successful depair callback.
2. Stop scanning, close Bluetooth/Wi-Fi through the existing native disconnect
   method, and verify the SDK no longer reports a BLE connection.
3. Call `POST /v1/plaud/device-complete-unpair` with the owned operation ID.
4. Remove the saved enrollment journal and current recorder identity from the phone.

The final server operation reconfirms cloud unbind while holding the recorder's
ownership lock, releases the assignment, revokes its invitations and pending setup
operations, and records audit events in one transaction. It is available to the
assigned user; callers cannot specify a different user or serial. Retrying an
already-ended assignment returns success without contacting Plaud or touching a
later assignment. Historical assignments remain available in the dashboard.

The phone keeps confirmed progress when a later step fails. It does not erase the
enrollment until release and disconnection succeed, and it does not let a user
rescan a recorder whose device release is already confirmed. An interrupted
finalization can be retried without rebinding or repeating confirmed depair steps.
If secure storage fails, the current operation remains available for retry.
Saved recordings, recording labels/notes, and the user's signed-in session remain.
Connecting the recorder again requires a new assignment and enrollment invitation.

## Implementation

- `plaud-device-controller.ts`: owns release ordering and confirmed progress.
- `disconnect-plaud-transport.ts`: bounded disconnect confirmation using the
  existing SDK state query and connection callback.
- `enrollment-controller.ts`: guarded, serialized removal of persistent enrollment;
  old callbacks cannot erase another account or restore an abandoned operation.
- `AppProviders.tsx`: connects completion to enrollment cleanup at app scope.
- `modules/plaud-devices/service.ts`: owns assignment finalization under existing
  recorder/assignment locks. No schema migration is required.

The native SDK calls retain their documented flags: iOS `depair(clear: true)`,
Android `depair(false)` followed by disconnect. See Plaud's
[iOS unbind guide](https://docs.plaud.ai/plaud-embedded/ios-sdk#depair-unbind-a-device)
and [Android unbind guide](https://docs.plaud.ai/plaud-embedded/android-sdk#standard-unbind).
This change uses the existing native bridge; it does not erase recorder audio or
invoke recovery/factory-reset operations.

## Verification and rollout

- 77 focused tests passed across mobile connection/enrollment controllers, the
  device HTTP boundary, and API client. The 36 connection tests passed again after
  tightening the guard against reconnecting a released recorder.
- 9 database integration tests passed in an isolated schema in local Postgres.
  These include assignment/token release, ownership isolation, idempotent retry
  after reassignment, and rollback on a vendor failure.
- Contract/client builds, mobile/API TypeScript, scoped ESLint, import boundaries
  and whitespace checks passed. Vendor operations in tests are mocks; no real
  device was bound or unbound during verification.

## Deployed release

Source commit `765dc6d4f89a27939bdfa3702ea796b885245749` was pushed to `main`.
The compatible backend was activated before distributing phone build 5.

- Backend activated at `2026-09-15T03:07:10Z` on the existing Ohio EC2 server.
  Release: `/opt/aptly-able-pilot/releases/20260915T025047Z-unpair-765dc6d`.
  Image: `aptly-able-pilot-api:20260915-unpair-765dc6d`.
  Running image ID:
  `sha256:bd0e85ab64f67dc085d42eb924922a06462aa6844a8ca9fdc163eb999c6eb700`.
  Uploaded archive checksum, image layers/configuration, architecture and source
  label were verified. Docker's index ID and platform-manifest digest differ;
  the ID above was read from the running container.
- A fresh Postgres backup was taken and checked with `pg_restore --list` before
  activation. Server and private local backup checksums matched. Backup:
  `/opt/aptly-able-pilot/backups/pilot-before-activation-20260915T030655Z.dump`;
  SHA-256 `08a9627807108a29802e096aa84f685b7c79eb8bd0d846d6b0a1f056cb7b36ee`.
  This checks archive readability, not a complete restore rehearsal.
- Only the API container was replaced. Postgres and Vaultwarden retained their
  container IDs, image IDs, start times and mounts. The recordings volume,
  effective API configuration, separate database pools and Caddy configuration
  were preserved. No schema migration ran.
- Live HTTPS readiness, pilot-only authentication, read-only database probes and
  the new route's rejection of unauthenticated requests passed. These checks did
  not bind/unbind a real device or change an assignment.
- Android version `0.1.0`, build **5**, was published by Amplify job **6**
  (`SUCCEED`). The APK at `/downloads/aptly-able-android.apk` is 53,584,226 bytes;
  SHA-256 `6ae73284cf14e2061ae43e8a8640b094c37212c3df53d222f54075a813b11f43`.
  Its signing certificate matches build 4, allowing an update in place.
- The full website bundle preserved all other files, including the dashboard
  demo, enrollment pages, fonts and download headers. All 20 public file hashes
  and five entry routes passed live verification; missing APKs still return 404.
- The development-signed iOS build **5** was installed over the existing app on
  Zachary's iPhone. `devicectl` confirmed installed bundle version 5. Wi-Fi
  transfer remains enabled. This is not a TestFlight distribution.
- The explicitly approved temporary SSH rule was revoked after verification.
  AWS showed the original four inbound rules, and the SSH control connection
  was closed.

Physical unpair/re-enrollment acceptance on iOS and Android remains pending. On
an updated phone, connect a nearby recorder and select **Unpair recorder**. After
success, verify that the phone shows no recorder connected, the dashboard shows
the assignment released, and saved recordings and notes remain available. A new
assignment and invitation must be required to connect again.

Private build/deployment evidence and the prior website ZIP are in
`.local/unpair-release/20260915T025047Z/`. The previous backend release
`/opt/aptly-able-pilot/releases/20260914T225356Z-pool-9ec1539` remains available.
An API rollback requires no database restoration, but build 5 needs the new
finalization endpoint: pause unpair testing if rolling the backend back. Do not
uninstall phone apps or discard their enrollment journals to work around a
failed finalization.
