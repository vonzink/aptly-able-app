# Android emulator smoke check — September 22, 2026

## Environment

- Android API 36 / Pixel 8 ARM64 AVD: `AptlyAble_API36`.
- Current working tree built as `com.aptlyable.mobile.preview` (Aptly Able Preview).
- Metro on port 8092; local API on port 4100, addressed as `10.0.2.2` by Android.
- Pilot sign-in against the isolated local `setup_preview_20260922` database schema.
- Recorder connection is explicitly simulated; the preview excludes the Plaud native module.
- No production deployment, account changes, or hardware binding performed.

## Verified

- Android Gradle build succeeded and the APK installed.
- Android launched the preview's MainActivity; React Native logged `Running "main"`.
- No AndroidRuntime or ReactNativeJS error entries were present in the checked startup log.
- The served Android bundle uses the local emulator API URL and pilot authentication mode.
- An HTTP readiness request originating inside the emulator returned 200 with `status: ok`.
- Local test-account sign-in and account recorder lookup both returned HTTP 200.
- 65 focused automated tests passed across enrollment controller, simulated recorder
  controller, and local recording library. These are automated logic checks, not
  emulator UI or physical-device acceptance.

## Findings / limits

- Expo's automatic launch encountered Android's app resolver because more than one
  installed development build can handle its shared development-client scheme.
  Explicitly launching the preview package resolved startup for this session.
- Startup reports an existing dependency cycle between `PhoneRecordingProvider`
  and `AppProviders`. It did not prevent startup; separate context ownership is
  a follow-up cleanup item.
- Desktop screen control did not expose the emulator window. Tap-by-tap sign-in,
  keyboard layout, setup, playback, and lifecycle UI checks remain manual.
- The preview Recorder tab uses the older independent simulation. To review the
  current account-based setup, open Settings → Open enrollment. Simulation does
  not confirm a real account's recorder binding or reproduce Jake's handshake issue.
- Physical Android/iPhone pairing, transfer, locked-screen behavior, permissions,
  and secure connection recovery remain unverified here.

## Manual review order

1. Settings → Open enrollment: sign in with a local test account.
2. Check keyboard visibility, existing-recorder discovery, and setup continuation.
3. Exercise Recorder's clearly labeled simulation and its disconnect action.
4. Review Recordings search and import a disposable audio sample for playback,
   title/notes editing, and storage controls.
5. Relaunch the preview and check session/library restoration.

Keep Metro and the local API running while using this development APK. It is not
the downloadable pilot release and is not connected to the public server.
