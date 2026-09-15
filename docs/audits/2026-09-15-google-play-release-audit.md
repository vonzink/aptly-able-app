# Google Play Release Audit

Date: September 15, 2026. Repository: `/Users/zacharyzink/AptlyAble/aptly-able-app`.
Audited branch: `main`; commit: `eed0214c259425f27fa3f7f5080080b54b7737d8`.
Android application: `com.aptlyable.mobile`, version **0.1.2**, version code **7**.

## Executive Summary

**Overall status: NOT READY for public Google Play submission.**

The app can produce a correctly signed Android App Bundle. The shared application checks and database integration tests pass. This is a functioning pilot with substantial reliability work already implemented, not an empty shell. However, the Android release has excessive permissions, an inaccurate location disclosure, SDK logging that needs privacy review, incompatible native-library alignment, and unresolved operational/reviewer evidence. These are material release concerns.

The most immediate policy risk is the difference between what Android requests and what the privacy notice explains. The most immediate technical compatibility issue is the bundled native libraries. The most important third-party risk is the behavior and support status of the recovered Plaud AAR.

**Confirmed results:**

- Signed store-profile AAB built successfully; Google `bundletool validate` passed.
- Actual packaged configuration says `recorderMode: native`, `releaseChannel: store`; production API URL is present in the Hermes bundle.
- Target/compile SDK 36; minimum SDK 24; release is not debuggable.
- 477 unit tests, 44 PostgreSQL integration tests, and 8 release-script tests passed.
- JavaScript production dependency audit reported zero known advisories. The Android Maven scan found four advisories affecting two resolved libraries; exploitability in this app is not established.
- Full Android lint did **not** complete: dependency lint crashed in Kotlin analysis. Release vital lint passed in the separate successful bundle build.
- Two packaged libraries have 4 KB ELF LOAD alignment. An additional RELRO check also needs attention; see H2.

**Not verified:** Play Console setup, its current warnings, reviewer credentials, vendor privacy/erasure assurances, real Android hardware pairing and transfer, device behavior under permission revocation/process death, actual network traffic, and fulfillment of the seven-day deletion promise.

No application source, signing key, deployed service, account, recorder, or Play Console setting was changed. This report is the only intended repository addition. Build/inspection evidence is in the ignored `.local/play-store-audit-2026-09-15/` directory.

### How to interpret severity

- **BLOCKER:** confirmed policy-facing defect, or an explicitly identified submission gate that lacks evidence. A missing-evidence gate is not proof that Google has rejected the app.
- **HIGH:** resolve before a production submission because of privacy, security, compatibility, or core-function reliability.
- **MEDIUM / LOW:** important hardening or quality work; not presented as an automatic Google rejection.
- **PASS:** limited to the precise behavior or artifact inspected, never a blanket compliance certification.

## 1. Application Architecture and Release Configuration

| Area | Verified implementation |
| --- | --- |
| Workspace | pnpm 11.19.0 monorepo; Node 24; TypeScript 6.0.3 |
| Phone app | React Native 0.86.3, React 19.2.3, Expo 57.0.21, Expo Router 57.0.20; Hermes and the new architecture |
| Native Android | Generated Gradle app under `apps/mobile/android`; custom Kotlin Expo module under `apps/mobile/modules/plaud-sdk/android` |
| Other frameworks | No active Capacitor, Cordova, Flutter, or embedded WebView app architecture found. Old migration references in documentation are not current runtime code. |
| Gradle / AGP | Gradle 9.3.1 / Android Gradle Plugin 8.12.0 |
| Kotlin / Java | Kotlin 2.1.20; React Native Gradle plugin configures Java 17 source/target; build executed using JDK 21 |
| Android SDK | compile 36, target 36, minimum 24, build tools 36.0.0 |
| Native toolchain | NDK 27.1.12297006 |
| Package / namespace | `com.aptlyable.mobile` |
| Version | `0.1.2` / `7`, sourced from [release.json][release] |
| Built ABI | `arm64-v8a`; 28 shared libraries. This build intentionally does not cover 32-bit-only or x86 devices. |
| Native bridge | `PlaudSdkModule.kt`, `PlaudRecorderActions.kt`, `PlaudWifiTransfer.kt` expose pairing, status, recorder control, and transfer |
| Plaud binary | Pinned `plaud-sdk.aar`; source commit description identifies SDK 1.0.13, but current vendor support is unconfirmed |
| Backend | Fastify 5.12.3, PostgreSQL via pg 8.23; custom account/session auth and Plaud partner/transcription integrations |
| Web | Separate Vite/React admin/enrollment interface; FieldSense dashboard is a display-only web demo, not a completed phone feature |
| Authentication | Email/password pilot identity; opaque seven-day bearer sessions; no Cognito, Google Sign-In, or OAuth flow currently used |
| Files/audio | Expo document picker, filesystem, audio playback, and sharing; Plaud hardware supplies recorded audio |
| Phone microphone/camera | Neither requested in the release manifest. Keyboard dictation is supplied by the keyboard/OS. |
| Location | No app-level GPS tracking implementation found. Android location permissions are nevertheless requested for SDK pairing. |
| Bluetooth / Wi-Fi | Hardware BLE connection, optional recorder Wi-Fi transfer and local WebSocket transport through the vendor SDK |
| Analytics / crash reporting | No application integration with Firebase Analytics, Crashlytics, Sentry, or advertising analytics found. SDK file logging is present. |
| Ads / payments / push | No advertising SDK, billing flow, subscription purchase, or push integration found |
| Background execution | No Android service or foreground-service declaration, WorkManager job, AlarmManager task, or push handler found in the inspected application/merged manifest |
| Deep links | Custom `aptlyable:` and `exp+aptly-able:` schemes; no verified HTTPS App Links |
| OTA updates | Expo Updates disabled in the release manifest |
| Release optimization | R8 minification and resource shrinking disabled. This is not itself a Play policy failure. |
| Signing | Existing private pilot certificate used for this audit build; Gradle overrides the template's debug signing for release. No new key generated. |

**Source of truth:** [app.config.ts][config], [mobile package.json][mobile-package], [native module Gradle][native-gradle], config plugins, and the lockfile. Generated Android files are evidence of the current build, not the right place for durable Expo configuration fixes.

The target API is appropriate for the policy retrieved on the audit date: new apps and updates must target API 36 from August 31, 2026, subject to Google's stated extension process. [Google target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en).

## 2. BLOCKERS — Policy-Facing Defects and Submission Gates

### B1 — Android's sensitive permission behavior is not accurately disclosed

**Status: confirmed code/disclosure mismatch; must fix.**

**Finding:** [PlaudSdkModule.kt:657][permissions] requests precise and approximate location alongside Bluetooth even on Android 12+. All requested permissions must be granted. The [shared privacy notice:23][notice] explains location only on **iPhone**, while recorder setup primarily tells users to allow Bluetooth. The installed AAR's own `sdk.permission.PermissionManager` repeats the same location requirement.

**Why it matters:** users following a Bluetooth-only explanation encounter an unexpected location prompt. Approximate-only access also cannot satisfy the current all-granted check. This is a concrete disclosure and permission-minimization problem, not proof that GPS coordinates are uploaded.

**Change required:** first establish whether a supported Plaud SDK can pair without location on Android 12+. If so, change both native permission requests and the merged manifest. If not, document the SDK constraint, show an accurate just-in-time explanation before the location prompt, and let users decline while retaining local library functionality. Update the shared notice to describe Android as well as iOS. Do not simply delete a permission while leaving the AAR's permission gate unchanged.

**Policy basis:** unexpected sensitive-data access needs clear in-app explanation and appropriate consent. [Google User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311). Android itself supports Bluetooth discovery without location for eligible `neverForLocation` use cases. [Android Bluetooth permissions](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions).

### B2 — Privacy policy and Data Safety cannot yet be signed off against the actual SDK

**Status: unresolved release gate; no assertion that an unseen Play Console form is wrong.**

