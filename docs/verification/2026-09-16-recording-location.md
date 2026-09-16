# Recording-location implementation verification

Branch: `codex/recording-location`, based on `main` at `1a20b06`. Changes are local and uncommitted. No server, website, APK download, TestFlight or installed phone app was updated in this pass.

## Scope

- Per-account opt-in Settings control with disclosure, OS permission handling, readiness and recovery.
- Native iOS/Android capture driven by confirmed Plaud recording callbacks, independent of React rendering. Pause, stop, disconnect, account changes, disable and native teardown stop collection.
- Bounded local native journals; validated metadata attachment after durable audio transfer; first/last point, accuracy, Maps handoff and independent location removal.
- Backup exclusions, account cleanup, revised privacy/purpose text and archive/manifest permission checks. No backend location field or upload was added.

## Completed checks

- `pnpm check`: typecheck, lint/import boundaries, **547 shared tests**, **18 release checks**, and workspace production builds passed. Latest evidence: `.local/location-work/check-final.log`.
- Focused shared regressions cover source mismatch, malformed fixes, attachment failures, acknowledgement retries, removal/reload/relaunch recovery, older pending recordings, account-switch/permission races and exclusion of coordinates from transcription registration/upload.
- iOS standalone Swift model/journal harness: **45 assertions passed**, including filesystem outages followed by deletion/account-cleanup retries. Evidence: `.local/location-work/ios-tests.log`.
- Full iOS Plaud/Expo module typecheck passed against installed arm64 frameworks, without SDK stubs. Evidence: `.local/location-work/ios-typecheck.log`.
- Non-clean iOS prebuild and pod regeneration included new Swift sources, both location purpose strings and `location`/`bluetooth-central` background modes. Full unsigned Release archive succeeded: `.local/remote-pilot/ios/AptlyAble-2026-09-16T15-48-54-080Z.xcarchive`. Version remains **0.1.2 (8)**. It is not installable or TestFlight-distributable. The final shared-source typecheck also passed after the Android-specific status-copy refinement.
- Android module compilation and **35 native tests passed** (22 location tests and 13 existing module tests). Verified test-result XML contains zero failures/errors/skips. Evidence: `.local/location-work/android-tests-final.log` and `apps/mobile/modules/plaud-sdk/android/build/test-results/testReleaseUnitTest/`.
- Android `:app:processReleaseMainManifest` succeeded using the existing private pilot signing configuration only for Gradle configuration. No key was changed, APK assembled or app installed. The actual merged manifest contains a private, location-only, stop-with-task foreground service; `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` and `POST_NOTIFICATIONS`; no `ACCESS_BACKGROUND_LOCATION` or boot receiver was introduced.
- The generated Android project remains a **pilot** profile with an empty generated `apiOrigin`; the strict store inspector correctly reports those two profile mismatches. Feature permissions/service and backup requirements passed that inspection. Regenerate using the normal explicit release environment when preparing distribution; this manifest is not a claim of store readiness.
- Local web Settings preview rendered the new labeled switch disabled with an explanation that the installed phone app is required. Browser checks do not verify native permission sheets or GPS.
- Independent code review findings were addressed with targeted regressions: durable deletion retry, old-metadata purge recovery, consent persistence failure feedback, stale status responses, pending attachment ordering, Android corrupt-store ownership, finalized-session resumes and permission/service callback races. The final iOS/shared and Android review passes reported no unresolved findings in their scopes; they are not substitutes for physical-device acceptance.

## Physical and release acceptance still required

No actual location permission was granted and no physical Plaud recording was made for this pass. Verify the cases in `docs/RECORDING_LOCATION.md` on a real iPhone and Android device, especially locked-screen physical-button delivery, permission/notification denial, pause/resume, Bluetooth loss, force-quit and deletion/resync.

Before distribution, increment the native build number, regenerate production/pilot configuration with the intended API origin and create signed installable builds. Review the updated privacy notice and Android foreground-service declaration against the exact shipping binaries. Existing store-readiness flags were not marked approved. Compilation and automated tests are not Apple/Google review approval.

## Reproduction

Shared: `pnpm check`.

iOS model: `xcrun swiftc -parse-as-library apps/mobile/modules/plaud-sdk/ios/PlaudRecordingLocationModel.swift scripts/tests/recording-location-ios.swift -o .local/location-work/ios-tests`, then run that executable.

iOS full build: follow `docs/IOS_PILOT.md`; this pass used `EXPO_PUBLIC_API_URL=https://api.plaud.aptlyable.info APTLY_IOS_BLUETOOTH_ONLY=0 pnpm ios:pilot` after non-clean prebuild and pod install.

Android: from `apps/mobile/android`, with Java 21 and the local Android SDK configured, run `./gradlew :plaud-sdk:testReleaseUnitTest :plaud-sdk:compileReleaseKotlin -PreactNativeArchitectures=arm64-v8a`. Release manifest merging also requires the existing private signing environment; never print or commit its values.
