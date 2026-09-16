# Recording location

This feature is implemented on the `codex/recording-location` branch. Signed **0.1.2 (9)** test packages are prepared; see the [build handoff](verification/2026-09-16-build9-preparation.md). Updating the website alone cannot add it to an installed app. These packages have not been installed on phones, published to the website or uploaded to either store.

## User flow

1. Sign in and connect the assigned recorder in the phone app.
2. Open **Settings → Recording location → Save location during recordings**.
3. Read the explanation, enable the feature, and answer the phone's permission prompt. Denying access does not prevent recording or audio transfer.
4. Check that the app reports readiness before locking the phone. On iPhone, use **Allow starts while phone is locked**, then grant **Always** location permission if desired. Android uses an ongoing notification while the feature is armed; it does not request background-location permission.
5. Press the Plaud record button. Native SDK recording callbacks start phone location capture. Pause/stop, disconnect, sign-out and disabling the setting stop capture.
6. After the completed audio transfers, open its recording detail. **Recording location** shows the first and last captured points, time, accuracy and any partial coverage. Choose **Open in Maps** to view a point, or **Remove location** to keep the audio and notes without its location.

Turning the setting off stops future capture but does not erase saved locations. A storage failure can prevent a preference from being saved; the app stops capture in the current process, displays the last saved switch state and asks the user to retry. Do not interpret that error as a successfully saved disable.

## Boundaries

- These are the phone's coordinates, not a GPS receiver in the Plaud. The phone must stay with the recorder and receive its Bluetooth recording events.
- Offline recordings cannot be located retroactively. Force-closing the app, missed Bluetooth events, denied/revoked permission or OS suspension can leave gaps. The app labels incomplete coverage instead of inventing points.
- The implementation retains at most one point per 30 seconds, 600 points per recording and five hours per capture session. Low-quality, stale, future and pre-recording fixes are rejected. Small movements indoors may not be distinguishable.
- Pending points stay in private, backup-excluded native storage for up to 30 days/100 sessions. Attached recording metadata stays until removed. Older iPhone backups made before these exclusions are not changed.
- This feature sends no location to the backend or Plaud. Coordinates are excluded from audio export, transcription requests, diagnostics and status events. The explicit Maps action shares the selected point with Apple Maps or Google Maps.
- Location failures do not fail an otherwise successful audio import. Metadata attachment retries on reload; deletion retries after a storage failure without restoring removed coordinates.

## Release and acceptance

The prepared test release is **0.1.2 (9)**: a signed Android APK, a development-signed iPhone app/IPA for the registered phone, and an App Store distribution-signed IPA prepared for TestFlight upload. These are pilot-profile builds. Apple upload/processing, tester access and physical acceptance remain separate steps. Existing store-readiness gates remain in force.

Real-device acceptance is still required on both platforms:

1. Verify the switch starts off for a new account and setup's Bluetooth/location permission never enables recording capture by itself.
2. Enable, record with the app visible, then stop and import. Check source ownership, timestamps and Maps destination.
3. With background readiness confirmed, lock the phone and start from the physical Plaud button. Verify start, pause, resume, stop and gaps.
4. Disconnect Bluetooth and revoke permission while recording. Confirm capture stops independently of React/UI activity.
5. Disable, sign out, switch accounts, force-close/reopen and unpair. Confirm no passive restart without a new permitted recording event.
6. Remove location, delete a recording and complete local account cleanup. Reopen and resync; removed coordinates must stay removed while retained audio/notes remain usable.
7. Exercise permission denial, deferred iOS Always prompts, Android notification denial and service/task removal. UI must accurately report readiness and a recovery path.

Platform references: [Apple background location](https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background), [Android foreground location services](https://developer.android.com/develop/background-work/services/fgs/service-types#location). Native compilation and unit checks are not evidence of store approval or locked-screen hardware acceptance.
