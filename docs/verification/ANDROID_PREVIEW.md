# Android emulator verification — 2026-09-11

## Result

The existing shared Expo/React Native app builds and runs on the Android 36 ARM64
Pixel 8 emulator (`AptlyAble_API36`). No separate Kotlin UI/codebase was created.
The installed package is `com.aptlyable.mobile.preview`, labeled Aptly Able Preview.
The preview excludes the Plaud native module and uses the existing recorder simulation.

`pnpm android:preview` successfully builds, installs and launches the app. The first
native build completed in 6m 26s; the subsequent run/build completed in 51s using
cached dependencies. These are observed local timings, not a performance guarantee.
The launcher selects the AVD by name; prebuild uses `--no-clean` to preserve native
build files and caches. The normal Android command regenerates the normal app config
before building, and retains the vendor-SDK prerequisite check.

## Verified

- `pnpm check`: all 331 tests pass, plus TypeScript, lint, import boundaries and
  contracts/API-client/API/admin builds.
- Normal config: `recorderMode=native`, package `com.aptlyable.mobile`, scheme
  `aptlyable`. Preview: `recorderMode=mock`, package `com.aptlyable.mobile.preview`,
  scheme `aptlyable-preview`.
- Live Metro manifests: iPhone on 8088 still reports native mode; Android on 8092
  reports mock mode. The Android development bundle returns HTTP 200.
- APK inspection confirms the preview package, label, main activity and arm64-v8a ABI.
- Home, Recordings and Recorder render in the emulator with the existing logo/theme.
  Simulated discovery and connected NotePin S state were observed. The Android system
  audio picker opens. The preview explicitly identifies recorder connection as simulated.
- A runtime harness exercised the **actual Android filesystem and audio modules** using
  a generated 12-second WAV and a fictional recorder identity. Fifteen assertions passed:
  native import, rename, transcript attachment, WAV decoding, playback advancement,
  pause, persisted audio/transcript, temporary receipt, cache clearing that preserves
  metadata/transcript, restore, download to phone, download surviving cache clearing,
  deletion, deleted bytes absent from disk, and persistent dismissal of deleted audio.
- One sample named **Android preview audio** remains in the emulator library. The
  disposable cache-test recording and source temporary file were removed.

The filesystem/player assertions used the React Native runtime inspector, rather than
automating every file-picker gesture. Files on the emulator were independently inspected
to confirm the permanent audio/metadata and dismissal receipts. No real recordings or
credentials were used, and no upload/transcription requests were sent.

## Limits and next acceptance

The missing vendor `plaud-sdk.aar` was deliberately excluded only for this preview.
This build does **not** verify the Kotlin Plaud bridge, Bluetooth permissions, secure
handshake, actual recorder transfer or Android background behavior. Obtain the SDK and
test those flows on a physical Android phone. The iPhone's verified pairing was not changed.
Server upload/automatic transcription remain stubbed. The APK is a development build
and needs its Metro server; it is not an app-store or standalone distribution build.

Local evidence is under `.local/android-development/`: `build.log`, `run.log`,
`check.log`, `native-checks.json`, `verify-native.js`, and `screen.png`.
The APK is at `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`.
SHA-256 at verification: `0fe66431417f18993ab48137830109d3d64e356facc744b86905ec4826389672`.

See [run instructions](../ANDROID_PREVIEW.md).
