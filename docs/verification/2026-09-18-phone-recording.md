# Phone recording and lock-screen status

Implementation on `codex/phone-recording`, September 18, 2026. These changes are newer than the prepared 0.1.2 build 9 packages. They have not been deployed, installed on a physical phone, or uploaded to a store.

## User flow

Recordings → Record audio → Start → Pause/Resume or Stop → Save. No Plaud recorder is required. Sign-in scopes phone recordings to their owner on this phone. Saving opens the existing recording detail with playback, title, notes, export and delete.

Phone audio uses mono AAC in M4A at 64 kbit/s, with a two-hour native recording limit (approximately 58 MB before container overhead). Background audio is enabled on both platforms. Calls, OS interruptions, permission changes, process termination and low storage can still interrupt recording. No microphone capture starts from app launch, a deep link, a widget or restored state.

In the pilot profile, Generate transcript reuses the existing account-authenticated upload, consent and transcription flow for imported audio. Files are saved locally first. The live capabilities endpoint returned `available: false`, `reason: not_configured` on September 18; no successful live transcription is claimed. The store profile continues to hide cloud transcription. This change does not enable cloud credentials or automatic uploads.

## Lock screen

- iOS: an Expo Widgets Live Activity displays timing/status and opens `aptlyable://phone-recording`. Pause and Stop are inside the app in this version. No recording title, notes, account identifiers or audio enter its app group. The native timer avoids per-second ActivityKit updates; state refreshes are throttled to 30 seconds with a one-minute stale deadline. Stale display asks the user to check in the app. Disabled Live Activities never prevent recording.
- Android: Expo Audio's private microphone foreground service provides an ongoing recording notification and native Stop action. Notification permission is required on Android 13+. The app also provides a timer and status banner across screens. The SDK notification does not supply a live timer or Pause action.
- Neither platform starts recording from the lock screen. The iOS implementation follows [Expo Widgets](https://docs.expo.dev/versions/latest/sdk/widgets/); recording uses the existing [Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/) dependency.

## Separation and recovery

- `features/phone-recording/phone-recording-controller.ts`: permission, capture, interruption, save/discard and account-switch state machine behind a testable audio port.
- `services/phone-recorder.native.ts`: native audio, permissions, private cache journal and constrained file access. A single capture is allowed. Browser recording is explicitly unavailable.
- `features/phone-recording/recording-activity.ts`: serialized, throttled status projection; iOS rendering is platform-specific.
- `features/recordings/recordings-controller.ts`: serialized, idempotent library commit using the capture ID. A failed save leaves the draft available. A failed temporary-file cleanup retries without making another library entry.
- Saved microphone recordings have `phoneCapture` ownership metadata. They are separate from Plaud `source` metadata and its server stub; they use the existing manual-file transcription path. Manual imports retain their prior device-shared behavior.
- Unfinished audio and its per-account journal use cache storage, excluded from backup but potentially evictable. Recovery never restarts the microphone. Account change stops capture; account deletion removes owned saved audio and drafts, blocking new capture during cleanup.
- Phone recording does not activate the Plaud-only recording-location feature. Do not infer GPS points for these files.

## Native build and signing

Run non-clean Expo prebuild on both platforms and install CocoaPods after installing locked dependencies. Microphone/background permissions and the widget extension require a new native binary; Metro refresh alone cannot install these capabilities.

Before producing the next signed iOS package:

1. Register/enable App Groups on `com.aptlyable.mobile` and the new extension `com.aptlyable.mobile.RecordingActivity` in the existing Apple team.
2. Give both targets access to `group.com.aptlyable.mobile`; regenerate development and distribution profiles and include the extension in export profile mapping when using manual signing.
3. Increment the build number from 9 before distributing a new package. Keep previously prepared build 9 artifacts intact.
4. Verify the signed, embedded `ExpoWidgetsTarget.appex`, main app group entitlement, microphone purpose string and audio background mode. Store verification now rejects missing widget configuration/extension or microphone permissions.

No Apple account capability or provisioning profile has been changed by this source implementation.

## Verification and remaining acceptance

Automated checks cover permission denial, duplicate Start, interruption without auto-resume, sign-out during permissions, draft recovery, save failure, cleanup retry, account isolation/deletion, capture limit resume behavior, lock-screen update ordering/throttling and native release permission checks. Local checks: 565 unit tests passed across 53 files; the 52 focused capture/library/account/lock-screen checks also passed after the final controller changes. All 19 release-tooling tests, workspace type checks, lint and import-boundary checks passed. Android arm64 debug compilation passed. iOS/Android/web JavaScript export passed. The full unsigned iOS arm64 Debug app build passed after the cache correction below, including its embedded widget extension. Local browser verification confirmed the Record audio entry point, route, and explicit native-app fallback. These checks did not record microphone audio.

Physical acceptance is still required on both iOS and Android:

1. Deny microphone permission, then grant it in Settings; deny Android notifications and retry. No capture before explicit Start.
2. Record a known harmless sample, lock for at least a minute, switch apps, reopen and verify the saved audio includes those intervals.
3. Pause/resume; confirm the timer excludes pauses and playback duration is correct. Verify Android notification Stop and iPhone Live Activity deep link, Dynamic Island, disabled activities and stale state.
4. Trigger an incoming call/audio interruption. Confirm state is accurate, there is no silent restart, and available audio can be saved.
5. Simulate low storage, failed library write, failed cleanup and force-quit. Verify retained drafts/recovery messaging; do not promise recovery of an unfinalized M4A after process death.
6. Sign out during capture/permission/save. Sign in as another test account and confirm no old draft or phone recording is visible. Delete a disposable account and verify owned saved files and drafts are removed while another account's files remain.
7. After server transcription is configured, explicitly consent to uploading a harmless saved phone file; verify server audio, transcript, retry/offline behavior and deletion boundaries. Until then, demonstrate local recording/playback only.

Compilation and automated checks are not proof of hardware behavior or store acceptance. Existing owner/vendor/privacy and hardware readiness flags remain false.

### Local Xcode cache correction

The first unsigned iOS Debug build failed to link React Native debug-only symbols. SHA-256 comparison with the installed vendor tarballs showed both `React-Core-prebuilt` and `ReactNativeDependencies` contained Release binaries while their generated `.last_build_configuration` markers were missing. React Native's selector assumes Debug when that marker is absent and skipped replacement. Restored the two generated cache markers to the verified Release state, allowing the official build scripts to extract Debug artifacts on the next build. No vendor source, application build flags or tracked native source was patched to suppress the linker failure. Do not run Debug and Release builds concurrently against this shared Pods folder.