**Finding:** [store-readiness.json][readiness] explicitly leaves `privacyPolicyReviewed` and `providerPrivacyReviewed` false. Its designated policy URL is the [company privacy page](https://www.aptlyable.com/privacy), which currently describes website forms, website analytics, and communications. It does not explain this app's recorder authentication, Plaud processing, or the Android SDK logging identified in H1. The separate app notice is much more useful, but still has the Android omission in B1 and lacks a reconciled SDK data inventory.

**Why it matters:** a statement such as “no data collected” would be false: account information and recorder identifiers leave the phone. “No audio uploaded” also needs to be scoped to the store profile and verified against vendor behavior, not inferred from the absence of a visible transcription button.

**Change required:** approve an app-specific public policy/notice and the inventory in section 8 after obtaining vendor answers and observing the final release's traffic. Use the appropriate app-specific URL in Play Console. Decide which party processes which data, retention, deletion, and whether provider contracts support the service-provider exception to Data Safety “sharing.”

**Evidence:** [shared product content][notice], [store readiness flags][readiness], [SDK provenance][provenance], H1 and H6 below. Google makes the developer responsible for included SDK behavior. [Using third-party SDKs](https://support.google.com/googleplay/android-developer/answer/10358880?hl=en).

### B3 — Reviewer access, account-deletion operations, and Console eligibility are unverified

**Status: conditional submission gates, not confirmed source violations.**

The repository does not establish that a reviewer has a usable account, hardware-access plan, repeatable enrollment, or working credentials in App Access. `hardwareReviewVerified`, `providerErasureVerified`, and `backupRetentionReviewed` remain false. The account-deletion workflow is implemented, but final provider/backup completion requires real operational work, not just a database flag.

Google must be able to access restricted functionality. Prepare the instructions in section 14 and verify the seven-day process in section 9. Confirm package ownership, signing, version-code availability, testing-track eligibility, and mandatory declarations inside Play Console. None were accessed during this audit. [Reviewer sign-in requirements](https://support.google.com/googleplay/android-developer/answer/15748846?hl=en).

## 3. HIGH PRIORITY — Engineering and Privacy Fixes

### H1 — Plaud's release SDK performs detailed local network logging

**Evidence:** binary inspection of the pinned AAR, saved under the audit evidence directory:

- `sdk.NiceBuildSdk.initSdk` calls `sdk.util.Logger.init`.
- Logger creates `filesDir/plaud_sdk_logs`, installs a file logging tree, and reports file logging active.
- `sdk.network.PartnerRetrofitClient` constructs request/response logs. Its builder adds the detailed logging interceptor without an observed debug-build guard.
- Authorization and device-signature headers longer than 30 characters are shortened to their first 30 and last 10 characters; they are not fully redacted. Shorter values are retained. Body logging does not perform equivalent field redaction.
- Bundled Logback configuration has INFO output, a 20 MB rolling file threshold, seven-day history, and a 100 MB total cap.

**Impact:** authentication material fragments, identifiers, and potentially sensitive response fields can be retained locally. The exact payloads produced by a real pairing session were not captured; this is not a claim that a complete usable production token was observed. This logging also creates avoidable phone storage usage.

**Fix:** obtain a supported release AAR with a documented way to disable/redact payload logging, or use a vendor-supported configuration. Verify the change in the final binary and on a physical phone. Document remaining diagnostic retention, and remove old SDK logs during appropriate account cleanup. Fixing the app's JavaScript logger alone will not address this.

**Files:** [native SDK dependency configuration:54][native-gradle], [SDK initialization:190][bridge-init], [privacy notice:56][notice]. Detailed binary evidence: `sdk.util.Logger.javap.txt`, `sdk.network.PartnerRetrofitClient.javap.txt`, `com.plaud.sdk.internalimpl.AdharaStateProvider.javap.txt`, `logback.xml`.

### H2 — The AAB does not yet demonstrate 16 KB native compatibility

**Confirmed:** `base/lib/arm64-v8a/libconscrypt_jni.so` and `liblame.so` have ELF LOAD alignments of **4096**, not at least 16384. The former comes from Conscrypt 2.5.2; the latter is supplied in Plaud's AAR. This was checked in the newly built AAB, not only an old APK.

Bundle configuration correctly requests `PAGE_ALIGNMENT_16K`. That verifies packaging intent, not the alignment or runtime behavior of each precompiled library. Upgrading only AGP or running `zipalign` will not repair a vendor's ELF binary.

A supplemental application of Android's documented `(GNU_RELRO.VirtAddr + MemSiz) % 16384` check returned nonzero for 24 of the 28 libraries, including React Native/Expo libraries. Preserve `bundle-elf-alignment.json` and investigate this broader result with the toolchain/vendors and a real 16 KB environment. It is a static compatibility warning, **not evidence that all 24 libraries crash**.

**Fix:** replace/rebuild the incompatible prebuilts; check whether Conscrypt is necessary for the vendor path before considering removal; address RELRO results with a supported toolchain. Then generate device APKs from the AAB, validate ZIP and ELF alignment, and exercise startup, pairing, decryption, MP3 export, and playback on 16 KB Android.

**Policy timing:** the official page retrieved September 15, 2026 says API 35+ apps must support 16 KB, and specifically names **February 1, 2027** for blocking unsupported **updates**. It does not justify claiming this bundle is automatically rejected today under an older deadline. Confirm this new app's actual Console enforcement. The compatibility defect should still be fixed before production. [Android 16 KB guidance](https://developer.android.com/guide/practices/page-sizes).

**Files:** [native Gradle:29,52][native-gradle], pinned AAR, [Android source configuration][config]; evidence `bundle-config.txt`, `bundle-elf-alignment.json`.

### H3 — Unnecessary permissions remain in the production manifest

The generated app manifest declares `SYSTEM_ALERT_WINDOW`; there is no product overlay feature or request flow. It also declares legacy external-storage permissions even though manual imports use the system document picker and app-managed files use private directories. Biometric/fingerprint permissions arrive transitively despite no biometric prompt in the app; the install-referrer permission has no identified application caller.

**Impact:** excess privileges, confusing declared capabilities, avoidable review questions, and future accidental use. Presence of an unused declaration alone is not proof of malicious behavior.

**Fix:** remove the overlay permission from release through Expo configuration/plugin logic; remove legacy storage permissions after verifying supported Android versions and vendor transfer behavior. Review removal of unused biometric/referrer declarations and unexplained vibration. Add a release-manifest allowlist so dependencies cannot silently reintroduce them. Full inventory and caveats are in section 6.

**Files:** [app.config.ts][config], [generated manifest:2][generated-manifest], [document picker:5][picker], [native manifest][native-manifest].

### H4 — Scan/permission callbacks can escape native error containment

[PlaudSdkModule.kt:234–275][bridge-scan] dispatches `startScan()` and `stopScan()` on `main.post` without the guarded `dispatchSdk` path used by other operations. `isBluetoothOn()` reads adapter state outside that protection. A `SecurityException` or SDK runtime exception in those callbacks can escape Promise rejection handling. A destroyed module is checked before starting a scan, but not equivalently in every stop callback.

**Fix:** route these operations through the same guarded native dispatcher, recheck lifecycle/permission state at execution, and settle each promise once with a recoverable error. Verify permission denial/revocation, Bluetooth off/on, rapid start/stop, and activity destruction. This is a code-supported potential crash path; it was not reproduced on a physical device during this audit.

### H5 — Missing terminal SDK callbacks can leave transfer exclusion stuck

[PlaudRecorderActions.kt:57–82][actions] sets `bleExportPending=true` and clears it only through completion/error callbacks or a synchronous throw. `reset()` does not clear it. The JavaScript timeout cannot prove that the native exporter stopped. If the SDK never supplies a terminal callback, future transfers and controls can remain busy until the process restarts. Wi-Fi export needs the same cancellation/settlement review.

**Fix:** implement a vendor-supported abort/terminal-state handshake and a bounded recovery path. Do not merely clear the busy flag on a timer while an exporter may still be writing. Prove no concurrent writes and no cross-account late delivery after timeout, disconnect, unpair, or sign-out.

**Files:** [PlaudRecorderActions.kt][actions], [PlaudWifiTransfer.kt][wifi], [Plaud audio transfer][audio-transfer], sync controller.

### H6 — Account deletion does not yet cover all SDK/local retention, and completion is operational

[Backend deletion:109–185][deletion-service] erases Aptly service rows/files and waits for `providerEvidence`, `backupEvidence`, and `confirmedBy`. That is intentionally honest, but there is no vendor erasure API implementation or backup erasure worker in this code path. [Local cleanup:64–77][deletion-local] removes actor-owned library records; it does not address SDK log directories, unknown exporter leftovers, or vendor preferences. Completed deletion receipt rows have no defined purge deadline in the inspected service.

**Fix:** document a staffed process and evidence requirements for Plaud/backup requests, monitor overdue requests, decide minimal receipt retention, and implement account-safe cleanup for residual SDK data. Verify the promise of completion within seven days; do not mark requests complete based solely on successful Aptly database deletion.

This is not an assertion that Google requires instantaneous or fully automated deletion. Manual fulfillment can be valid; an unproven process must not be advertised as verified.

### H7 — Android dependency audit finds affected versions outside pnpm

The resolved Android dependency graph contains **Commons IO 2.6** and **Bouncy Castle 1.78.1**, with four advisory matches. See section 12 for exact CVEs, upstream references, and scope. These are not visible to `pnpm audit`.

**Fix:** evaluate affected call paths, introduce narrowly scoped compatible updates/constraints, and recheck the resolved graph and native SDK functions. Do not upgrade the entire stack indiscriminately. Current evidence establishes affected versions, not an exploitable path or an automatic Play rejection.

**Files:** [native Gradle:49][native-gradle], Expo filesystem/core transitive dependencies, Expo config plugin/build constraints and lockfile; evidence `android-dependencies.log`, `maven-components.json`, `maven-osv-results.json`.

### H8 — Android store packaging lacks the safeguards present in the iOS path

Root scripts provide `android:pilot`, which builds an APK, but no reproducible `android:store` AAB command or Android artifact-readiness validator. [app.config.ts:8][config] defaults to `pilot`; the store guard only activates when explicitly selected. The store readiness flags are consumed by the iOS process, not enforced by the ad hoc Android Gradle build used here.

**Fix:** add an explicit Android store command and artifact verifier: production origin, native mode, store channel, signing certificate, increasing version, no debug components, approved permission list, policy/reviewer evidence, dependency scan, and ELF compatibility. Preserve a distinct pilot build. Inspect the built package rather than trusting environment variables alone.

**Files:** [root package.json][root-package], [app.config.ts][config], [withPilotSigning.cjs][signing-plugin], [store-readiness.json][readiness], a future Android store script. This audit AAB is a diagnostic candidate, not a release approval.

### H9 — Vendor provenance and distribution support remain unresolved

[SDK_PROVENANCE.md][provenance] explains that the AAR was recovered from a public fork and hash-pinned. The checksum proves which bytes are used; it does not establish current Plaud support, a vendor signature, redistribution rights, or complete privacy behavior. The same document notes that the SDK binaries are proprietary.

**Fix:** obtain Plaud's confirmation of this release or a supported replacement, license/distribution terms, data-handling documentation, deletion procedure, permission rationale, and 16 KB support. Preserve that evidence and the binary hash in the release record. A fork alone is not evidence of malware or a policy violation, and none is alleged here.

## 4. MEDIUM / LOW Priority

### M1 — Make the public deletion request path explicit

[LegalPage.tsx:43][legal] primarily directs users back to the app, then offers support if they cannot sign in. A public email-based deletion request is allowed; a self-service web form is **not mandatory**. However, the page should prominently say that any user can request deletion without reinstalling or signing into the app, identify the app, state the scope/deadline, and provide a clearly labeled email action. Record who handles identity verification. Current `/privacy` and `/support` URLs returned HTTP 200, but a rendered browser flow and mailbox fulfillment were not tested. [Google deletion resource requirements](https://support.google.com/googleplay/android-developer/answer/13327111).

### M2 — Backup rules protect the app session but leave SDK preferences to investigate

The merged manifest uses Expo SecureStore's backup/extraction rules. These explicitly include shared preferences and exclude `SecureStore`. **Do not infer that all audio files are backed up simply because `allowBackup=true`: these rules restrict inclusion.**

The vendor has a `sdk_prefs` store with `saveSdkToken` and `saveApiToken`; its initializer reads these values and legacy authorization can write them. Whether the current per-user JWT path populates these keys requires runtime verification. The shared-preferences include rule does not exclude them. Exclude unnecessary vendor auth state from cloud/device migration and confirm logout/deletion behavior. No production preference value was read.

### M3 — Custom-scheme enrollment is less dependable than verified App Links

[parseEnrollmentInput:7–26][enrollment-link] validates token shape and route, rejects query tokens, but accepts an arbitrary host if the path is `/enroll`. Backend ownership/single-use checks are the actual security boundary. Another app can claim a custom scheme; this is not a proven account takeover because the token is user-bound.

Add an allowed-origin/scheme policy and verified HTTPS App Links with production signing fingerprints. Keep deliberate raw-token paste support. Test same-phone installation, expired/used links, copied invitations, a different signed-in user, and app-not-installed behavior. Do not place tokens in analytics, access logs, or query strings.

### M4 — Account recovery is incomplete for public users

[pilot-identity.ts][identity] implements registration/login/logout, but no self-service password reset or email verification flow was found. A user who forgets their password cannot perform password-confirmed in-app deletion without support. Provide a secure recovery/support process and verify email ownership before relying on email identity for privileged provisioning. Google does not generally mandate Cognito, OAuth, MFA, or a particular identity vendor.

### M5 — Residual import/export files need explicit cleanup

[recording-picker.native.ts:19–20][picker] leaves document-picker cache cleanup to the OS. Transcript imports also copy files to cache. Native transfer removes the successful known export file, but interrupted or unknown outputs can remain outside the managed library. Enumerate owned temporary paths and prune safely on startup and after operations. Do not promise that deleting a library entry removes copies in every temporary SDK directory until verified.

### M6 — Full Android lint is unavailable as a reliable gate

`:react-native-worklets:lintAnalyzeRelease` failed with a Kotlin analysis `Cannot find a KaModule for the VirtualFile` exception. Resolve or isolate the toolchain/dependency lint incompatibility and rerun the complete task. Do not label the app “lint clean” based on vital lint or disable checks merely to produce a green build.

### M7 — Distribution transition must preserve signing and local recordings

The current APK and audit AAB use the existing pilot certificate. Play's final app-signing certificate can differ from the upload certificate. Decide the migration before first distribution; a mismatched installed-app signature can require reinstalling and losing local-only recordings. Confirm the upload certificate and package in Console, and test an update over the pilot installation. [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756).

### L1 — Release size/optimization and licensing notices

The AAB is about 39.2 MiB. Minification/resource shrinking are off; improving this is optional, not a prerequisite to approval. [Native Gradle:21][native-gradle] excludes dependency LICENSE/NOTICE resources. Establish an appropriate consolidated third-party notices artifact, including codec/vendor licensing, before wider distribution. Do not blindly enable R8 around a reflective vendor SDK; validate keep rules and real hardware behavior.

### L2 — Release naming and platform expectations

The native app is named Aptly Able. Earlier AA FieldSense/TestFlight naming and the web demo are not proof of the Android listing's name. Choose a consistent truthful listing. Advertise only supported device models and currently shipped features. Cloud transcription, firmware updates, background syncing, maps/location tracking, and the demonstration dashboard must not be presented as completed store features.

## 5. VERIFIED PASSING

1. **Build identity:** package, version, min/target SDK, signing, and store/native configuration were inspected in the actual AAB. No replacement key was generated.
2. **No phone audio capture permission:** `RECORD_AUDIO` is absent; Expo audio configuration disables recording permission and background playback. This fits the hardware-recorder workflow.
3. **Visible recorder controls:** [PlaudRecorderControls.tsx:16–117][controls] shows idle/recording/paused states, waits for device confirmation, provides stop/pause controls, and asks for participant awareness before starting.
4. **Authenticated backend:** account/recording/enrollment operations use authenticated actor context. Custom pilot authentication is real authentication, not a mock bypass.
5. **Session handling:** random bearer credentials are hashed server-side, expire after seven days, and are stored through SecureStore on native devices. App-level logout/session invalidation and account-deletion lockout are covered by tests.
6. **Password storage:** scrypt, random salts, timing-safe comparison, and bounded expensive password operations are implemented.
7. **Account deletion is substantive:** it revokes account use, removes server data, preserves a recovery receipt, and reports pending external work honestly. Forty-four integration tests include deletion, identity, enrollment, ownership, and concurrency cases.
8. **Cloud generation scope:** [GenerationPanel.tsx:46–48][generation] hides cloud generation in store builds. Local Plaud synchronization goes through the local library; no automatic transcription upload is wired into that provider. Pilot cloud generation has explicit consent.
9. **No ads/billing/push integration found:** no source evidence that these declarations should be “yes” for the current feature set, subject to vendor confirmation.
10. **Network defaults:** production API is HTTPS; release manifest has no cleartext opt-in. The inspected SDK hostname verifier delegates to the platform default, not an always-true verifier.
11. **Component exposure:** no exported app service; file/clipboard providers are non-exported. AndroidX's exported profile installer receiver is protected by `android.permission.DUMP`.
12. **Secret scan:** no high-confidence AWS access keys, private-key blocks, or JWT literals found in tracked source. AAB did not package `.env`, `.p12`, `.pem`, or `.keystore` files. This is a targeted scan, not proof that every secret format is absent from all history/binaries.
13. **Live public endpoints:** privacy/support returned HTTP 200, API `/health/live` and `/health/ready` returned 200 with `status: ok`. These probes do not establish continuous uptime or a full authenticated workflow.

## 6. Complete Android Permission Inventory

The **AAB's manifest contains 22 permissions**, not merely the permissions listed in Expo config. Source attribution was checked against the release manifest-merger report.

Legend: **A** = generated app manifest; **P** = proprietary Plaud AAR; **K** = custom Plaud module manifest; **E** = Expo/AndroidX transitive library. “No separate declaration identified” does not replace the dynamic App Content questions shown for the actual Console upload.

| Permission | Declaration / runtime request | Purpose and sensitivity | Disclosure, denial behavior, and recommendation |
| --- | --- | --- | --- |
| `INTERNET` | A, P, filesystem; install-time normal | Account/API/SDK networking | Necessary; explain destinations in policy. Network failure should leave local playback available. No special permission declaration identified. |
| `MODIFY_AUDIO_SETTINGS` | A + Expo Audio; normal | Playback routing/audio focus | Retain for playback; not microphone capture. No runtime prompt or special declaration identified. |
| `READ_EXTERNAL_STORAGE`, max 32 | A + filesystem; no app runtime request found | Legacy broad read; dangerous on applicable older versions | Picker uses SAF, so no demonstrated need. **HIGH: remove after vendor/old-device verification.** No modern photo permission implied. |
| `SYSTEM_ALERT_WINDOW` | A; no special-access request found | Draw-over-apps special access | No overlay product feature or disclosure. **HIGH: remove from release.** Do not add an overlay prompt to justify an accidental permission. |
| `VIBRATE` | A; normal | Potential haptic feedback; no direct app vibration caller identified | Verify actual need; remove if unused. No runtime denial or special form identified. |
| `WRITE_EXTERNAL_STORAGE`, max 32 | A + filesystem; no app runtime request found | Legacy broad write; dangerous/effect varies by OS and target | App-private/SAF flow should not require it; ineffective for general writes on modern scoped-storage Android. **HIGH: remove after verification.** |
| `ACCESS_WIFI_STATE` | K + P; normal | Observe recorder Wi-Fi connectivity | Necessary for optional Wi-Fi flow; explain local recorder network. No separate form identified. |
| `CHANGE_WIFI_STATE` | K + P; normal | Recorder hotspot/connectivity operations | Vendor uses OS-mediated network operations; retain only proven requirements. OS restrictions still apply. |
| `NEARBY_WIFI_DEVICES`, `neverForLocation` | K; runtime request at bridge:392 on API 33+ | Nearby-device dangerous permission | Appropriate for optional Wi-Fi; denial should preserve BLE. Verify this physically and improve permission-specific recovery text. |
| `ACCESS_NETWORK_STATE` | P + dependencies; normal | Connectivity checks | Reasonable; no runtime consent dialog or separate form identified. |
| `WAKE_LOCK` | P + audio dependencies; normal | Maintain transfer/playback work | Verify acquisition/release and bounded use under background/abort conditions. Permission alone is not a background service. |
| `BLUETOOTH`, max 30 | P; included in pre-31 bridge gate | Legacy Bluetooth normal permission | Needed for older supported devices; denial effectively governed by Bluetooth state/location. |
| `BLUETOOTH_ADMIN`, max 30 | P; included in pre-31 gate | Legacy scan/configuration | Needed for older BLE path; maxSdk cap is appropriate. |
| `BLUETOOTH_SCAN`, `neverForLocation` | P; bridge:657 runtime request on API 31+ | Nearby-device dangerous permission | Needed for scan; Bluetooth explanation exists. Denial rejects pairing; local imports remain an alternative. Test no repeated prompt loop. |
| `BLUETOOTH_CONNECT` | P; same gate | Nearby-device dangerous permission | Needed for connection/device state. Revoke/off races need H4. |
| `ACCESS_FINE_LOCATION` | P, no max cap; both bridge API branches request it | Precise location dangerous permission | Current SDK checks it even on modern Android. **B1/H3:** minimize with vendor support or justify/disclose accurately. Approximate-only does not pass current gate. No background location requested. |
| `ACCESS_COARSE_LOCATION` | P, no max cap; same gate | Approximate location dangerous permission | Same disclosure problem. Do not declare GPS collection just because this permission exists; determine actual vendor use. |
| `CHANGE_NETWORK_STATE` | P; normal | SDK Wi-Fi transport/routing | Verify with vendor/traffic tests; no app prompt or dedicated declaration identified. |
| `USE_BIOMETRIC` | AndroidX Biometric through SecureStore; normal | Enables biometric prompt capability, not raw biometric access | App does not request authenticated SecureStore reads. No active biometric feature found; remove unused declaration if compatible. No biometric data collection evidenced. |
| `USE_FINGERPRINT` | Same dependency; legacy normal | Older biometric compatibility | Same review as above. Do not mislabel it as collecting fingerprints. |
| `com.aptlyable.mobile.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | AndroidX Core; signature permission | Restricts app-internal receiver access | Retain; protective infrastructure, not personal-data access. |
| `com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE` | Install Referrer 2.2, through Expo Application | Access to Play install attribution service | No `getInstallReferrer` call found in app source. Verify/removal candidate; permission does not prove attribution collection. |

**Explicitly absent:** `RECORD_AUDIO`, `CAMERA`, `ACCESS_BACKGROUND_LOCATION`, contacts, `READ_MEDIA_*`, `MANAGE_EXTERNAL_STORAGE`, `POST_NOTIFICATIONS`, phone-state/phone-number permissions, SMS/call logs, accessibility service binding, `QUERY_ALL_PACKAGES`, foreground-service permissions, package-install permission, and advertising-ID permission.

Consequently, there is no evidence that SMS/call-log, all-files, background location, accessibility, foreground-service, or photo/video broad-access declarations are needed for this build. Confirm the Console's actual form prompts. Android location/Bluetooth/Wi-Fi use still needs accurate disclosure and runtime permission handling. [Google sensitive permissions policy](https://support.google.com/googleplay/android-developer/answer/16558241?hl=en).

## 7. Audio, Recording, Files, and Background Behavior

| Stage | Inspected behavior | Remaining verification |
| --- | --- | --- |
| Capture | Plaud hardware microphone; app can send start/pause/resume/stop commands | Real NotePin S and Note Pro state transitions; visible hardware indicator; state after reconnect |
| Disclosure | Before-recording confirmation and privacy reminder; states that phone mic is unused | Ensure user can see actual device state, especially when recording began using the hardware button |
| Phone permission denial | No phone mic permission needed; BLE/nearby denial prevents recorder control | Deny/revoke each permission on real Android versions; retain local library access |
| Transfer | BLE or optional Wi-Fi; native exporter, then local managed library | Disconnect, hotspot loss, native callback loss, duplicate file delivery, low storage, large files |
| Local storage | Private app filesystem; metadata and downloaded/pinned audio; temporary cache management | SDK temp/log cleanup; filesystem remnants after process death; no claim of app-level encryption beyond platform protection |
| Import | SAF document picker, audio MIME filter; transcript file bounded to 2 MB before read | Provider returning stale/invalid URI, oversized media copy before validation, unsupported codec |
| Playback | Expo Audio; foreground playback configuration | Audio focus, wired/Bluetooth headset, interruptions, sleep/lock behavior |
| Transcription | Pilot path uploads only after consent; store generation UI hidden | Prove no hidden/background vendor audio upload in store release; verify final Data Safety scope |
| Local delete | Removes managed local library content | Original hardware recording, exported copy, and prior server copy are not deleted; UI notice correctly distinguishes them |
| Account delete | Server cleanup and actor-owned local record removal | H6: SDK files, provider cleanup, backups, receipt retention |

`PlaudSyncProvider.tsx:34–57` stops admitting synchronization when the app is backgrounded and restores eligibility on foreground. There is no foreground transfer service or Android recording service. Therefore the current product should promise **foreground transfer**, not reliable long-running background synchronization. Hardware can continue recording after the app disconnects; the notice explicitly says so.

If background transfer becomes a feature, design it separately around Android's applicable service type, lifecycle, user-visible notification, and permission rules. Do not add microphone foreground-service permissions for a phone that is not capturing microphone audio.

Native module destruction removes listeners, invalidates generations, closes Wi-Fi action state, and cancels its coroutine scope. It does **not** directly call SDK stop-scan/disconnect in `OnDestroy`; JavaScript cleanup attempts those operations separately. Validate that destruction/recreation cannot leave a scan, connection, exporter, or wake lock alive without its owning UI.

## 8. Privacy and Proposed Data Safety Inventory

This is a **draft inventory**, not a ready-to-submit form. The verified AAB uses the **store** profile, while the website pilot APK can expose additional cloud functions. Declare the behavior of every version distributed through the relevant Play tracks. Do not copy pilot claims or website analytics claims into the native form automatically.

Under Google's definitions, data processed solely on-device is different from data collected off-device. A transfer to a contracted processor may qualify for the service-provider exception to “sharing,” but that depends on the actual agreement and use. Do not equate that exception with “no collection.” [Google Data Safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).

| Data / suggested category | Verified flow and storage | Draft declaration / required confirmation |
| --- | --- | --- |
| Display name — Personal info / Name | Registration sends name to Aptly; `users.display_name` | Collected for account management/functionality. Confirm whether name must remain required. |
| Email — Personal info / Email address | Sent to Aptly login/registration; stored in `pilot_accounts` | Collected for account management/authentication. Not evidence of marketing use. |
| User IDs — Personal info / User IDs | Internal account UUID used for ownership and Plaud identity | Collected; sent to Plaud for authentication. Confirm processor terms and ID retention. |
| Password/authentication material | Password sent over HTTPS; scrypt stored server-side. Opaque session in SecureStore; Plaud JWT given to SDK | Document securely in policy/security inventory. Map to Console categories carefully; do not invent a separate “password” checkbox. Address SDK logs/preferences. |
| Recorder identifiers — Device or other IDs | Serial/model/assignment stored by Aptly; SDK device authentication involves Plaud; Bluetooth peer identifiers used locally | Collected for hardware functionality. Confirm all vendor device/phone identifiers and whether any persist independently. No phone IMEI/advertising-ID collection established. |
| Audio — Audio files / Voice or sound recordings | Captured by external device; transferred to local phone. Optional pilot upload goes to Aptly and Plaud | Store UI does not expose generation. Do not finalize “not collected” without SDK traffic verification. If any Play version enables upload, declare collection and optionality accurately. |
| Transcript, title, notes — Files/docs or Other user-generated content as appropriate | Local notes/imported transcript; pilot upload sends title/file details and stores generated transcript on backend | Local-only use is not automatically off-device collection. Cloud-enabled releases require corresponding declarations. Names or sensitive facts can occur inside audio/text without a dedicated form field. |
| Imported documents/files | User picks audio/transcript; no broad document ingestion feature in native store app | Local files by default. Verify any export destination is user initiated. |
| Photos/video | No camera/media picker flow; UI has bundled product images | No collection found; bundled art is not user photo data. |
| Location | Precise/coarse permission requested; no app-level location tracking or coordinate upload code found | **Unresolved SDK behavior.** Permission alone does not prove collection; inspect vendor traffic and fix disclosure. No background tracking feature implemented. |
| IP/network metadata | Network requests inherently expose source IP to API/provider infrastructure | Confirm reverse-proxy/AWS/Plaud logging and retention; assess whether location is derived. Do not assert “no server logs” from Fastify request logging being disabled. |
| App interactions / analytics | No first-party analytics integration found | Proposed no analytics collection from app source; vendor/referrer behavior still needs confirmation. |
| Diagnostics/crash information | Manual user-copyable sanitized diagnostics; vendor local rolling logs | No automatic first-party crash reporter. Confirm SDK log uploads and exactly what logs contain before declaring diagnostics collection/sharing. |
| Phone number / contacts | No input/storage/access implementation found in native app | Proposed not collected, subject to vendor verification. The corporate website collecting phone numbers is a separate surface. |
| Financial/payment information | No purchase/payment flow found | Proposed not collected by this app. |
| Health/sensitive conversation content | No health product feature or structured health intake | Recordings can contain sensitive content. Avoid claiming clinical/medical functionality or regulatory certification. |

### Exact policy/content changes to prepare, without publishing during this audit

1. Expand the “Your account and recorder” paragraph to describe **Android** permission behavior by OS version and why the SDK requests it. Do not say location is never used/transmitted until vendor behavior is verified.
2. Identify the mobile app explicitly in the public policy: Aptly Able, publisher Aptly Able, LLC; align the name with the actual listing.
3. Describe the account/serial information shared with Plaud for pairing separately from optional audio transcription. State which features are disabled in this release.
4. Explain local library, temporary import/export files, optional retained audio, and any remaining vendor diagnostic logs. Give actual retention limits after decisions are confirmed.
5. Explain Aptly server storage, Plaud processing, and backups. Do not claim S3, end-to-end encryption, or provider erasure automation that has not been implemented/verified.
6. Preserve the seven-day promise only with an operational process that can meet it. Describe justified residual deletion receipts and their retention, if retained.
7. Give a prominent external account-deletion request route usable without installing the app; identify what remains on the physical recorder or in user exports.
8. Separate corporate website analytics from native app analytics. The public corporate page currently names website analytics products; source review did not find those native SDKs.

The current app notice already usefully covers participant awareness, local-vs-cloud deletion, optional transcription, and local imports surviving sign-out. Preserve those distinctions while correcting the gaps.

## 9. Account Creation and Deletion: End-to-End Trace

**Creation:** mobile account UI → auth client → HTTP registration route → `createPilotIdentity.register` → password hashing → `users`, `pilot_accounts`, and hashed `pilot_sessions` transaction.

**In-app deletion:** Settings → Delete account → password plus `DELETE` confirmation → durable recovery state → authenticated deletion request → receipt/status UI → session lockout → server worker + local cleanup. The workflow can recover if the deletion request succeeded but its HTTP response was lost.

**Backend effects:**

1. Verify the active account/session and password; reject another user's request.
2. Record deletion request, seven-day due date, and provider cleanup scope; revoke account sessions.
3. Worker locks the account and removes managed server audio **before** deleting references.
4. Delete associated processing, upload, setup, enrollment, assignment, audit, account, and user rows.
5. Keep status pending until provider and backup evidence is supplied. Clear provider scope after evidence; record completion.

**What still remains or needs decisions:** physical-recorder originals, exported files, unscoped manual imports, vendor logs/temp/preferences, recorder catalog entries, minimal deletion receipts/evidence, provider-side data, backups and restored backups. Some retention may be legitimate; document its purpose and deadline rather than making an absolute “everything erased” claim.

**External request:** public support contains a support email and an account-deletion help instruction, but the wording and fulfillment need M1/H6. A working email route can satisfy the policy; adding a full web deletion API is an implementation choice, not a Google mandate.

**Verification actually run:** account-deletion integration tests cover reauthentication, concurrent requests, lost responses, session lockout, ownership isolation, file deletion failures/retry, provider-work races, missing evidence, pending/completed status, and receipt recovery. They use disposable schemas in local PostgreSQL. No real user account or Plaud record was deleted during this audit.

## 10. Authentication, Network, Secrets, and Native Bridge Security

| Area | Assessment |
| --- | --- |
| Login/registration | Real server validation, generic auth failures, password hashing; HTTP auth routes have bounded request throttling. Public recovery/verification remains M4. |
| Session tokens | 32 random bytes, server-side SHA-256 token hashes, seven-day expiry, explicit logout. No OAuth refresh-token flow; expiry requires sign-in. |
| Android secure storage | Expo SecureStore uses Android-backed secure storage; the `WHEN_UNLOCKED_THIS_DEVICE_ONLY` option is iOS-specific and must not be described as an Android hardware-attestation guarantee. |
| Plaud credentials | Partner secrets stay in backend configuration; per-user SDK JWT is delivered to the phone. Phone-delivered tokens are not app-wide secret keys. SDK logging remains H1. |
| Secret scan | Targeted tracked-file scan found no private-key blocks, AWS access keys, or JWT literals; no keystore/env files in the AAB. Development examples/test fixtures are not production credentials. No full repository-history or exhaustive proprietary-binary secret audit performed. |
| Production endpoint | AAB contains `https://api.plaud.aptlyable.info`; embedded Expo extra confirms store/native. Localhost fallbacks in source are not proof that this specific artifact calls localhost. |
| HTTPS | Shared API clients enforce HTTPS outside explicit development origin configuration; final manifest does not enable cleartext. No app-level trust-all TLS code found. |
| SDK TLS | Inspected partner client uses OkHttp; legacy vendor `HttpPost` hostname verifier delegates to the default verifier. Vendor trust stores do not by themselves prove a validation bypass. Complete runtime endpoint/certificate testing remains open. |
| Recorder Wi-Fi | Local WebSocket network code exists in vendor SDK, along with audio cryptography. No evidence sufficient to assert end-to-end protection of all LAN traffic/control frames; validate listener binding, peer authorization, teardown, and encrypted payload scope. |
| Server logging | First-party Fastify request logging disabled; sanitized error paths. Does not prove reverse proxy, AWS, or Plaud logging is disabled. |
| Exported components | MainActivity exported for launcher/deep links; file providers non-exported with explicit URI grants; profile receiver protected by DUMP. No exported privileged custom service or WebView JavaScript interface found. |
| Native function access | Kotlin module available to the bundled React Native runtime, not directly as a public JavaScript interface to arbitrary web pages. Validate inputs and lifecycle regardless. |
| Deep links | Enrollment capability still needs authenticated account/ownership; custom-scheme collision and origin validation are M3. |
| Debug artifacts | Release manifest not debuggable; Expo Updates disabled; store UI gates hide unfinished cloud/firmware controls. Dev-client package presence or a development string alone does not prove an active release developer menu. |

## 11. Third-Party SDK Inventory

| Library/integration | Initialization and data capability | Release conclusion |
| --- | --- | --- |
| Plaud / embedded Tinnotech | Initialized for assigned-recorder setup; BLE IDs/status, account token, device auth, Wi-Fi/file export; HTTP and file logging | Highest diligence priority: H1/H2/H6/H9; obtain supported binary and data-handling evidence |
| Expo Application / Install Referrer | Native module available; app reads build/application metadata; no install-referrer caller found | Do not infer marketing collection from library presence; remove unused capability if appropriate |
| Expo SecureStore / AndroidX Biometric | Stores account/deletion recovery state; biometric capability transitive | Appropriate app token storage; review vendor preferences separately; unused biometric permissions |
| Expo Filesystem / DocumentPicker / Sharing | User-selected local files, caches, managed library, user-initiated exports | No blanket storage permission necessary for SAF; audit temp retention and native dependency advisories |
| Expo Audio | Audio playback; phone recording disabled | Confirm audio focus/background behavior, not a phone recording service |
| Expo Clipboard | Copies invitation/diagnostics only through user actions found in source | Clipboard content can leave app context; do not put secret diagnostics there |
| Expo Updates / Dev Client | Development dependencies/modules; updates disabled in inspected release | Assert final artifact behavior in Android store verification rather than deleting tooling indiscriminately |
| Retrofit / OkHttp / Gson / Conscrypt | Vendor HTTPS/API serialization and TLS; local/network requests when SDK used | Conscrypt native alignment failure; vendor network logging issue; inspect complete endpoints |
| Java-WebSocket | Vendor local Wi-Fi transfer server | Verify peer authentication and teardown; no public-service assumption solely from library presence |
| Bouncy Castle | Vendor audio-decryption primitives | Known affected version; see CVEs and reachability caveats |
| Timber / SLF4J / Logback Android | Vendor automatic local logging | Active logging, bounded but sizable disk retention; H1 |
| Guava / coroutines / AndroidX / RN | Runtime, threading, UI, scheduling | No independent first-party analytics collector identified; still scan resolved dependencies |
| Plaud transcription API | Backend requests for explicitly consented pilot cloud jobs | Store UI currently hides this feature; processor/privacy/erasure terms still relevant to any enabled release |

No source integration with Firebase, Google Analytics, Crashlytics, Sentry, Meta, ad networks, Stripe, Play Billing, or FCM was identified. This is a source/dependency observation, not a guarantee about undocumented vendor-server processing.

## 12. Dependency Findings

`pnpm audit --prod --json`: **zero** known advisories at audit time. Separately, the resolved release Maven graph yielded 230 identifiable component/version pairs, queried against OSV. The proprietary AAR is not covered by that advisory lookup.

| Resolved dependency | Advisory match | Affected function / evidence | Recommended scope |
| --- | --- | --- | --- |
| Commons IO 2.6 | CVE-2024-47554 / GHSA-78wr-2p64-hpwj | XML stream reader resource consumption; upstream fixes at 2.14.0+ | Constrain to a supported Android-compatible fixed version; test Expo file operations. [Apache security report](https://commons.apache.org/proper/commons-io/security.html) |
| Commons IO 2.6 | CVE-2021-29425 / GHSA-gwrp-pvrq-jmwv | Filename normalization/path validation; fixed at 2.7 | Covered by an appropriately verified newer version; do not claim the app has an exploitable traversal without a reachable vulnerable call. [Apache fix history](https://commons.apache.org/proper/commons-io/changes.html) |
| Bouncy Castle 1.78.1 | CVE-2025-14813 / GHSA-574f-3g2m-x479 | GOST CTR counter/keystream issue; vendor lists patched release branches | App's declared use is ChaCha20; GOST usage not established. Use a supported version that also addresses the next row. [Vendor advisory](https://github.com/bcgit/bc-java/wiki/CVE%E2%80%902025%E2%80%9014813) |
| Bouncy Castle 1.78.1 | CVE-2026-0636 / GHSA-c3fc-8qff-9hwx | LDAP injection; vendor lists fixed branches 1.80.2, 1.81.1, and 1.84 | LDAP certificate-store usage not found in app source; assess packaged reachability and test cryptographic compatibility before updating. [Vendor advisory](https://github.com/bcgit/bc-java/wiki/CVE%E2%80%902026%E2%80%900636) |

Commons IO comes through Expo core/filesystem; Bouncy Castle is explicitly pinned in the custom module. Severity labels vary by advisory provider; this report prioritizes eliminating known affected dependencies but does not turn version matches into demonstrated exploits. No blanket claim that all native dependencies are safe, abandoned, or current is made.

## 13. Crash, Lifecycle, and Failure-Path Matrix

| Scenario | Code protection found | What prevents a full PASS |
| --- | --- | --- |
| Startup/session restoration | Error boundary/session restoration, font-error fallback, durable local metadata | Cold start and Android recreation not exercised with final store AAB |
| Sign-in/server unavailable | Async auth, sanitized failures, server timeouts/rate limiting | Manual UI recovery, keyboard/back navigation, account recovery |
| Expired login | Guarded fetch and expiry check on foreground | Long-running transfer + expiry + re-login on real device |
| Permission denied | Pairing Promise rejection; manual local-library path remains | Exact/approximate location mismatch; repeat-denial UX and H4 |
| Permission revoked/Bluetooth off | State/timeouts and generation guards | Unguarded scan/adapter calls; physical revocation test |
| Transfer timeout/disconnect | JS deadlines, actor/generation checks, native exclusion | Native terminal-callback loss can leave exclusion stuck, H5 |
| Upload failure | Pilot consent, bounded upload processing/retry and status | Store feature hidden; no real vendor upload exercised |
| Background/foreground | Foreground sync eligibility updates | Native in-flight operation behavior and OEM process termination |
| Native module destruction | Listener detach, coroutine cancellation, generation invalidation | No explicit native stop-scan/disconnect in OnDestroy |
| Process death/low storage | Atomic managed-file metadata/recovery mechanisms | SDK temp exports/logs/picker copies outside the library; real storage failure |
| Rotation/large screen | Portrait configuration and RN activity handling | Target-36 tablets/resizing/font scale/accessibility need device validation |
| Unpair/account switch | Shared controller cleanup and actor checks; server assignment release | Verify SDK binding/late callbacks on physical Android, not only mocks |
| Camera/phone microphone failure | Features not implemented/requested | Not applicable to this release; external recorder capture is separate |

No Android unit test sources exist for `:app:testReleaseUnitTest`; Gradle reported **NO-SOURCE**. The 477 shared tests are useful but are not native hardware or lifecycle tests. No release AAB was installed over anyone's phone during this audit.

## 14. Google Play Policy Coverage and Reviewer Access

| Policy area | Assessment for current source/artifact |
| --- | --- |
| User Data / permissions / Data Safety | B1/B2 and H1/H3/H6 prevent sign-off. No filled Console form inspected. |
| Account deletion | Substantive in-app/backend flow exists; public email pathway needs clarification and operational proof. |
| Device/network abuse | No auto-install, accessibility takeover, remote executable update, or abuse feature found. Vendor network/permissions still need review. |
| Malware | No malicious application behavior identified. Static inspection and advisory scanning are not malware certification. |
| Deceptive behavior / metadata | Do not market the web demo, future tracking, firmware updates, or hidden cloud features as available store functionality. Explain external hardware dependency. |
| Impersonation / intellectual property | Aptly branding exists; ownership/trademark authorization, Plaud product imagery, proprietary SDK rights, and codec notices require owner confirmation. |
| User-generated content | Private personal recording library; no public feed, comments, or user-to-user hosting flow found. Public UGC moderation/blocking mechanics are not presently evidenced as necessary. Reassess if sharing/community features are added. |
| Families | Business/productivity use suggested; no child-directed flow found. Actual target audience is a publisher decision, not proven by source. Do not declare children without evaluating SDK suitability. |
| Financial services | No financial product/payment feature found. Answer the Console declaration accurately; recordings about finances do not automatically make this a financial-services app. |
| Health | No health or medical functionality found. Avoid medical claims; complete any applicable Console health declaration honestly. |
| AI-generated content | Cloud generation hidden in store profile; transcription/productivity is not automatically an unrestricted generative chatbot. Reassess before enabling reports/chat or other generative functions. [Google AI scope guidance](https://support.google.com/googleplay/android-developer/answer/14094294?hl=en) |
| Billing/subscriptions | No in-app sale, purchase link, digital entitlement purchase, or billing SDK found. Play Billing implementation is not needed merely because a backend exists. Any future paid transcription/AI credits require a separate payments-policy review. |
| Ads | No ads integration/AD_ID permission found. Confirm vendor behavior and declare accurately. |

### Recommended App Access instructions to prepare

Supply the actual reviewer email/password privately in Play Console, not in this repository/report. Keep the account usable without a personal OTP, expiring invitation, location restriction, or manual approval during review. Do not add an authentication bypass for reviewers.

Proposed instruction text, to finalize after testing:

> Aptly Able is a companion for supported Plaud recorders and a local audio library. Sign in using the review credentials provided in App Access. The Recordings tab supports importing a supplied non-sensitive audio file, playback, titles, notes, transcript import, exporting, and local deletion. Settings includes the privacy notice, support, and account deletion.
>
> Hardware pairing and new recorder transfers require a physical Plaud NotePin S or Note Pro that is available for binding to the review account. Bluetooth must be enabled; explain the final permission requirements here. Provide the tested enrollment method and a repeatable assignment setup. The hardware captures audio; the app does not record the phone microphone.
>
> Cloud transcription and firmware update controls are not part of this store release. The physical recorder can continue recording when the phone disconnects. Use Stop & save or the hardware control to finish recording.

**Still required:** establish how Google can examine the hardware-dependent portion. Supply clear device requirements, support contact, and a walkthrough video as supplementary evidence where useful; do not assume a video or fake simulator mode substitutes for access. Provide a reset/replacement process for one-time enrollment and a separate disposable deletion-test account. Do not let deletion of one reviewer account make all later review attempts impossible.

No app-specific geographic allowlist was identified in source. Account permissions, Plaud regional service support, infrastructure filtering, and Console country availability still require confirmation. No AWS security rules were changed.

## 15. Play Console Manual Checklist — Separate From Code Findings

All items below remain **unverified in Console** unless explicitly stated otherwise.

- [ ] Confirm publisher account identity, organization/personal type, verification, authorized account access, and ownership of `com.aptlyable.mobile`.
- [ ] Confirm the listing name: native source currently says Aptly Able. Match app/policy/publisher identity; resolve any AA FieldSense naming intentionally.
- [ ] Choose app category (Business or Productivity are plausible choices, not an audited Console value), countries, free/paid status, and distribution audience.
- [ ] Complete name (30-character limit), short description (80), and full description (4,000) with truthful hardware-dependent capabilities. [Listing setup](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en).
- [ ] Prepare the Play icon, feature graphic, and actual release phone screenshots. Repository app icon exists, but no approved Google Play listing asset set was established. Check tablet/other-form-factor requirements for intended availability. [Preview assets](https://support.google.com/googleplay/android-developer/answer/9866151).
- [ ] Verify monitored support email `info@aptlyable.com` and public support page; mailbox ownership/response was not tested.
- [ ] Publish/approve app-specific privacy content and choose the actual Privacy Policy URL. Test accessibility without sign-in, redirects, or geographic blocks.
- [ ] Provide a prominent functional account-deletion URL with request steps, scope, identity verification and seven-day turnaround; verify email/form fulfillment.
- [ ] Complete Data Safety using section 8, including vendor processing, encryption-in-transit evidence, collection optionality, purpose, sharing exceptions, and deletion.
- [ ] Provide App Access credentials and hardware setup instructions; exercise the exact reviewer path on the Play-distributed build.
- [ ] Complete IARC content rating, target audience, Ads, financial/health/other content declarations actually presented by Console. Do not select categories merely because they appear in this audit.
- [ ] Review permission declaration prompts against the final merged manifest. No sensitive-permission form should be invented for a permission the app does not have.
- [ ] Confirm Play App Signing enrollment, upload certificate, final app-signing certificate, backup/recovery ownership, and update compatibility with the pilot APK.
- [ ] Confirm version code 7 has not already been consumed; use a higher code for the eventual new release when appropriate.
- [ ] Review AAB processing, SDK warnings, device exclusions, API target, native 16 KB warnings, and final generated APKs in App Bundle Explorer.
- [ ] Confirm whether production access testing applies. For personal accounts created after November 13, 2023, current guidance requires at least 12 closed testers opted in continuously for 14 days before applying for production access. Do not assume that requirement applies identically to an organization account. [Testing eligibility](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).
- [ ] Run internal/closed testing and review Play's pre-launch report; supplement with real Plaud hardware and 16 KB testing.
- [ ] Record release notes, supported devices/Android versions, staged rollout plan, backend availability monitoring, rollback approach, and deletion/support staffing.
- [ ] Do not upload or promote this diagnostic AAB merely because it builds. Resolve release gates and regenerate a verified candidate.

## 16. Commands Run and Evidence

| Check | Result |
| --- | --- |
| `pnpm check` | PASS: typechecks, ESLint/import boundaries, 477 tests in 48 files, 8 release tests, shared/API/admin builds |
| `TEST_DATABASE_URL=<local disposable-schema database> pnpm test:integration` | PASS: 44 tests in 8 files; local PostgreSQL on 127.0.0.1:55432; no production DB use |
| `pnpm audit --prod --json` | PASS: zero known JS production advisories at query time |
| Gradle `:app:bundleRelease :app:lintRelease :app:testReleaseUnitTest -PreactNativeArchitectures=arm64-v8a --no-daemon --max-workers=2` | FAIL: `react-native-worklets:lintAnalyzeRelease` tooling exception; not a successful full-lint run |
| Gradle `:app:bundleRelease :app:testReleaseUnitTest -PreactNativeArchitectures=arm64-v8a --no-daemon --max-workers=2` | PASS: normal release vital lint/build/signing, 800 tasks; native unit test task NO-SOURCE |
| `bundletool 1.18.3 validate --bundle=...` | PASS structural validation |
| `bundletool dump manifest` / `dump config` | Inspected identity, SDKs, permissions, components, native ZIP alignment setting |
| `jarsigner -verify ...` | PASS signature integrity. Self-signed certificate/no timestamp warnings are expected for this Android signing context, not proof of a bad debug certificate. |
| ELF inspection of AAB libraries | FAIL LOAD alignment for two libraries; 24 RELRO results require investigation/16 KB runtime verification |
| Gradle release runtime dependency graph + OSV batch query | Four advisory matches across two of 230 identified Maven component/version pairs |
| Pinned AAR inspection | Manifest, classes via `javap`, logging config, network/permission/persistence paths, native library alignment |
| Tracked source / packaged file secret scans | No targeted high-confidence secret matches or private key/env files packaged; limitations in section 10 |
| Public HTTP probes | Privacy/support 200; API live/ready 200. An initial `/health` probe used a nonexistent route; actual configured health routes succeeded. |

Audit build environment explicitly selected:

```text
APTLY_ANDROID_PREVIEW=0
APTLY_RELEASE_CHANNEL=store
APTLY_PRODUCTION_API_ORIGIN=https://api.plaud.aptlyable.info
EXPO_PUBLIC_API_URL=https://api.plaud.aptlyable.info
EXPO_PUBLIC_AUTH_MODE=pilot
EXPO_PUBLIC_RECORDER_MODE=native
EXPO_NO_DOTENV=1
NODE_ENV=production
JAVA_HOME=<installed JDK 21>
ANDROID_HOME=<repository .local/android-sdk>
```

Signing variables were populated from the existing private signing files without printing passwords. No prebuild regeneration, replacement signing key, upload, release, or remediation was performed. Existing generated native configuration was inspected and built.

**AAB:** [app-release.aab][aab], **41,114,449 bytes**.
SHA-256: `dd827328ee73f7e927a7abadd57d8ff437166bebec00bc936401a6c6a771d833`.

**Evidence directory:** [local audit evidence][evidence]. Logs and binary-inspection outputs are ignored build evidence, not intended as public downloads. The build output path may be overwritten by later builds; the digest identifies the audited artifact.

## 17. Numbered Remediation Plan

Do not implement this plan until approved. Each item is a separate reviewable change; avoid mixing permissions, SDK replacement, and unrelated UI work into one large patch.

1. **HIGH — Confirm the supported Plaud Android release.** Files: [SDK provenance][provenance], [artifact manifest][artifacts], [native Gradle][native-gradle]. Obtain vendor-supported binary/license/privacy details and fixes for logging, permissions, and native alignment. Reason: several findings originate inside the binary. Verify checksum, published dependency list, supported models, and device-level behavior; preserve old binary for controlled rollback.
2. **HIGH — Disable/redact SDK logging and define residual cleanup.** Files: [bridge initialization][bridge-init], [account cleanup][deletion-local], SDK configuration. Remove sensitive header/body logging using supported controls, bound harmless logs, and cover old logs/temp data in cleanup. Verify by inspecting release Logcat/app-private files during pairing, failure, transfer, logout, and deletion; redact the evidence itself.
3. **BLOCKER/HIGH — Correct Android permission scope and disclosure.** Files: [app config][config], [native manifest][native-manifest], [permission helper][permissions], setup UI, [shared notice][notice]. Remove overlay and proven-unused permissions; align SDK/bridge location requirements; implement honest just-in-time explanation and recovery. Verify the **AAB** permission allowlist plus deny/approximate/precise/revoke cases on API 24/30/31/33/36 as applicable.
4. **HIGH — Repair native alignment and affected dependencies.** Files: [native Gradle][native-gradle], vendor AAR, Expo-generated build configuration via source plugins. Replace/rebuild 4 KB prebuilts; resolve RELRO findings; narrowly constrain Commons IO and compatible fixed Bouncy Castle. Verify resolved Maven scan, ELF/ZIP checks on AAB-derived APKs, and real 16 KB launch/pair/export/playback. Do not treat a ZIP-only check as sufficient.
5. **HIGH — Contain all native scan exceptions.** File: [PlaudSdkModule.kt][bridge-scan]. Reuse guarded SDK dispatch, lifecycle checks, and once-only settlement around scan/adapter operations. Verify rapid actions, permission loss, Bluetooth off/on, app background/recreation, and callback races with focused native tests plus devices.
6. **HIGH — Add safe terminal recovery for transfers.** Files: [PlaudRecorderActions][actions], [PlaudWifiTransfer][wifi], [audio transfer][audio-transfer], sync controller. Negotiate SDK abort/terminal behavior; reconcile busy state and files only after native work is known stopped. Verify lost terminal callback, Wi-Fi failure, sign-out mid-transfer, retry, and account-switch isolation.
7. **HIGH — Complete deletion operations and data retention.** Files: [deletion service][deletion-service], [operator command][operator], [local deletion][deletion-local], [shared notice][notice], operational documentation. Define provider/backup process, overdue alerting, receipt retention, SDK/temp cleanup and restore-time suppression. Verify a disposable real account end to end within the promised deadline; retain evidence without retaining deleted content.
8. **BLOCKER — Approve the app-specific privacy/Data Safety inventory.** Files: [product content][notice], [public legal page][legal], [readiness flags][readiness]; corporate policy publishing location is outside this repository. Reconcile actual vendor/first-party traffic and retention. Verify public accessibility, final displayed text, vendor contracts, and a reviewed Console form; set flags only after evidence exists.
9. **MEDIUM — Make external deletion and account recovery straightforward.** Files: [LegalPage][legal], [SupportScreen][support], auth routes/identity and account UI. Add explicit uninstall-independent email/form deletion instructions and monitored identity verification; design secure password recovery. Verify from a signed-out browser and a user who has forgotten their password.
10. **HIGH — Create a repeatable Android store build/verification path.** Files: [root package][root-package], [config][config], [signing plugin][signing-plugin], readiness data, new Android store/verification scripts. Enforce channel/origin/mode/signing/manifest/dependency/native checks and evidence gates. Verify failure for wrong origin, pilot/mock/dev configuration, unexpected permission, bad alignment, and missing release evidence; never create replacement production keys automatically.
11. **MEDIUM — Improve enrollment links and Android lifecycle coverage.** Files: [enrollment parser][enrollment-link], app linking plugin/config, web enrollment installer, [bridge][bridge-scan], temporary-file services. Add verified App Links and safe-origin validation; explicit orphan cleanup and lifecycle recovery. Verify fresh install, same-phone link, expired invitation, another account, process death, rotation/resizing, low storage, and foreground-only transfer messaging.
12. **HIGH — Prove reviewer and real-device workflows.** Files: review/runbook documents and [readiness flags][readiness]; actual account/hardware provisioning is operational. Prepare stable review credentials, disposable deletion account, sample recording, hardware access instructions, supported-device list and troubleshooting. Verify NotePin S and Note Pro with the final Play-distributed candidate; include Android 12+ permissions and 16 KB testing. Mock/emulator results alone do not close this item.
13. **MEDIUM — Complete Console and signing migration.** Scope: section 15, supported-device matrix, listing assets, release checklist. Confirm upload/app-signing identities, existing-pilot update preservation, version-code availability, testing eligibility, declarations and pre-launch results. Verify on the intended release track before production promotion.
14. **LOW — Polish optimization and licensing documentation.** Files: [native Gradle][native-gradle], third-party notices, listing assets and product language. Consolidate required notices; optionally enable validated shrinking; align app/brand naming. Verify artifact size, codec/SDK function, and no misleading feature claims.

## 18. If I Submitted This Application to Google Play Today, What Could Prevent Approval?

**The build itself is not the main obstacle: a signed, structurally valid AAB exists.**

The specific risks are:

1. Android requests sensitive location access that the app's current explanation does not accurately describe; the release also declares unnecessary overlay/storage capabilities.
2. The designated corporate privacy policy is not sufficient by itself to describe the mobile recorder/SDK workflow, and the final Data Safety answers cannot be verified without reconciling Plaud behavior, logging, and processing.
3. A reviewer may be unable to exercise the core pairing workflow without stable credentials, a usable assignment/enrollment, and a hardware-access plan.
4. Account deletion could fail policy expectations if the published external path is unclear or provider/backup cleanup is not actually fulfilled within the promised period. The in-app backend path exists; external completion is the unresolved part.
5. Native 16 KB compatibility checks fail for bundled libraries. The retrieved policy distinguishes its February 2027 update enforcement date; confirm this new app's Console handling rather than inventing an immediate deadline. Device compatibility remains a real release defect.
6. Real-device crashes or stalled transfers in the identified native failure paths could make the reviewed app unusable. Those paths require reproduction/verification, not an assumption that the shared unit suite proves hardware stability.
7. Uncompleted Console declarations, account eligibility/testing requirements, package/signing mismatch, or a reused version code could prevent submission. These are unverified Console conditions, not established failures.

Resolve the confirmed permission/privacy problems and SDK/native release risks first, then prove hardware behavior and complete the Console submission record. Nothing was deployed or submitted during this audit.

[config]: /Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/app.config.ts:8
[release]: /Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/release.json
[mobile-package]: /Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/package.json
[root-package]: /Users/zacharyzink/AptlyAble/aptly-able-app/package.json:11
[native-gradle]: /Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/modules/plaud-sdk/android/build.gradle:18
[generated-manifest]: /Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/android/app/src/main/AndroidManifest.xml:2
[native-manifest]: /Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/modules/plaud-sdk/android/src/main/AndroidManifest.xml:1
[permissions]: /Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/modules/plaud-sdk/android/src/main/java/expo/modules/plaudsdk/PlaudSdkModule.kt:657
[bridge-init]: /Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/modules/plaud-sdk/android/src/main/java/expo/modules/plaudsdk/PlaudSdkModule.kt:190
[bridge-scan]: /Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/modules/plaud-sdk/android/src/main/java/expo/modules/plaudsdk/PlaudSdkModule.kt:234
[actions]: /Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/modules/plaud-sdk/android/src/main/java/expo/modules/plaudsdk/PlaudRecorderActions.kt:57
[wifi]: /Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/modules/plaud-sdk/android/src/main/java/expo/modules/plaudsdk/PlaudWifiTransfer.kt:1
[provenance]: /Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/modules/plaud-sdk/android/libs/SDK_PROVENANCE.md:3
[artifacts]: /Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/modules/plaud-sdk/sdk-artifacts.json
[notice]: /Users/zacharyzink/AptlyAble/aptly-able-app/packages/product-content/src/index.ts:14
[readiness]: /Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/store-readiness.json:1
[signing-plugin]: /Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/plugins/withPilotSigning.cjs:1
[picker]: /Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/services/recording-picker.native.ts:5
[deletion-service]: /Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/modules/account-deletion/service.ts:109
[deletion-local]: /Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/privacy/account-deletion.ts:64
[operator]: /Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/bootstrap/account-deletion-operator.ts:1
[identity]: /Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/modules/identity/pilot-identity.ts:29
[enrollment-link]: /Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/enrollment/enrollment-link.ts:7
[legal]: /Users/zacharyzink/AptlyAble/aptly-able-app/apps/admin/src/features/legal/LegalPage.tsx:43
[support]: /Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/privacy/SupportScreen.tsx:27
[generation]: /Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/transcription/GenerationPanel.tsx:46
[controls]: /Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/plaud-device/PlaudRecorderControls.tsx:16
[audio-transfer]: /Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/plaud-device/plaud-audio-transfer.ts:1
[aab]: /Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/android/app/build/outputs/bundle/release/app-release.aab
[evidence]: /Users/zacharyzink/AptlyAble/aptly-able-app/.local/play-store-audit-2026-09-15
