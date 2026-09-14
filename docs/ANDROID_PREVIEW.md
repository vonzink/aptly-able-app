# Android emulator preview

This is the **same app** as iPhone: `apps/mobile`. React Native shares the screens,
recording library, storage rules, enrollment and API clients. Only the Plaud SDK
bridges differ (Swift on iOS, Kotlin on Android). There is no separate Kotlin UI project.

The Android emulator preview is installed as **Aptly Able Preview**
(`com.aptlyable.mobile.preview`). It uses the existing, explicitly labeled recorder
simulation and excludes the hardware-only Plaud module during Android autolinking.
Audio import, playback, library editing and local storage use the real Android APIs.
The preview does not contact, bind, unbind or transfer audio from a real Plaud.
Server upload and automatic transcription remain stubbed, as on iPhone.

## Run on this Mac

From the workspace, start the virtual phone in one terminal:

```sh
pnpm android:emulator
```

After its home screen appears, use another terminal:

```sh
pnpm android:preview
```

The command builds shared packages, regenerates **Android only**, builds/installs
the preview on an available emulator and runs Metro on port **8092**. The iPhone's
Metro server on 8088 is separate. No local credential is embedded in this build.
The optional development API uses `http://10.0.2.2:4100` (the Mac from the emulator).

For an APK build without starting Metro:

```sh
pnpm android:preview:build
```

Output: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`. This is a
development APK; it still needs Metro on 8092 to load the app. Keep the preview
command running while testing. A standalone release/distribution build is separate work.

## Tooling

This Mac has an Apple Silicon Android 36 / Pixel 8 virtual device named
`AptlyAble_API36`. Local SDK files are under `.local/android-sdk`; AVD files are
under `.local/android-development/avd`. Both are ignored by Git. Android Studio
is optional for these commands. JDK 21 is selected on macOS unless `JAVA_HOME`
is explicitly supplied.

On another machine install the Android command-line tools or Android Studio and:

```sh
sdkmanager 'platform-tools' 'emulator' 'platforms;android-36' 'build-tools;36.0.0' \
  'system-images;android-36;google_apis;arm64-v8a'
avdmanager create avd -n AptlyAble_API36 \
  -k 'system-images;android-36;google_apis;arm64-v8a' -d pixel_8
```

Set `ANDROID_HOME` to that SDK and `ANDROID_AVD_HOME` to its AVD directory before
running the workspace commands. Select an x86_64 image for an Intel host.
The first native build may install its required NDK/CMake packages and download
Gradle dependencies. It can take considerably longer than later builds.

## Real Android recorder testing

The Android Plaud AAR is now present at
`apps/mobile/modules/plaud-sdk/android/libs/plaud-sdk.aar`, and the Kotlin bridge
compiles against it. See [source and verification](../apps/mobile/modules/plaud-sdk/android/libs/SDK_PROVENANCE.md).
The simulator preview still excludes the native module and simulates recorder connection.

With a physical Android phone connected:

```sh
pnpm --filter @aptly/mobile android
```

That command checks for the vendor SDK and regenerates Android with the normal
package (`com.aptlyable.mobile`), app scheme and native recorder mode. The
`APTLY_ANDROID_PREVIEW` flag is scoped to the preview script's child processes;
normal iPhone and Android commands default to real hardware support. Real Android
pairing/handshake, transfer, playback and retention must be verified on that phone.

References: [Expo development builds](https://docs.expo.dev/workflow/customizing/),
[Plaud Android requirements](https://docs.plaud.ai/plaud-embedded/android-sdk),
[Android emulator](https://developer.android.com/studio/run/emulator).
