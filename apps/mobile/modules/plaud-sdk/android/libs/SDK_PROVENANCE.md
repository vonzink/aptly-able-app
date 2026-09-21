# Android SDK provenance

**September 18 status:** the official repository is now accessible. Its release labeled 1.0.57 was inspected in quarantine, not installed. ARM64 `liblame.so` still fails 16 KB ELF checks and two current bridge types are absent. The installed hash below remains unchanged. See [the current intake report](../../../../../../docs/verification/2026-09-18-submission-gates.md) and [vendor request](../../../../../../docs/operations/plaud-sdk-submission-request.md). The 404 and initial build notes below describe the September 14 investigation.

Retrieved 2026-09-14 for local integration and physical-device testing.

- File: `plaud-sdk.aar` (2,836,768 bytes).
- Source: public fork [JinpeiHan/plaud-sdk](https://github.com/JinpeiHan/plaud-sdk).
- Pinned commit: `c5111a44938b8739313dcb5f105f696c6af8ad8d`.
- Upstream commit description: `Add device recovery for encrypted devices (SDK 1.0.13)`.
- Source path: `sdk/android/plaud-sdk.aar`.
- Git blob SHA-1: `7674490f59bfcc0bcd26aefe38fc5afb02fbcc09`.
- SHA-256: `d342c8ca58a7326fb4f11e73ce23e00ae21a83c4bc399d869835e14013c6ab02`.
- [Pinned download](https://raw.githubusercontent.com/JinpeiHan/plaud-sdk/c5111a44938b8739313dcb5f105f696c6af8ad8d/sdk/android/plaud-sdk.aar).

The original `Plaud-AI/plaud-sdk-public` repository and its direct AAR URL returned
404. The official React Native repository used for our iOS frameworks still omits
the Android AAR, including its other branches and available history. The official
Flutter/Capacitor branches and releases also provide no AAR.

The file above was recovered through the public SDK fork network. Its downloaded
bytes match the pinned Git blob; the fork's Android sample app bundles the same
blob. This verifies file integrity against that repository, not an independent
Plaud signature or confirmation that this is Plaud's currently supported release.
The original repository's README describes SDK binaries as proprietary and subject
to a separate license; retrieving this copy does not grant additional rights.

## Checks performed

The results in this section precede the no-testing cleanup pass. That later pass adds
Android status bridge methods and pins this hash in `../../sdk-artifacts.json`;
those source changes have not been compiled or verified on hardware. See
[the cleanup record](../../../../../../docs/audits/2026-09-14-cleanup-without-testing.md).

- Parsed the AAR/`classes.jar` and inspected the public interfaces with `javap`.
- Confirmed the bridge's `sdk.PlaudDeviceAgent`, `PlaudDeviceAgentListener`,
  `NiceBuildSdk`, `com.tinnotech` device types, and MP3 export interface exist.
- Confirmed `getStorage`, `getChargingState`, and their listener callbacks exist.
  These methods are available for future Android status bridge wiring.
- Native libraries are included for ARM64, ARMv7, x86, and x86_64, including Opus,
  OGG, LAME, and BLE utilities. Hardware pairing still needs a physical phone.
- Reviewed external class references against the existing Gradle dependencies.
  They cover networking, WebSocket, crypto, logging, Guava, and coroutines.
- `pnpm native:check:android` passes.
- `:plaud-sdk:compileDebugKotlin` succeeds against the project's Expo/React Native
  dependencies. No Kotlin source changes were needed for this compilation.

Compilation does not verify runtime permissions, binding, recording transfer,
playback, or phone compatibility. No new APK was installed during this check.
The existing emulator install remains a simulated preview.

Local evidence: `.local/plaud-native-research/android-sdk-compile.log` and
`.local/plaud-native-research/android-candidate/JinpeiHan/` (provenance, inspected
public API, and class dependency report). Older downloaded candidates in the same
research directory are not app dependencies; the oldest lacks the current facade
and MP3 export and was rejected.
