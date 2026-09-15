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

Build 5 is being prepared for iOS and Android. Deploy the compatible backend
before installing/publishing the new phone build. The old APK remains compatible
with the additive backend endpoint. This document records implementation and
local verification; live activation and physical acceptance are still pending.
