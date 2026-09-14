# Recorder battery and storage — 2026-09-11

## Behavior

The ready recorder card now includes battery percentage, charging state (when reported),
storage used, and free/total recorder storage in decimal GB. This is recorder storage,
separate from the phone's recording cache. The Android preview reuses the same visual
component with its explicitly simulated readings.

iOS calls the installed SDK's `getChargingState()` and `getStorage()` on the main queue.
Actual readings come from `blePowerChange`, `bleChargingState`, and `bleStorage`; resolving
the native request alone never populates values. Invalid values are discarded, zero battery
and zero free space are supported, and unavailable readings show a dash. The app retains
the last values with a message if a refresh fails, with an eight-second response timeout.

Status requests run after the full pairing handshake and when the app returns to the
foreground. A manual refresh is available. Listeners and pending timers detach and values
clear when the connection/owner changes. This read-only feature does not drive pairing,
recording transfer, deletion, or cloud requests.

## Verification

- `pnpm check`: TypeScript, lint, import boundaries, all 338 tests, and package/API/admin builds pass.
- Seven controller tests cover real callback ordering, 0/100 battery, full storage, malformed
  values, partial responses, timeout/retry, old listener/request isolation, React effect
  cleanup/reattachment, and native builds without this optional capability.
- Signed physical-iPhone Debug build succeeds using the existing workspace and provisioning.
- The shared meters render correctly on the Android emulator after simulated connection:
  battery 82%, storage used 44%, and 18.0 / 32.0 GB free. These are fixture readings only.
- Installation initially timed out while the connected iPhone required its passcode.
  Live readings and installation verification are pending the phone being unlocked.

## Platform limits

`getDeviceStatus` is currently an optional iOS bridge capability. Android hardware requests
must be implemented/compiled against the vendor AAR when it becomes available; the missing
SDK check remains in place. The Android emulator is not evidence of real device telemetry.
Older native app builds continue to pair and display unavailable status readings.

Local evidence: `.local/plaud-native-research/recorder-status-check.log`,
`recorder-status-ios-build.log`, and `recorder-status-install.json`.
