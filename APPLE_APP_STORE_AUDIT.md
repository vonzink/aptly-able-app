# Apple App Store Compliance & Submission Readiness Audit

Audit date: September 15, 2026. Repository: `/Users/zacharyzink/AptlyAble/aptly-able-app`.
Baseline: `main`, `f968a4a0dd70fb1d88d3319e461f895173474f67`, **including the existing uncommitted cleanup**. This is an audit, not a release approval or legal opinion.

## Executive Summary

**Overall readiness: NOT READY.**

Aptly Able is a real native hardware companion with useful recording, playback, notes and device-management functionality. It is not simply a website wrapper. Its current condition is suitable for continued supervised pilot development, but it is not a complete App Store submission.

The clearest blockers are missing in-app privacy information, missing account deletion, missing SDK privacy packaging, and visible unfinished functionality. The available signed archive is a development build. A new unsigned build attempted during this audit did not complete, so the recent source cleanup has not been established as a working release binary.

### Scope and evidence standard

- **CONFIRMED:** directly observed in current source, configuration, binary contents or a read-only endpoint response.
- **LIKELY:** evidence supports the risk, but the exact reviewer outcome or runtime behavior is not proven.
- **POSSIBLE:** plausible concern requiring additional evidence; not a demonstrated violation.
- **MANUAL VERIFICATION REQUIRED:** requires a physical device, vendor answer, legal/business determination, signing validation or App Store Connect access.
- **PASS** means only that the inspected behavior satisfies the stated check. It does not certify the entire app. Other statuses are **WARNING**, **FAIL**, **NOT APPLICABLE**, and **NEEDS MANUAL VERIFICATION**.

Three different artifacts must not be conflated:

1. **Current source:** includes uncommitted reliability work and new diagnostic dependencies.
2. **Existing signed archive:** `.local/remote-pilot/ios/AptlyAble-2026-09-15T02-51-19-380Z.xcarchive`, version **0.1.0 (5)**, SDK `iphoneos26.5`, development entitlement `get-task-allow=true`. Its metadata says `testFlightReady:false` and hardware acceptance pending. It predates the latest cleanup.
3. **This audit's unsigned build attempt:** separate `.local/apple-audit-derived` output; no finished app or submission package was established.

App Store Connect, private production data, physical recorder behavior, packet captures, contractual SDK rights and server backup settings were not verified. No application code, accounts, pairings, deployment or signing configuration was changed. SHA-256 comparison of all 417 existing baseline files confirmed no changes; this report is the only new unignored file. No production data was uploaded.

### Application and feature map

| Area | Actual implementation and current behavior |
|---|---|
| Mobile architecture | Expo **57.0.21**, React Native **0.86.3**, React **19.2.3**, Hermes; Expo Router screens and native UI; custom Swift/Kotlin Plaud Expo module. [Mobile dependencies](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/package.json), [native module](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/modules/plaud-sdk/ios/PlaudSdkModule.swift:50). |
| iOS application | CocoaPods workspace, Swift AppDelegate, arm64 vendor frameworks. Application deployment target **iOS 16.4**. The lower vendor minimums do not lower the app minimum. [Podfile](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/ios/Podfile:25), [AppDelegate](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/ios/AptlyAble/AppDelegate.swift). |
| Home and navigation | Home, Recordings, Recorder, Settings; connection notice, saved-recording access, light/dark theme. [Home](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/app/index.tsx:11), [layout](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/app/_layout.tsx). |
| Enrollment | Website account creation, recorder model/serial assignment, expiring invitation, sign-in, claim, native connection. Assignment and enrollment token are separate database concepts. [Enrollment screen](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/enrollment/EnrollmentScreen.tsx:17), [schema](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/infrastructure/migrations/001_enrollment.sql). |
| Hardware | NotePin S / Note Pro model presentation; assigned-serial discovery, cloud binding, BLE handshake, reconnect, unpair and dashboard release. Battery, storage and firmware-version display; record/pause/resume/stop commands; BLE and optional Wi-Fi transfer. [Device screen](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/plaud-device/PlaudDeviceScreen.tsx), [controller](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/plaud-device/plaud-device-controller.ts:225). Both models still require physical acceptance testing. |
| Library | Receive recorder audio while app is active; temporary cache; keep offline; load evicted audio from recorder; audio import through Files; search; playback and seeking; recording title and notes; imported transcripts; local deletion. [Library](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/recordings/RecordingsScreen.tsx), [detail](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/recordings/RecordingDetailScreen.tsx). |
| Dictated notes | User can use the system keyboard's dictation. No app-owned speech recognizer or phone-microphone recording flow was found. [Notes](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/recordings/components/RecordingNotesCard.tsx:34). |
| Transcription / AI | A separate manual-import workflow can upload audio to the backend and Plaud AI when configured. Recorder-origin automatic processing is a deliberate stub. No OpenAI/Anthropic integration or professional-advice generator was found in the actual phone flow. [GenerationPanel](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/transcription/GenerationPanel.tsx:40), [stub](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/services/recording-server.ts:3), [provider](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/modules/transcription/plaud/index.ts:183). |
| Settings | Account/sign-out, version/connection/permission diagnostics, copyable sanitized report, cache management, enrollment entry, pilot feature-status copy. No privacy policy, account deletion or support contact. [Settings](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/settings/SettingsScreen.tsx), [diagnostics](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/settings/SettingsDiagnostics.tsx:84). |
| Backend | Fastify **5.12.3**, PostgreSQL (`pg` **8.23.0**), Zod **4.6.0**; identities, assignments, enrollment, Plaud sessions/binding, transcription jobs, local server audio files. [API dependencies](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/package.json), [HTTP composition](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/transport/http/app.ts). |
| Website / demo | Separate Vite/React admin and enrollment website. The FieldSense `/dashboard` concept is frontend-only; it is not a completed mobile AI/reporting product. [Admin entry](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/admin/src/App.tsx), [admin dependencies](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/admin/package.json). |
| Monetization | No consumer checkout, subscriptions, StoreKit, RevenueCat, Stripe, premium unlock or purchase link in the inspected mobile flows. Backend vendor transcription credit is not itself an end-user payment flow. |

### Verification performed

| Check | Result and limits |
|---|---|
| `pnpm typecheck` | **PASS** across workspace packages. |
| `pnpm lint` | **PASS**, including `scripts/verify-boundaries.mjs`. |
| `pnpm exec vitest run` | **PASS: 439 tests, 42 files.** These do not establish real Bluetooth, permission, App Store or physical-device behavior. |
| `xcodebuild -version`, SDK inspection | Installed Xcode **27.0 (27A266a)** and iOS 27 SDK. Apple's published minimum since April 28, 2026 is Xcode 26 / iOS 26 SDK or later. The selected toolchain's upload eligibility must still be validated in App Store Connect. [Apple requirements](https://developer.apple.com/news/upcoming-requirements/). |
| Unsigned iOS Release build | **INCOMPLETE**. Stalled for several minutes in `ExpoModulesJSI`'s `build-xcframework.sh`, with a nested Xcode process and no advancing output. Audit-owned build processes were sent termination signals. No compiler failure or native success was established; do not describe this as a confirmed Swift code defect. Two audit-owned Xcode processes remained in macOS exit state after termination signals, so clean termination was not confirmed; unrelated existing Xcode processes were left untouched. Log: [.local/apple-audit-ios-build.log](/Users/zacharyzink/AptlyAble/aptly-able-app/.local/apple-audit-ios-build.log). |
| Existing archive inspection | Read Info.plist, signing entitlements, embedded frameworks and every bundled privacy manifest in build 5. Development-signed, not an App Store distribution archive. |
| Vendor binary inspection | Targeted `file`, `nm`, `strings`, `codesign` checks. These reveal symbols/resources, not proof of executed network behavior or complete security assurance. |
| Secret checks | No tracked `.env`/private signing files outside example templates; no hits for the examined AWS/OpenAI/private-key literal patterns in tracked text source. This is a limited scan, not a full historical secret audit. |
| Live public API, no authentication | `/health/live` and `/health/ready`: **200/ok**; `/v1/auth/config`: pilot enabled, development disabled; `/v1/plaud/capabilities`: available; `/v1/transcription/capabilities`: **unavailable, not_configured**. This confirms service flags, not an end-to-end pairing or transcription. |
| Not executed | Dependency installation, prebuild/pod regeneration, signed archive/export/upload, account creation/deletion, paid transcription, real recording/pairing, iPad/VoiceOver/NAT64 tests, production changes. |

Exact build command, run from repository root:

```sh
EXPO_NO_DOTENV=1 EXPO_PUBLIC_API_URL=https://api.plaud.aptlyable.info \
EXPO_PUBLIC_AUTH_MODE=pilot NODE_ENV=production FORCE_BUNDLING=1 \
xcodebuild -workspace apps/mobile/ios/AptlyAble.xcworkspace \
  -scheme AptlyAble -configuration Release -destination 'generic/platform=iOS' \
  -derivedDataPath .local/apple-audit-derived \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO build \
  > .local/apple-audit-ios-build.log 2>&1
```

### Guideline assessment matrix

These judgments concern this implementation. Policy references link to Apple's current [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).

| Guideline / subject | Status | Evidence and assessment |
|---|---|---|
| 1.1 Objectionable content | PASS, scoped | No bundled objectionable material or content feed found in mobile screens. User-selected private audio is not a curated public feed. |
| 1.2 UGC moderation | NOT APPLICABLE to current private library | No publishing, social comments or user-to-user content distribution found. Reassess if sharing/community features launch. |
| 1.4 Physical harm / advice | PASS, scoped | Recording/playback/transcription, not medical treatment or dangerous device control. Transcript accuracy remains a usability risk. |
| 1.5 Support | FAIL / CONFIRMED in-app gap | Diagnostics exist but no support contact/link in Settings. ASC support metadata remains unverified. |
| 1.6 Security | WARNING | Good token, ownership and input controls; deletion, backup, vendor and local-data questions remain. See Security. |
| 2.1 Completeness | FAIL / CONFIRMED | Recorder transcription stub and unavailable live transcription; C4. Signed current-source binary not verified; C5. |
| 2.2 Beta presentation | WARNING / LIKELY | Firmware “Coming soon,” “not connected yet” panels and pilot copy remain in product paths. |
| 2.3 Metadata accuracy | NEEDS MANUAL VERIFICATION | ASC listing not inspected. Do not advertise automatic Plaud transcripts, cloud backup, GPS or demo reports as implemented. |
| 2.5.1 Public APIs | NEEDS MANUAL VERIFICATION for vendor binaries | Own bridge uses supported native interfaces; proprietary SDK implementation not fully auditable. |
| 2.5.2 Downloaded executable code | PASS, scoped | JS is bundled; generated Expo updates config disables OTA updates; no feature-changing code download in own source. |
| 2.5.4 Background execution | WARNING | Only `bluetooth-central` declared, but app sync is foreground-gated. Justify actual BLE background behavior. |
| 2.5.5 IPv6 | NEEDS MANUAL VERIFICATION | Production cloud endpoints use DNS; recorder hotspot transport and SDK require NAT64/IPv6 testing. |
| 2.5.14 Recording | WARNING / LIKELY | Explicit Start/Stop controls and Recorder-screen indication exist; continuous indication and participant-consent guidance need verification/improvement. |
| 2.5.15 File selection | PASS, source | Uses native DocumentPicker. Verify Files/iCloud provider behavior on device. |
| 3.1.1 / 3.1.2 Payments | NOT APPLICABLE currently | No digital sales or subscriptions implemented. |
| 3.1.4 Hardware functionality | PASS, scoped | Serial/QR identifies assigned hardware; no evidence that it redeems a purchased digital entitlement. |
| 4.2 Minimum functionality | PASS, architecture; runtime unverified | Native hardware control, transfers, local playback and notes provide substantive utility. |
| 4.8 Login services | NOT APPLICABLE currently | Own email/password accounts only. Plaud partner OAuth is backend vendor authentication, not social sign-in. |
| 5.1.1 Privacy / deletion | FAIL / CONFIRMED | C1 and C2. |
| 5.1.2 Third-party / AI sharing | WARNING; FAIL if upload enabled unchanged | Upload UI lacks a complete named-provider permission explanation before cloud AI transfer; H1. |
| 5.1.5 Location | NEEDS MANUAL VERIFICATION | Wi-Fi-related declaration and SDK location symbols; no GPS feature or coordinate storage found. |
| 5.2 Intellectual property | NEEDS MANUAL VERIFICATION | Product photos and vendor binaries need usage/distribution-rights evidence. |
| SDK manifests / signatures | FAIL for missing listed-SDK manifest; further validation needed | C3. This is also an upload-validation concern, not solely a numbered reviewer guideline. |

## Critical Blockers

### C1 — No accessible in-app privacy policy

**Severity: Critical. Status: FAIL. Evidence: CONFIRMED. Guideline: 5.1.1(i).**

**Evidence/location:** [SettingsScreen.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/settings/SettingsScreen.tsx:17), [SettingsDiagnostics.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/settings/SettingsDiagnostics.tsx:84), [PilotAccessCard.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/session/PilotAccessCard.tsx), [AccountAccess.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/admin/src/features/session/AccountAccess.tsx). Searching first-party screens/routes found no privacy-policy link or policy screen. Account details and recorder ownership already reach servers, independent of whether transcription is enabled.

**Why it matters:** A working hardware app still needs a policy accessible inside the app and a valid ASC policy URL. No deployed policy or ASC entry was verified.

**Recommended fix:** Publish an accurate policy and link it from Settings and account onboarding. Cover account data, Plaud identity/binding, audio/transcripts when enabled, retention, server/vendor copies, device backup behavior, support, deletion and withdrawal. Identify the responsible legal entity and processors. Do not invent a policy saying all data stays on the phone.

### C2 — Account creation exists, but permanent account deletion cannot be initiated in the app

**Severity: Critical. Status: FAIL. Evidence: CONFIRMED. Guideline: 5.1.1(v).**

**Evidence/location:** Web registration calls `auth.register` in [AccountAccess.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/admin/src/features/session/AccountAccess.tsx:54); backend exposes register/login/logout in [auth-routes.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/transport/http/auth-routes.ts:31). [Pilot identity](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/modules/identity/pilot-identity.ts:20) has no deletion method; Settings only offers sign-out. [Enrollment schema](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/infrastructure/migrations/001_enrollment.sql:15) and [account schema](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/infrastructure/migrations/004_pilot_accounts.sql:2) retain related data with restrictive foreign keys.

**Why it matters:** Moving registration to the website does not solve the deletion requirement for this account service. Sign-out, deleting local audio, releasing an assignment and unbinding hardware are different operations. See Apple's [account-deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/).

**Recommended fix:** Add Settings → Account → Delete account, appropriate reauthentication/confirmation, and an idempotent deletion workflow. Revoke all sessions, release ownership, invalidate enrollment tokens, remove/anonymize personal account/assignment records as justified, delete uploaded audio/transcripts and coordinate vendor deletion. Explain legally retained exceptions and completion time. A direct deletion web flow can be used if it is actually reachable from the app; a generic “email support” instruction is not an adequate substitute here. Do not require the recorder to be physically present merely to initiate account deletion.

### C3 — Privacy manifests are missing from the assembled SDK package

**Severity: Critical for Hermes; High for FileSystem/Plaud verification. Status: FAIL / WARNING as distinguished below.**

**Evidence: CONFIRMED packaging omissions; LIKELY additional required-reason impact. Apple SDK privacy-manifest requirements; related 5.1.1/2.1.**

- Build 5 embeds **`Frameworks/hermesvm.framework`**, and `Podfile.lock`/the installed `hermes-engine.podspec.json` identify Hermes **250829098.0.17**. No Hermes privacy manifest was found in the framework, its installed pod tree, or elsewhere in that app under a Hermes resource bundle. **Hermes is explicitly on Apple's required SDK list.** The app's generic manifest is not evidence of a vendor SDK manifest. See [Apple's SDK list and packaging requirements](https://developer.apple.com/support/third-party-SDK-requirements/).
- Installed [Expo FileSystem podspec](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/node_modules/expo-file-system/ios/ExpoFileSystem.podspec:29) declares an `ExpoFileSystem_privacy` resource bundle, and its source manifest includes **DiskSpace** reasons. **Neither that bundle nor DiskSpace declarations are present in the existing archived app's manifest inventory.** The archived ExpoFileSystem binary contains `getFreeDiskStorageAsync`; installed source uses volume-capacity APIs. Exact binary-level required API use needs validation, but the packaging mismatch is confirmed.
- All three vendored [Plaud frameworks](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/modules/plaud-sdk/ios/Frameworks) lack a privacy manifest. Plaud itself is **not named** on Apple's current required list; that absence alone is not a proven automatic rejection. Its Basic SDK contains `NSUserDefaults` symbols, so vendor required-reason usage still needs an accurate declaration. Repackaged listed libraries would also count.

**Recommended fix:** Repair SDK resource packaging in the source-controlled generation/build process, obtain an appropriate Hermes SDK manifest/package and vendor attestations, regenerate native dependencies, then inspect the **actual distribution archive** and Xcode privacy report. Resolve upload validation warnings. Do not add speculative reason codes, assume a signed app fixes SDK provenance, or claim a root manifest covers every SDK requirement without validation.

Evidence locations: [Podfile](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/ios/Podfile:18), [app manifest](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/ios/AptlyAble/PrivacyInfo.xcprivacy), [Plaud podspec](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/modules/plaud-sdk/ios/PlaudSdk.podspec), existing build-5 archive described above. A fuller manifest inventory appears under Third-Party SDKs.

### C4 — The submitted feature surface would visibly expose unfinished work

**Severity: Critical. Status: FAIL for current completeness; rejection LIKELY. Guidelines: 2.1, 2.2; 2.3 if metadata overclaims.**

**Evidence/location:** [recording-server.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/services/recording-server.ts:3) explicitly sets `configured:false` and throws for uploads. [GenerationPanel.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/transcription/GenerationPanel.tsx:40) renders a waiting-for-server panel for every recorder-origin recording. [PlaudFirmwareCard.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/plaud-device/PlaudFirmwareCard.tsx:13) exposes “Coming soon.” [Settings](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/settings/SettingsScreen.tsx:35) describes unfinished integration; [recording detail](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/recordings/RecordingDetailScreen.tsx:203) says cloud backup is not connected. The live transcription capability endpoint returned `not_configured`.

**Why it matters:** A reviewer can reach these unfinished states through ordinary use. The problem is not that every future feature must exist; it is that the current app presents unavailable features as part of its product surface.

**Recommended fix:** Define a smaller complete first release around pairing, recording, transfer, playback and notes, and remove unavailable feature panels/claims from that release. Alternatively finish and validate those features before advertising them. Disabled firmware updates are not inherently required for a recorder companion; hide the future-update promotion while retaining useful version information. Do not present the web dashboard concept as completed mobile functionality.

### C5 — No validated App Store distribution build exists in the inspected delivery path

**Severity: Critical submission blocker. Status: FAIL for submission readiness. Evidence: CONFIRMED artifact type; current native compilation UNVERIFIED. Guideline: 2.1 plus signing/upload requirements.**

**Evidence/location:** [ios-pilot.mjs](/Users/zacharyzink/AptlyAble/aptly-able-app/scripts/ios-pilot.mjs:92) creates unsigned or **Apple Development** archives; its validation expects `get-task-allow=true` and records `testFlightReady:false` ([lines 141 onward](/Users/zacharyzink/AptlyAble/aptly-able-app/scripts/ios-pilot.mjs:141)). Existing build 5 confirms that entitlement. The audit's current-source unsigned build stalled before completion.

**Recommended fix:** Establish a separate App Store distribution configuration/export workflow with production API/native mode, Apple Distribution signing, correct provisioning and Wi-Fi entitlements. Resolve the native build stall and dependency drift, create a fresh version/build, validate the archive, install a distribution-equivalent build on devices, then upload through App Store Connect. Developer Program enrollment alone does not convert the pilot archive into a submission artifact. This is an upload/release gate, not a claim that a human reviewer rejected the build.

## High Priority Issues

### H1 — Cloud transcription needs explicit, complete third-party sharing permission

**Status: WARNING now; FAIL if enabled unchanged. Evidence: CONFIRMED UI/backend mismatch. Guidelines: 5.1.1(ii), 5.1.2(i).**

[GenerationPanel.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/transcription/GenerationPanel.tsx:173) tells a signed-in user that audio/transcripts are kept “on the server”; tapping Generate starts upload. Plaud is mentioned in a different signed-out state, but there is no complete explanation at the signed-in decision point of Aptly Able storage **and Plaud's AI processing/storage**, nor a recorded sharing-consent decision. [Plaud provider](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/modules/transcription/plaud/index.ts:82) uploads using a per-user vendor account and submits audio for transcription/diarization.

Before enabling this path, show the actual recipients, purpose, retention/deletion link and an explicit affirmative action before upload. A clearly informed action can serve as permission; a separate checkbox is not inherently required. Keep refusal compatible with local recording/playback. Persist the relevant consent version if processing becomes automatic. No claim of an active undisclosed cloud audio upload is made here: the live capability currently disables this path and recorder sync uses a stub.

### H2 — Reviewer access requires preparation beyond an email/password

**Status: NEEDS MANUAL VERIFICATION. Evidence: CONFIRMED dependencies; missing review package not independently verified in ASC. Guidelines: 2.1, Before You Submit.**

[EnrollmentScreen](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/enrollment/EnrollmentScreen.tsx:97) can stop at “Invitation needed”; [device controller](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/plaud-device/plaud-device-controller.ts:235) only discovers the exact assigned serial. A reviewer needs working credentials, a usable enrollment assignment and access to supported hardware to verify the core feature. An expiring single-use QR screenshot can become useless before review.

Prepare a dedicated review account and hardware/re-enrollment plan, reliable review contact and a short genuine device demonstration video. Provide a sample audio/transcript for local playback without hardware. Disclose all demo behavior; the Android-only mock recorder is not a complete iOS review solution. A video supplements access and does not guarantee Apple will waive hardware testing. Do not reuse a personal account or expose real customer conversations.

### H3 — Recording visibility is local to the Recorder screen

**Status: WARNING. Evidence: CONFIRMED screen implementation; LIKELY cross-screen clarity risk. Guideline: 2.5.14.**

[PlaudRecorderControls.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/plaud-device/PlaudRecorderControls.tsx:12) has explicit Start/Pause/Stop and a recording state indicator. The native bridge calls the recorder's `startRecord` ([PlaudSdkModule.swift](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/modules/plaud-sdk/ios/PlaudSdkModule.swift:342)). [Home](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/app/index.tsx:15) displays connection status, not the device's active recording status. No participant-consent explanation was found in the first-party recording flow.

Verify the recorder's audible/visible indicators and the effect of changing tabs, disconnecting, locking the phone and backgrounding. Add a persistent recording indication/return-to-controls action where state is known, plus clear initial recording guidance. Distinguish “Bluetooth disconnected” from “recorder stopped.” Existing Start/Stop controls mean this is **not** a finding of completely silent or automatically initiated phone recording.

### H4 — Vendor data destinations and privacy behavior are not fully documented

**Status: NEEDS MANUAL VERIFICATION. Evidence: CONFIRMED binary strings; POSSIBLE executed behavior. Guidelines: 5.1.1, 5.1.2, 2.5.1.**

The supplied `PlaudDeviceBasicSDK` binary contains location-related symbols, `NSUserDefaults`, logging symbols and URL strings referencing `cms.timotech.cn:8080`, `m.baidu.com`, `timotech-recorder.oss-cn-shenzhen.aliyuncs.com`, and `www.timotech.cn`. This **does not establish that the current app contacts those hosts**; they may be inactive, legacy or support paths. Own backend requests use fixed `platform-us.plaud.ai` / `platform-jp.plaud.ai` hosts ([provider](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/modules/plaud-devices/provider.ts:67)).

Obtain the SDK's exact version/build identity, privacy manifest, subprocessor/endpoint list, retention and training-use statements, encryption description, logging controls and distribution rights. Confirm actual Release network traffic during initialization, binding, Wi-Fi and export. Do not declare “US-only processing,” “no SDK telemetry” or “no vendor retention” from `customDomain` alone.

### H5 — Server audio/transcript deletion and retention are undefined

**Status: FAIL for deletion coverage; WARNING while transcription disabled. Evidence: CONFIRMED. Guidelines: 5.1.1(i)/(v), 5.1.2.**

[recording-routes.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/transport/http/recording-routes.ts:52) offers register/get/retry/upload, with no delete route. [Processing service](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/modules/recordings/service.ts:35) retains uploaded files; worker results persist transcripts. [Local deletion dialog](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/recordings/RecordingDetailScreen.tsx:228) removes phone data only and does not initiate server/vendor deletion.

Define retention and implement deletion for server audio, transcript, job metadata, provider copies and backups. Explicitly distinguish device, app, server and vendor copies in deletion UX. This work should be part of C2 rather than a second inconsistent deletion system. The code shows no retention limit; it does not prove that a particular customer recording currently exists on the server.

### H6 — Support is not reachable from the app

**Status: FAIL for inspected in-app support. Evidence: CONFIRMED. Guideline: 1.5.**

[SettingsDiagnostics](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/settings/SettingsDiagnostics.tsx:114) says to copy a report when asking for help, but there is no support address or destination in [SettingsScreen](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/settings/SettingsScreen.tsx). Add a real support entry and an operating support URL in ASC. Keep diagnostic sharing user-initiated; the existing sanitized preview is useful.

## Medium Priority Issues

| ID | Status / certainty | Location, impact and recommended action |
|---|---|---|
| M1 — Native dependency drift | WARNING / CONFIRMED | `expo-application` and `expo-clipboard` are in [package.json](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/package.json) but not the existing [Podfile.lock](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/ios/Podfile.lock) or generated ExpoModulesProvider. [Native diagnostics](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/services/diagnostics-runtime.native.ts:7) deliberately uses optional module loading, so a startup crash is **not** established; version/copy support can fall back. Regenerate Pods/native registration in a later implementation pass and verify the new archive. |
| M2 — Location permission uncertainty | NEEDS MANUAL VERIFICATION | [app.config.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/app.config.ts:44) describes Wi-Fi identification; the SDK contains CLLocationManager/requestWhenInUseAuthorization symbols. Verify that permission is requested only when needed for Wi-Fi, not BLE enrollment, and that denial leaves BLE usable. No GPS-tracking feature was found. Related 5.1.1/5.1.5. |
| M3 — Unused Face ID declaration | WARNING / CONFIRMED declaration, no first-party use | Generated [Info.plist](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/ios/AptlyAble/Info.plist:62) includes Face ID wording; [session-store.native.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/services/session-store.native.ts:4) uses Keychain accessibility without `requireAuthentication`. Remove the unused declaration through reproducible config or implement a justified biometric feature later. Do not claim biometrics are currently collected. |
| M4 — Background-mode justification | NEEDS MANUAL VERIFICATION | [app.config.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/app.config.ts:52) enables only Bluetooth central. [PlaudSyncProvider](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/plaud-device/PlaudSyncProvider.tsx:35) disables file sync in background. Verify whether BLE control/state maintenance actually needs this mode; document it or remove it if unnecessary. Do not promise background audio sync. Related 2.5.4. |
| M5 — Password recovery absent | WARNING / CONFIRMED | [AccountAccess](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/admin/src/features/session/AccountAccess.tsx:159) states reset is unavailable; [auth routes](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/transport/http/auth-routes.ts) contain none. Add a secure recovery path before broad use. This is a reliability/support concern, not a separate automatic SIWA requirement. |
| M6 — Manual imports remain device-shared | WARNING / CONFIRMED | [RecordingsProvider](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/recordings/RecordingsProvider.tsx:60) filters Plaud audio by actor but always includes records without `source`. Imported files/notes therefore remain visible after account changes. Choose and explain device-local versus account-owned imports; add removal controls for shared-phone use. This is not proof of cross-account server access. |
| M7 — Storage copy boundaries | WARNING / CONFIRMED | [recording-store.native](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/services/recordings/recording-store.native.ts:41) separates Documents metadata/kept audio and Cache audio; [picker](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/services/recording-picker.native.ts:19) leaves picker copies to OS cleanup. The 100 MB limit is not a limit on the whole sandbox. Review temporary SDK/picker files and backup exclusions; avoid implying local delete securely erases all copies. |
| M8 — Export/encryption classification | NEEDS MANUAL VERIFICATION | No `ITSAppUsesNonExemptEncryption` value in app config/native Info.plist. HTTPS, Keychain and proprietary recorder transport must be considered together. Obtain Plaud's encryption statement before answering ASC; absence of this key alone is not a rejection if the questionnaire is completed correctly. [Apple export guidance](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance). |
| M9 — iPad/orientation acceptance | NEEDS MANUAL VERIFICATION | [app.config.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/app.config.ts:31) supports tablets; generated [Info.plist](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/ios/AptlyAble/Info.plist:95) advertises all four iPad orientations. Actual minimum is iOS16.4. Test iPad layouts, split-screen, keyboard and permission sheets or narrow support before release. |
| M10 — Forced-restart transfer recovery | WARNING / CONFIRMED fallback, frequency unverified | [transfer-recovery.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/plaud-device/transfer-recovery.ts:4) asks users to close/reopen after a stalled SDK export. This is safer than overlapping exports, but frequent occurrence would undermine 2.1. Test interruptions and vendor cancellation behavior on both transports. |
| M11 — Branding and asset rights | NEEDS MANUAL VERIFICATION | [assets/README](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/assets/README.md) documents product-photo URLs and adapted icon; [RecorderPhoto](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/recorder/RecorderPhoto.tsx:4) bundles them. Source provenance is not a redistribution license. Confirm Plaud/brand authorization, SDK license and third-party notices. Previously selected ASC name “AA FieldSense” versus binary “Aptly Able” should be reconciled; live ASC name was not checked. Related 2.3.8/5.2. |

## Low Priority Improvements

- **WARNING / CONFIRMED copy issue:** [Home](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/app/index.tsx:41) says recordings are saved on this phone, while automatic audio is an evictable cache. Use “Available in your library; keep offline to retain audio” or equivalent consistent wording.
- **WARNING / MANUAL VERIFICATION REQUIRED:** [recording detail](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/recordings/RecordingDetailScreen.tsx:251) uses 11.5-point footnotes for consequential retention text. Check Dynamic Type/readability. Existing [slider accessibility actions](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/recordings/components/PlaybackSlider.tsx:44) and [modal semantics](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/ui/ConfirmationDialog.tsx:44) are positive; do not report these as missing.
- **WARNING / MANUAL VERIFICATION REQUIRED:** [AnimatedMeter](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/ui/AnimatedMeter.tsx), [theme](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/ui/theme.ts), forms and player need VoiceOver, larger text, contrast and Reduce Motion verification. A web preview does not establish native accessibility.
- **WARNING / CONFIRMED future-facing risk:** [GenerationPanel](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/transcription/GenerationPanel.tsx:164) labels generated transcripts but has no accuracy caveat. When enabled, add concise guidance to review names/numbers/speaker attribution and retain original audio. No legal/medical/financial advice engine is currently present.
- **WARNING / CONFIRMED maintenance issue:** Build5 and current source share version/build identifiers. Assign a new monotonic build number when producing the next release candidate so support can distinguish installed behavior. [release.json](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/release.json).

## Privacy Findings

### Actual end-to-end paths

```text
Website name/email/password → Aptly Able API → PostgreSQL account + hashed password
Phone login → Aptly Able API → opaque session → iOS Keychain
Dashboard assignment → recorder serial/model/user → PostgreSQL + enrollment token hash
Phone accepts invitation → API ownership checks → Plaud per-user token/bind → native SDK
Plaud microphone → recorder storage → BLE or recorder Wi-Fi → phone cache / kept audio
Phone title/notes/imported transcript → local app Documents
Manual imported audio + Generate (only if enabled)
  → Aptly Able audio storage + PostgreSQL metadata
  → Plaud user-specific signed upload → Plaud AI transcription/diarization
  → Aptly Able PostgreSQL transcript → authenticated phone display
Recorder-origin automatic server upload → NOT CONNECTED (stub)
Diagnostics → local preview → clipboard only on user request
```

This diagram describes first-party code. Unknown proprietary SDK network behavior is explicitly outside that proof.

### Complete data inventory

“Linked” means associated with an account or identifiable recorder in the inspected flow. **No advertising tracking use was found**; vendor behavior still needs confirmation. The policy must not confuse “not used for tracking” with “not collected.”

| Data | Collection/purpose | Local storage | External recipient / linkability | Retention and deletion | Evidence / certainty |
|---|---|---|---|---|---|
| Display name | Web account registration, account identity | Web form/state; not a separate mobile address book | Aptly Able API/PostgreSQL; linked to user ID | No account-deletion or retention limit found | [pilot-identity](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/modules/identity/pilot-identity.ts:53), CONFIRMED |
| Email | Web registration; mobile/web login; account display | Persisted session metadata in Keychain on iOS | Aptly Able identity API/DB; linked | Until backend deletion is implemented; local session removed on sign-out | [PilotAccessCard](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/session/PilotAccessCard.tsx:25), [session store](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/services/session-store.native.ts), CONFIRMED |
| Password | User login/registration | Input state; no saved plaintext password found in own source | HTTPS API; salted scrypt hash in DB | No recovery/deletion flow; password not sent to Plaud by own provider | [password.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/modules/identity/password.ts:7), CONFIRMED |
| App account ID / role | Authorization and ownership | Session/enrollment state; recording-source metadata | API/DB; ID also sent to Plaud to create per-user token | Account/assignment records retained; role not an ad identifier | [device provider](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/modules/plaud-devices/provider.ts:103), CONFIRMED |
| Session credentials | Signed-in requests | Opaque app token in `WHEN_UNLOCKED_THIS_DEVICE_ONLY` Keychain; web uses sessionStorage | API gets bearer token; DB holds SHA-256 token hash | Seven-day app session lifetime; logout revokes; expiry is not physical deletion of historical rows | [pilot identity](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/modules/identity/pilot-identity.ts:25), [native store](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/services/session-store.native.ts:4), CONFIRMED |
| Plaud JWT | Authenticate recorder session | Passed to native SDK; own JS keeps transient state, SDK persistence unknown | API mints from Plaud; phone SDK receives it; linked to user | Own device token request uses one-hour expiry; vendor behavior requires confirmation | [provider](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/modules/plaud-devices/provider.ts:85), [native init](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/modules/plaud-sdk/ios/PlaudSdkModule.swift:163), CONFIRMED / vendor MANUAL |
| Serial, model, assignment, enrollment events | Identify intended recorder and ownership | Active state; local recording-source serial/actor/session ID; dismissed-record tombstones | API/DB and Plaud binding/signature services; linked | Unpair releases ownership, does not erase history; invitation hash expires/used/revoked | [schema](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/infrastructure/migrations/001_enrollment.sql), [file store](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/services/recordings/file-recording-store.ts:87), CONFIRMED |
| QR/invitation token | Claim assignment | Link/input state; OS/browser handling outside app control | App/API resolve/claim; token hash in DB; link uses fragment/code, query tokens rejected | Expires and one-use claim; no account erasure system | [EnrollmentScreen](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/enrollment/EnrollmentScreen.tsx:25), CONFIRMED |
| BLE UUID, signal/device connection state | Nearby scan/selection/status | Runtime state; recorder serial is persisted separately | Native SDK; own code's cloud calls use assigned serial/model | Own first-party scan state transient; SDK retention unknown | [device controller](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/plaud-device/plaud-device-controller.ts:235), CONFIRMED / vendor MANUAL |
| Battery, storage, firmware version | Device management | Runtime display; no own server telemetry upload found | Recorder ↔ SDK ↔ app; no demonstrated analytics upload | Runtime; vendor logs unknown | [device status](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/plaud-device/PlaudDeviceStatus.tsx), CONFIRMED |
| Wi-Fi SSID/password | Join recorder hotspot | Native connection context; not exposed in normal JS UI | Recorder/OS/Plaud native Wi-Fi agent; not own cloud API | SDK/OS persistence requires verification | [PlaudWifiTransfer](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/modules/plaud-sdk/ios/PlaudWifiTransfer.swift:54), CONFIRMED / MANUAL |
| Recorder audio / conversations | Physical device mic; listen/transcribe | Recorder original; SDK export; app temporary or kept audio | Transfer to phone. Automatic own server upload is absent. Vendor additional transmission unverified | 100 MB managed temporary cache; kept audio until delete; app delete leaves hardware original | [detail](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/recordings/RecordingDetailScreen.tsx:154), [stub](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/services/recording-server.ts), CONFIRMED |
| Imported audio | User-selected Files item | Picker cache and copied app file | Local by default; explicit Generate can send to API/Plaud when enabled | Local deletion; source Files copy unchanged; server/provider deletion missing | [picker](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/services/recording-picker.native.ts:5), [GenerationPanel](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/transcription/GenerationPanel.tsx:173), CONFIRMED |
| Recording title, filename, size, dates, duration | Organization and playback | JSON metadata; identifies session/contents | Imported-audio title/filename/size/ID transmitted on transcription registration; device notes/title not automatically uploaded by stub | Local deletion; server registration retained | [recording-model](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/recordings/recording-model.ts:32), [service](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/modules/recordings/service.ts:10), CONFIRMED |
| User notes / dictated notes | Recording annotation | Local JSON in Documents | No own notes upload; keyboard dictation service behavior controlled by OS/user settings | Local edit/delete; retained across unpair; imported-file notes device-shared | [NotesCard](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/recordings/components/RecordingNotesCard.tsx), [file store](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/services/recordings/file-recording-store.ts:131), CONFIRMED |
| Imported transcript documents | Select text/JSON/VTT/SRT content, attach to recording | Parsed text/segments and filename locally; picker cache | No automatic transcript upload found | Local delete; original selected document unchanged | [picker](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/services/recording-picker.native.ts:22), [parser](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/recordings/transcript-parser.ts), CONFIRMED |
| Generated transcript / AI response | Plaud transcription and speaker diarization | Displayed in account-scoped controller; no durable local generated-transcript cache established | Plaud → backend job/JSONB → phone; linked | Backend retained; no user/server/provider deletion route | [Plaud provider](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/modules/transcription/plaud/index.ts:183), [repository](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/modules/recordings/repository.ts:20), CONFIRMED code, live feature disabled |
| AI prompt/settings | Fixed automatic language + diarization parameters, not free-form chatbot prompts | Request construction | Plaud AI receives audio URL and processing options | Vendor retention/training terms unknown; `return_embedding:false` does not prove no internal speaker processing | [provider](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/modules/transcription/plaud/index.ts:193), CONFIRMED |
| IP address | Network delivery and auth abuse limit | No durable phone record found | API, hosting/proxy and Plaud necessarily receive network addresses | API auth buckets expire after one minute; infrastructure access-log retention unverified | [auth routes](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/transport/http/auth-routes.ts:15), CONFIRMED / infrastructure MANUAL |
| Diagnostic info / failures | Build, OS, permission, connection and sync status | Local report and optional clipboard; API error event/request ID | No automatic mobile crash/analytics collector found; user can manually share report outside app | API structured logs have no configured retention here; support/SDK logs require investigation | [diagnostics](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/settings/diagnostics.ts), [HTTP errors](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/transport/http/app.ts:82), CONFIRMED / vendor MANUAL |
| Product usage | Assignment/enrollment and processing events used for functionality | Device state, metadata | API/DB operational events linked to user; not shown to be ad analytics | No complete retention/deletion schedule | [enrollment schema](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/infrastructure/migrations/001_enrollment.sql:70), CONFIRMED |
| Photos/camera/contacts | No user capture/contact feature found | Bundled product/logo images only | No own user-photo/contact upload found | NOT APPLICABLE to current features | [RecorderPhoto](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/recorder/RecorderPhoto.tsx), permission inventory |
| Phone microphone / speech recognition | Disabled phone recording; keyboard dictation only | No app-owned phone mic recording found | No app-owned speech API; OS dictation separate | NOT APPLICABLE to current app-owned capture | [app.config](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/app.config.ts:24), [NotesCard](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/recordings/components/RecordingNotesCard.tsx:34) |
| GPS / precise/coarse location | No recording-location tracking implemented; SDK may use permission for Wi-Fi identity | No coordinates in own contracts/database | Actual SDK location/network behavior unverified | Do not claim location collection or absence without vendor/runtime evidence | [app.config](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/app.config.ts:44), [contracts](/Users/zacharyzink/AptlyAble/aptly-able-app/packages/contracts/src), MANUAL VERIFICATION REQUIRED |
| IDFA/ad attribution/tracking | No ad SDK, ATT request or ad-ID use found in own app dependencies/source | None found | Vendor attestation still pending | NOT APPLICABLE in first-party implementation | Dependency inventory and targeted native symbol scan |

### Recording consent: Apple versus law

**Apple assessment:** Explicit recording controls and clear recording indication matter under 2.5.14; collection/sharing permission and disclosure also matter under 5.1.1/5.1.2. The physical recorder captures sound, not the phone microphone. The absence of `NSMicrophoneUsageDescription` is therefore not itself a defect in this implementation. H3 addresses remaining indication/consent clarity.

**Legal/business review required:** Conversation capture can include people who did not operate the recorder. Applicable consent, workplace, confidentiality, sensitive-data and retention rules depend on deployment locations and context. Obtain qualified review and appropriate participant-facing guidance before rollout. No specific jurisdiction's consent rule is asserted here, and App Store approval would not establish legal compliance. Do not market the app as suitable for covert recording.

## App Store Privacy Disclosure

**Proposed configuration, not ready for submission until the vendor and hosting questions are resolved.** Apple's label concerns off-device collection, linkage and purpose; on-device processing alone is different. Optional user action does not automatically make a core feature exempt from disclosure. [Apple's privacy-label definitions](https://developer.apple.com/app-store/app-privacy-details/).

| ASC data type | Proposed declaration | Purpose / linkage / tracking | Confidence and condition |
|---|---|---|---|
| Contact Info → Email Address | **Collected** | App Functionality; linked to identity; not tracking based on own source | CONFIRMED for native login/account service. |
| Contact Info → Name | **Likely collected for the integrated account service** | App Functionality; linked; no tracking found | Web registration definitely stores name. Confirm the exact native/profile/vendor collection boundary; website-only collection should not be mechanically treated as native collection without that review. |
| Identifiers → User ID | **Collected** | App Functionality; linked; no tracking found | CONFIRMED account and Plaud per-user ID. Do not expose session secrets as a separate public label example. |
| Identifiers → Device ID | **Likely collected** | App Functionality; linked via ownership; no tracking found | Recorder serial/device ID is sent to service/vendor. Confirm how the current questionnaire classifies accessory identifiers and any vendor-generated phone IDs. Do not claim IDFA collection. |
| User Content → Audio Data | **Collected if transcription is offered/enabled** | App Functionality; linked; no tracking found | Backend retains submitted audio and sends it to Plaud. For a release that excludes all cloud audio processing, verify SDK behavior before omitting. |
| User Content → Other User Content | **Collected for uploaded recording titles/filenames and generated transcript content when enabled** | App Functionality; linked | Local-only notes/imported transcripts alone do not establish off-device collection. |
| Diagnostics → Crash / Performance / Other Diagnostic Data | **Conditional; investigate** | Likely App Functionality if retained by support/vendor | No mobile analytics/crash SDK found. Do not declare a category solely because diagnostics can be copied locally. Confirm vendor and production logs. |
| Usage Data → Product Interaction | **Conditional; investigate** | App Functionality if operational actions are retained as usage data; linked if tied to account | Assignment/event history is confirmed; map actual retained service events to Apple's definitions, not guessed analytics. |
| Location → Precise / Coarse | **Undetermined for SDK; no first-party GPS feature** | Do not preselect a purpose without evidence | A permission string is not proof that coordinates leave the phone. Verify SDK/network behavior. |
| Other Data → retained IP/network data | **Conditional** | App Functionality/security, linkage depends on logs | Ephemeral request processing differs from retained logs. Confirm proxy/vendor retention and any IP-to-location processing. |
| Photos/Videos, Contacts, Browsing History, Search History, Health, Financial Info, Purchases | **Not indicated by current implementation** | Not applicable | Local recording search is not transmitted by own code. Revisit if cloud indexing, billing or SDK behavior changes. |
| Data Used to Track You | **Proposed No, pending vendor confirmation** | No advertising/cross-company tracking in own source | Third-party functional processing is not automatically tracking. ATT should not be added merely because Plaud is a third-party SDK. |

**Do not select “Data Not Collected.”** Email, user identity and binding/account functionality already communicate with services. Complete answers for the actual released feature configuration, include third-party collection, and align policy, consent UI, manifests and labels. Do not enable currently disabled collection later without updating those disclosures.

## Permissions

Descriptions below come from [app.config.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/app.config.ts:17) and the generated [Info.plist](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/ios/AptlyAble/Info.plist). Permission presence does not prove a prompt was shown.

| Permission | Used By / actual request boundary | Purpose | Current Description | Recommendation | Status |
|---|---|---|---|---|---|
| `NSBluetoothAlwaysUsageDescription` | Plaud SDK initialization/scan, [native module](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/modules/plaud-sdk/ios/PlaudSdkModule.swift:163); diagnostics only reads `CBManager.authorization` | Discover/control assigned recorder and receive audio | “Aptly Able uses Bluetooth to connect to your assigned Plaud recorder.” | Appropriate; improve to mention control and recording transfer. Verify first prompt appears after user's connect action and denial has recovery. | PASS configuration; runtime NEEDS MANUAL VERIFICATION |
| `NSBluetoothPeripheralUsageDescription` | Not declared; no legacy-iOS target | Legacy key | None | No need to add for iOS16.4 minimum. | NOT APPLICABLE |
| `NSLocalNetworkUsageDescription` | Plaud Wi-Fi transfer [connectWifi](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/modules/plaud-sdk/ios/PlaudWifiTransfer.swift:54) | Access recorder hotspot/local transfer service | “Aptly Able connects to your Plaud recorder over Wi-Fi to receive recordings faster.” | Good purpose; verify prompt timing and BLE fallback if denied. | PASS wording; runtime NEEDS MANUAL VERIFICATION |
| `NSLocationWhenInUseUsageDescription` | Vendor SDK location symbols; no own CLLocationManager caller | Wi-Fi identity according to config, not recording-location tracking | “Aptly Able uses this permission to identify your recorder’s Wi-Fi connection.” | Verify necessity. If accurate, explain location is used only to identify the recorder Wi-Fi network; do not claim that until SDK behavior is confirmed. | WARNING / MANUAL VERIFICATION REQUIRED |
| `NSLocationAlwaysAndWhenInUseUsageDescription` / legacy Always | Not declared; no background-location mode | None | None | Do not add without implementing an independently justified location feature. | NOT APPLICABLE |
| `NSFaceIDUsageDescription` | Generated SecureStore-related config; own session store does not request biometric auth | No implemented biometric use | “Allow $(PRODUCT_NAME) to access your Face ID biometric data.” | Remove unused declaration via config. If later used, describe unlocking access; apps do not receive raw Face ID biometric data. | WARNING / CONFIRMED unused in own code |
| `NSMicrophoneUsageDescription` | No phone-mic capture; expo-audio recording permission disabled | Hardware recorder captures audio | None | Correct for current app-owned flow. If phone voice recording is added, implement permission and consent then. Verify SDK does not unexpectedly access phone mic. | PASS, scoped |
| `NSSpeechRecognitionUsageDescription` | No app speech-recognition API | System keyboard dictation only | None | No app speech permission needed merely for the keyboard's dictation feature. | NOT APPLICABLE |
| `NSCameraUsageDescription` | No in-app camera scanner; system Camera opens invitation | None | None | Do not add solely for QR deep linking. | NOT APPLICABLE |
| `NSPhotoLibraryUsageDescription` / `NSPhotoLibraryAddUsageDescription` | Bundled images, not photo-library access | None | None | Native file picker avoids broad photo permission. | NOT APPLICABLE |
| `NSContactsUsageDescription` | No contacts API | None | None | Keep absent. | NOT APPLICABLE |
| `NSUserTrackingUsageDescription` | No ATT request/ad-ID collection in own source | No implemented advertising tracking | None | Keep absent unless actual tracking is introduced; confirm SDK behavior first. | NOT APPLICABLE, vendor verification pending |
| Notifications / push | No notification registration / `aps-environment` entitlement | None | None | No prompt or push capability needed for current features. | NOT APPLICABLE |
| Files / document picker | [recording-picker.native.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/services/recording-picker.native.ts:5) | User-selected audio/transcript | System picker UI | Verify selected-file access, cancellation, iCloud downloads and size errors; no blanket Files permission string required. | PASS source; runtime manual |

**Bonjour nuance:** Generated source Info.plist contains `_expo._tcp`, but the Xcode Release script removes that service and it is absent in archived build5. Do not flag it as a confirmed production Bonjour advertisement. The custom recorder local-network purpose remains intentionally configured. [project.pbxproj](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/ios/AptlyAble.xcodeproj/project.pbxproj:258).

## Third-Party SDKs

### Important runtime inventory

| SDK | Purpose | Data Shared | Privacy Manifest | Apple Risk | Action Needed |
|---|---|---|---|---|---|
| PlaudDeviceBasicSDK (embedded metadata 1.0/build1; exact vendor release unidentified) | Identity/handshake, recorder agent/commands, vendor service behavior | User JWT, device/session information; additional binary behavior unknown | None found | H4; UserDefaults/location symbols; missing vendor attestation | Obtain current signed SDK release, privacy/data/encryption documentation and runtime trace. |
| PlaudBleSDK (metadata 1.0/build1) | BLE and recorder audio/export | Device communication/audio on phone; vendor telemetry not established | None found | Proprietary code; source XCFramework slice unsigned in `codesign -d` inspection | Confirm provenance and proper final signing. Plaud not itself on Apple's required list; do not call unsigned source slice an automatic rejection. |
| PlaudWiFiSDK (metadata 1.0/build1) | Recorder hotspot transfer | Hotspot credentials/local audio; location-related symbols | None found | Permissions/local networking; vendor required-reason uncertainty | Verify denial/fallback, endpoints, manifests and SDK signing. |
| Hermes **250829098.0.17** | JavaScript runtime | No application data-upload service identified | **Missing from installed SDK and existing archive** | **C3: Apple-listed SDK** | Resolve required SDK manifest/provenance and validate upload. App development signing is not vendor-origin attestation. |
| React Native **0.86.3** / React **19.2.3** | Native UI/runtime | Data handled by application code; not an analytics service by default | React Core/cxxreact/timing manifests and prebuilt dependency manifests present in archive | Archive-level manifest aggregation and runtime compatibility | Keep verified resource bundles and final privacy report. |
| Expo FileSystem **57.0.6** | Files/cache/uploads/size information | Local files; explicit application-requested upload paths | Source manifest present; **bundle missing in inspected archive** | C3, disk-space required reasons | Correct resource copying and verify final archive. |
| Expo SecureStore **57.0.3** | Keychain session persistence | Local session token/metadata | No dedicated manifest found in inspected module tree | Unused FaceID string; backup/accessibility semantics | Keep Keychain storage; remove misleading unused declaration. |
| Expo Audio **57.0.4** | Native playback | Local selected audio; recording capability disabled by config | No dedicated manifest found | Verify no unexpected mic request/background capture | Keep recording disabled for current phone flow. |
| Expo DocumentPicker **57.0.1** | System Files selection | User-selected URI/content delivered to app | No separate archive manifest identified | Copy retention/user-file handling | Verify file-provider access and cache cleanup. |
| Expo Constants **57.0.17** | Runtime config | Local build/config values | `ExpoConstants_privacy.bundle` present; UserDefaults CA92.1 | No automatic tracking established | Retain correct manifest/config. |
| Expo Application **57.0.2**, Clipboard **57.0.1** | Version/build display, user-requested diagnostics copy | Local build info / clipboard | Application source manifest present; native registration missing for both in current generated Pods | M1; fallback instead of crash | Regenerate native dependencies, verify archive resources. |
| Expo Crypto **57.0.2** | Random recording identifiers | Locally generated UUIDs | No dedicated manifest found | Not an ad identifier | Confirm export answers with all crypto, not package name alone. |
| Expo Dev Client **57.0.18** and launcher/menu dependencies | Development tooling | Debug-only behavior potentially includes local network/dev connections | No separate app collection claim established | Shipping a dev launcher would be a problem; dependency presence alone does not prove exposure | Validate final Release entry, bundle and absence of interactive dev menu; remove unnecessary dev URL scheme from distribution config if appropriate. |
| Expo Router/Linking/Metro, RN screens/safe-area/reanimated/worklets | Routing, deep links and UI interactions | App-directed links/events; no automatic ad service found | Varies; not all libraries require their own manifest absent covered behavior/listing | Deep-link/error handling, required-reason aggregation | Validate actual archive and supported navigation. |
| Inter font package / Expo Font / vector icons / assets | Bundled typography/images | No remote Google auth or analytics implemented | Font/asset resource handling reviewed; no collection service found | License/provenance | Preserve required licenses. “Google fonts” is not Google Sign-In. |
| Fastify/pg/Zod/qrcode | Backend HTTP/DB validation/QR | Accounts/assignments/processing handled by own API | Server dependencies are not iOS privacy-manifest bundles | Data handling/retention still affects policy and labels | Keep auth/ownership controls; implement deletion/retention. |
| Plaud cloud API | Per-user SDK tokens/binding; conditional AI transcription | User ID, recorder identity; uploaded audio and transcript when enabled | Server service, not an embedded manifest | Third-party disclosure, explicit permission, retention/encryption | H1/H4/H5. Vendor's model provider/training behavior not established by this repo. |
| Hosting / PostgreSQL / server filesystem | Public website/API and persistence | Account, device, conditional audio/transcript; infrastructure IP/log data | Not iOS SDKs | Data residency, backups, access controls unknown | Verify actual EC2/proxy volumes/backups. No implemented Aptly-owned S3 upload adapter found. |
| Firebase, Google Sign-In, Meta, ad SDKs, Sentry/Crashlytics, StoreKit/RevenueCat/Stripe, OpenAI/Anthropic | **Not found in current runtime dependencies or first-party integration paths** | No implemented flow | Not applicable | Do not invent collection, SIWA or IAP obligations from planned features | Reaudit if added. |

### Complete direct package inventory and dependency boundaries

Version-lock authority: [pnpm-lock.yaml](/Users/zacharyzink/AptlyAble/aptly-able-app/pnpm-lock.yaml), [mobile package manifest](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/package.json), [admin manifest](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/admin/package.json), [API manifest](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/package.json), [contracts](/Users/zacharyzink/AptlyAble/aptly-able-app/packages/contracts/package.json), [API client](/Users/zacharyzink/AptlyAble/aptly-able-app/packages/api-client/package.json). Workspace `@aptly/*` packages are first-party, not external vendors. The lockfile contains the exhaustive transitive npm resolution graph; build-only tooling should not be mistaken for embedded data-collecting SDKs.

All direct third-party mobile runtime dependencies:

```text
@expo-google-fonts/inter 0.4.2     @expo/metro-runtime 57.0.15
@expo/vector-icons 15.0.3         expo 57.0.21
expo-application 57.0.2           expo-asset 57.0.16
expo-audio 57.0.4                 expo-clipboard 57.0.1
expo-constants 57.0.17            expo-crypto 57.0.2
expo-dev-client 57.0.18           expo-document-picker 57.0.1
expo-file-system 57.0.6           expo-font 57.0.3
expo-linking 57.0.9               expo-modules-core 57.0.17
expo-router 57.0.20               expo-secure-store 57.0.3
expo-splash-screen 57.0.8         expo-status-bar 57.0.1
react 19.2.3                     react-dom 19.2.3
react-native 0.86.3               react-native-reanimated 4.5.1
react-native-safe-area-context 5.7.0
react-native-screens 4.26.0       react-native-web 0.21.2
react-native-worklets 0.10.1
```

Other direct runtime dependencies: admin React/React DOM **19.2.3**; API Fastify **5.12.3**, pg **8.23.0**, qrcode **1.5.4**, Zod **4.6.0**; contracts/API-client Zod **4.6.0**. Development tooling: TypeScript **6.0.3**, Vitest **5.0.0**, ESLint **10.10.0**, `@eslint/js` **10.0.1**, typescript-eslint **8.70.0**, Prettier **3.9.6**, Vite **8.2.2**, Vite React plugin **6.1.1**, tsx **4.23.13**, Metro config **0.86.3**, and the locked TypeScript declaration packages. These tools are not independent mobile analytics SDKs.

CocoaPods dependency graph is in [Podfile.lock](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/ios/Podfile.lock): React/Hermes, Expo native modules, JSI/worklets, navigation modules, and first-party PlaudSdk bridge. Prebuilt `ReactNativeDependencies.framework` carries boost/Folly/glog privacy bundles. ExpoModulesJSI uses a dependency-internal Swift package build; no separate app-owned Swift Package Manager dependency integration was found in the Xcode project. Simulator slices are absent from the Plaud vendor frameworks.

Android-only native dependencies are explicitly declared in [build.gradle](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/modules/plaud-sdk/android/build.gradle): Plaud AAR, coroutines **1.8.1**, Retrofit/converter-gson **2.11.0**, OkHttp/logging-interceptor **4.12.0**, Gson **2.11.0**, Java-WebSocket **1.5.7**, BouncyCastle **1.78.1**, Conscrypt **2.5.2**, Timber **5.0.1**, slf4j **2.0.7**, logback-android **3.0.0**, Guava **33.3.1-android**. They warrant Android privacy/logging review but are **not embedded in the iOS app**. Do not copy Android permissions or SDK findings into an Apple disclosure without iOS evidence.

### Privacy manifests and required reasons

| Observed manifest | Declared API categories / reasons | Archive result |
|---|---|---|
| App `PrivacyInfo.xcprivacy` | UserDefaults **CA92.1**; FileTimestamp **C617.1**; SystemBootTime **35F9.1** | Present in existing build5; tracking false; collected-data array empty. |
| Expo Constants | UserDefaults **CA92.1** | Present in archive. |
| React Core | FileTimestamp **C617.1**; UserDefaults **CA92.1** | Present in archive. |
| React cxxreact | FileTimestamp **C617.1** | Present. |
| React timing | SystemBootTime **35F9.1** | Present. |
| React dependency boost/Folly/glog | FileTimestamp **C617.1**; boost also SystemBootTime **35F9.1** | Present inside ReactNativeDependencies resource bundles. |
| Expo FileSystem source | FileTimestamp **0A2A.1 / 3B52.1**; DiskSpace **E174.1 / 85F4.1** | Source supplied; no matching privacy bundle in inspected app. Root also lacks DiskSpace. |
| Expo Application source | FileTimestamp **C617.1** | Source supplied; new native module absent from generated dependency graph. |
| Hermes | No manifest found | Missing; Apple-listed SDK. |
| Plaud Basic/BLE/Wi-Fi | No manifests found | Vendor assessment needed; Basic UserDefaults symbols observed. |

The empty app collected-data array is **not proof of an incorrect ASC answer** because ASC answers were not inspected. It is also **not proof that the service collects nothing**. Review declarations separately from required-reason API coverage. No tracking domains are declared in the inspected manifests; this must match actual vendor behavior.

Apple's [required-reason API documentation](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api) requires valid reasons for covered APIs, including included code. Confirm each declared reason against actual use; do not infer compliance from a reason code merely existing. Hermes is listed; Plaud and React Native by those names are not on the current list. Listed SDKs repackaged inside others still count. Source inspection alone cannot rule out such repackaging.

## Authentication & Account Deletion

**Account deletion: FAIL (C2). Sign in with Apple: NOT APPLICABLE to current login design.**

The website registers an owned email/password account. Mobile [PilotAccessCard](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/session/PilotAccessCard.tsx) signs into the same service. There are no Google, Facebook, Microsoft or other third-party consumer login buttons. Plaud's backend partner/user JWT exchange authenticates the recorder service; it is not an alternative login provider. Apple's current 4.8 own-account-system exception applies to this design. Reassess if a social login is added; do not add SIWA solely because the SDK uses OAuth internally.

Positive controls are confirmed: salted scrypt passwords; opaque random app sessions stored hashed server-side; bounded sign-in attempts; native Keychain storage; session verification and expiration; authorization for owned recordings. [Password code](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/modules/identity/password.ts), [session lifecycle](/Users/zacharyzink/AptlyAble/aptly-able-app/packages/api-client/src/session), [native store](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/services/session-store.native.ts).

Outstanding account behaviors:

- No reset or verification email flow found. Recovery should exist before broader customer use.
- Local playback/import remains available without a recorder account; account ownership is justified for binding and server operations. Avoid requiring login for unrelated local features.
- Sign-out removes local credentials and attempts server logout; it is not permanent deletion. Offline logout/revocation and expired sessions still need physical acceptance testing.
- Deleting the app can remove Documents but may not erase surviving Keychain credentials, upstream data or the physical recorder. Deletion UX must be explicit about those boundaries.
- Account deletion must not be implemented as a single `DELETE users` query: restrictive assignment/audit references and provider state require an ordered, retryable workflow.

## Payments

**Current status: NOT APPLICABLE for IAP/subscription implementation; no confirmed payment-rule circumvention.**

No end-user billing, paid tier, consumable purchase, subscription, external checkout or payment SDK was found in the mobile dependency graph or screens. QR enrollment and serial binding identify hardware; they do not currently unlock purchased digital subscriptions. Vendor transcription credits mentioned in [retry confirmation](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/transcription/GenerationPanel.tsx:205) are not a purchase UI.

For the present free hardware companion, do not add StoreKit just to satisfy a nonexistent purchase flow. If transcription hours, cloud storage, AI reports or individual subscriptions are later sold, reassess 3.1.1/3.1.2 and applicable exceptions/storefront rules. Do not assume “SaaS,” “B2B” or “reader app” creates an automatic exemption. Existing hardware-dependent functions should be explained under 3.1.4; optional digital features require their own assessment. [Apple business rules](https://developer.apple.com/app-store/review/guidelines/#business).

No purchase/restore flow is required to be tested for a feature that does not exist. Pricing, customer type and future distribution model require owner confirmation before monetization.

## Hardware/Bluetooth

### Pairing and transfer architecture

1. The API verifies the signed-in actor and active assignment, then obtains a per-user Plaud token. [Plaud service](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/modules/plaud-devices/service.ts), [provider](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/modules/plaud-devices/provider.ts:85).
2. The phone initializes the SDK with that token and region domain. Scanning keeps the vendor's actual device objects; JS filters the **full exact assigned serial**, not just the last four display digits. [Native bridge](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/modules/plaud-sdk/ios/PlaudSdkModule.swift:138), [controller](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/plaud-device/plaud-device-controller.ts:235).
3. Cloud binding/signature registration and native BLE connection must complete. “Ready” requires BLE connection plus matching bind and pen/handshake callbacks; dispatching a native method alone is not a success. [controller](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/plaud-device/plaud-device-controller.ts:225).
4. Commands request record/pause/resume/stop and query device status. Transfer uses BLE or recorder Wi-Fi hotspot; Wi-Fi credentials stay in native handling. Files are copied to local app storage through the bridge.
5. Unpair tracks cloud, device and assignment release separately, blocks during recording/transfer, and keeps saved recordings. Partial completion is retryable and needs genuine hardware/network testing. [Pairing card](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/plaud-device/RecorderPairingCard.tsx:68), [controller](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/plaud-device/plaud-device-controller.ts:431).

**No ExternalAccessory/iAP integration or supported accessory-protocol declaration was found.** This is CoreBluetooth/BLE plus Wi-Fi. Ordinary BLE does not imply that an app must enroll in MFi; Apple distinguishes it from External Accessory/iAP use. Obtain confirmation if Plaud introduces an MFi-specific protocol. [Apple accessory overview](https://developer.apple.com/accessories/), [Apple BLE/External Accessory clarification](https://developer.apple.com/library/archive/qa/qa1657/_index.html).

### iOS configuration inventory

| Setting | Observed configuration | Assessment |
|---|---|---|
| Bundle ID / version | `com.aptlyable.mobile`; `0.1.0` build `5` | Confirm ASC record and increment build for new artifact. |
| App name | Binary “Aptly Able”; earlier owner-selected listing “AA FieldSense” | Align deliberately; no current ASC validation. |
| Minimum OS / Swift | App iOS16.4; app Swift5.0 build setting; bridge pod Swift5.9 | Vendor minimum13/14/15.1 and Info `LSMinimumSystemVersion=12.0` do not override app deployment target. |
| Devices / orientations | iPhone and iPad, `UIRequiresFullScreen=false`; iPhone portrait/upside-down in generated plist, iPad all orientations | Test advertised combinations; app config's portrait preference is not the whole iPad configuration. |
| Wi-Fi entitlements | HotspotConfiguration and wifi-info | Appropriate candidates for recorder transfer; actual request/use and signing must be verified. |
| Background modes | `bluetooth-central` only | No audio, location, fetch, processing or remote-notification modes. H3/M4 remain. |
| URL schemes | `aptlyable`, bundle identifier scheme, `exp+aptly-able` | Invitation custom links; no Associated Domains entitlement found. Universal links optional, not mandatory for review. |
| Push, App Groups, shared keychain groups | None declared in app config/entitlement file | No matching feature found; do not add speculatively. Signing may add default application/keychain identifiers. |
| ATS | Arbitrary loads false; local networking true | Broad internet HTTP exemption absent. Recorder-local access requires validation. |
| Expo updates | `EXUpdatesEnabled=false` | No OTA update channel configured for this artifact. |
| Signing | Pilot development archive; no proven distribution export | C5. Wi-Fi capabilities need correct production provisioning. |
| Encryption flag | Not set | Complete classification/questionnaire, including vendor transport. |

Sources: [app config](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/app.config.ts), [Info.plist](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/ios/AptlyAble/Info.plist), [entitlements](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/ios/AptlyAble/AptlyAble.entitlements), [Xcode project](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/ios/AptlyAble.xcodeproj/project.pbxproj), [Expo config](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/ios/AptlyAble/Supporting/Expo.plist).

### Hardware limitations to disclose and verify

A physical iPhone and supported recorder are needed; proprietary framework slices do not support the iOS simulator. Browser/Expo Go pairing is not available. A NotePin S and Note Pro may have different firmware/recording behavior; shared UI support is not physical validation. No firmware-install operation is implemented. No hardware audio-erasure operation should be implied by “Delete from app.”

Test internet loss versus recorder Wi-Fi separately. Cloud token/binding requires internet; the recorder hotspot is a local audio transport, not a guaranteed internet connection. Verify clean recovery when switching networks. Cloud hostname use is positive, but does not establish IPv6/NAT64 compatibility of the native SDK.

## Security

| Finding | Status / certainty | Evidence and consequence |
|---|---|---|
| Vendor secrets stay server-side in own code | PASS, scoped / CONFIRMED | [config](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/bootstrap/config.ts:25), [Plaud provider](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/modules/plaud-devices/provider.ts:89). Mobile gets a scoped user JWT, not client secret. Public API origin is not a secret. Limited source-pattern scan found no recognized literal keys; history/binary secret completeness not certified. |
| Production development-auth guard | PASS, scoped / CONFIRMED | [config validation](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/bootstrap/config.ts:41) rejects development credentials on production/non-loopback setups; live config returned development disabled. No confirmed live auth bypass. |
| Release configuration fallback | WARNING / CONFIRMED | [AppProviders](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/bootstrap/AppProviders.tsx:64) defaults to localhost and local access mode if public env is absent. [ios-pilot](/Users/zacharyzink/AptlyAble/aptly-able-app/scripts/ios-pilot.mjs:35) guards the pilot route, but a future Organizer distribution path must preserve equivalent checks. Do not flag localhost source strings as proven live URLs. |
| Server ownership checks | PASS, scoped / CONFIRMED | [ownedRecording](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/modules/recordings/repository.ts:48) binds ID and user; enrollment/device service checks ownership. Passing current tests is not a complete adversarial authorization audit. |
| Password/session protection | PASS, scoped / CONFIRMED | Scrypt, constant-time comparison, token hashing, expiry/revocation, Keychain accessibility. Web sessionStorage is separate from native storage. |
| Local audio/text protection | WARNING / CONFIRMED implementation, OS protection MANUAL | [native store](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/services/recordings/recording-store.native.ts:41) stores ordinary files; no explicit per-file protection/backup-exclusion policy in own adapter. This is not proof of unencrypted disk: iOS sandbox/Data Protection still apply. Verify lock-state accessibility and backup behavior; define handling for sensitive conversations. |
| Server disk/backup controls | NEEDS MANUAL VERIFICATION | [audio-storage](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/modules/recordings/audio-storage.ts:23) uses directory0700/file0600; [deployment](/Users/zacharyzink/AptlyAble/aptly-able-app/deploy/pilot/compose.yaml) uses persistent storage. No application-level encryption or backup retention policy established; EC2/EBS/DB encryption and restore procedures require infrastructure review. |
| Request/error logging | PASS, scoped / CONFIRMED | [HTTP app](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/transport/http/app.ts:46) disables ordinary request logging; errors log sanitized event/request ID instead of body/provider error. Proxy and vendor logging remain unknown. No sensitive first-party mobile `console.log`/Swift `print` was found in the searched runtime files. |
| SDK logging / hidden behavior | NEEDS MANUAL VERIFICATION | Plaud binaries contain logging/location/defaults indicators. Installed versus archived binary strings differ; symbol presence is not actual leaked content. Verify Release device logs and vendor controls. |
| Link-token exposure | PASS, scoped / CONFIRMED | [enrollment parser](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/enrollment/enrollment-link.ts) and screen reject query-token invitations; server stores hashes; responses use no-store. Custom schemes can still be claimed by another app; consider verified universal links as hardening. Ownership checks remain necessary. |
| Local cross-account imports | WARNING / CONFIRMED | M6; own-device shared content, not established server data leakage. |
| Upload bounds and storage integrity | PASS, scoped / CONFIRMED | [audio storage](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/modules/recordings/audio-storage.ts:16) enforces sizes and atomic writes; transcript picker capped2MB; local audio max250MB. Additional codec/malicious-file validation belongs in a security test pass. |
| WebView injection | NOT APPLICABLE to native wrapper claim | No mobile WebView wrapper found. Browser React admin/demo has its own web security surface; not evidence of native WebView behavior. |
| Data erasure | FAIL / CONFIRMED | Account/backend/provider deletion remains absent; C2/H5. |

Searches included TODO/FIXME/HACK, localhost/127.0.0.1, mock/placeholder, console/print/fatalError, keys and auth-bypass markers across source, configuration and scripts. Relevant production risks are the visible stubs, absent release-environment guard in generic entry, development tooling verification and vendor unknowns described above. Form placeholders, test fixtures, Android preview adapters and dev script logging are **not** automatically App Store defects. The mock recorder is gated by app configuration; iOS audit command used native production/pilot settings.

## Reviewer Walkthrough

This is a source-and-artifact walkthrough, not a claim that a reviewer session was executed on a phone.

| Stage | Expected current experience | Failure/confusion point | Preparation/remediation |
|---|---|---|---|
| Install | Current archive requires development installation; Apple submission artifact not available | Cannot submit/install as a normal Store build | C5 distribution build and validation. |
| Launch | Native tabs/Home with library and recorder notice | Latest native compilation/launch not verified; development-mode fallback possible if built incorrectly | Physical cold launch, offline launch and correct release config. |
| Permissions | Bluetooth requested as SDK starts connection; Wi-Fi/local network/location later depends on vendor behavior | Location prompt may look unrelated; no reason to request phone mic/camera | Verify prompt order, denial and Settings recovery. |
| Login/create | Mobile email/password login, account previously created through dashboard | Reviewer lacks account/reset/assignment; no clear self-contained registration journey | Supply working review account and explicit site/enrollment instructions; add account recovery. |
| Enrollment | Enter invitation/claim, then open Recorder | Expired/used QR, wrong model/serial, already bound hardware | Fresh review enrollment or already-enrolled account plus reset/contact procedure. |
| Connect | Search exact assigned serial, connect, cloud bind and native handshake | Hardware not available, still bound elsewhere, token/internet failure | Provide actual supported device/access and genuine video; explain limitations. |
| Record | Recorder screen shows Start, state, Pause/Resume/Stop | Changing tabs/disconnect may obscure ongoing hardware recording | Persistent indication and explicit behavior; verify hardware LED/audio cues. |
| Receive/listen | Foreground BLE transfer or optional Wi-Fi; library/player/notes | Background interruption, evicted cache, wrong network, SDK stall | Test transfer lifecycle; clearly explain temporary versus kept audio. |
| Transcription/AI | Recorder-origin “waiting for server”; manual-import transcription unavailable on live API | Appears incomplete when exploring advertised recording/transcript workflow | Remove unavailable panels for scoped release or finish with H1/H5 protections. |
| Settings/support | Diagnostics, storage, enrollment, pilot feature information | No support destination/privacy policy; copy fallback on old native registration | C1/H6/M1. |
| Delete recording | Deletes phone copy, with hardware-original warning for device files | Backend/Plaud copies unaffected; source Files copy remains | Clearly distinguish copy locations and implement remote deletion when applicable. |
| Delete account | No path | Reviewer cannot initiate account erasure | C2. |
| iPad/accessibility | Advertised supported device; native modal/slider semantics exist | No actual iPad/VoiceOver/large-type acceptance | Test before asserting support. |

## App Review Notes

**Draft for the eventual corrected release. Do not paste unchanged: placeholders and unfinished behavior must be resolved first.** Use a dedicated review account, not an owner's credentials. Do not include secrets in this repository.

> **App:** [FINAL STORE NAME], version [VERSION] ([BUILD]), bundle ID com.aptlyable.mobile.
>
> **Purpose:** This is a native companion for [PHYSICALLY VERIFIED SUPPORTED PLAUD MODELS]. Users connect their assigned recorder, control recording, receive audio, listen, and add private titles/notes. The app uses the Plaud Embedded SDK. It is not the official Plaud consumer app.
>
> **Review account:** Username [REVIEW EMAIL]. Password [ENTER SECURELY IN APP STORE CONNECT REVIEW CREDENTIAL FIELDS]. The account is [PRE-ENROLLED / FOLLOW THE ENCLOSED ENROLLMENT INSTRUCTIONS]. No purchase is required to use this review account.
>
> **Hardware/access:** Recorder [MODEL / REVIEW SERIAL IDENTIFIER] is [HARDWARE ACCESS ARRANGEMENT]. Keep it powered on and nearby. [CONFIRMED INSTRUCTIONS FOR RELEASING ANY PRIOR APP BINDING]. This feature needs a physical recorder and iPhone; it cannot be demonstrated using an iOS simulator. Demonstration video: [URL]. Review contact: [NAME, EMAIL, PHONE, AVAILABILITY]. Please contact us if fresh enrollment/hardware access is needed.
>
> **Setup:** Sign in under Recorder using the supplied account. [IF NEEDED: OPEN REVIEW INVITATION OR PASTE CODE, THEN CONTINUE SETUP]. Open Recorder, search for the assigned device, allow Bluetooth, then tap Connect recorder. Wait for the confirmed ready state. Internet is required for account and Plaud authentication.
>
> **Recording:** On Recorder, select Start recording. The external recorder captures sound; the app does not record through the iPhone microphone. Observe [VERIFIED RECORDING INDICATOR], then Stop and save. Keep the app open while receiving the recording. Open Recordings to listen and edit title/notes. Participants should know that recording is taking place.
>
> **Wi-Fi:** [INCLUDE ONLY IF SHIPPING AND VERIFIED] Choose Wi-Fi transfer for larger recordings. The phone joins the recorder's local Wi-Fi network. Local-network access is used to receive audio. [EXACT VERIFIED LOCATION-PERMISSION PURPOSE, IF STILL REQUIRED]. Bluetooth transfer remains [VERIFIED FALLBACK BEHAVIOR].
>
> **Transcription/AI:** [CHOOSE ONE ACCURATE STATEMENT: THIS RELEASE DOES NOT OFFER CLOUD TRANSCRIPTION / AFTER EXPLICIT SHARING PERMISSION, GENERATE TRANSCRIPT SENDS SELECTED AUDIO TO APTLY ABLE AND PLAUD FOR TRANSCRIPTION]. [VERIFIED FEATURE STEPS AND EXPECTED TIMING]. No transcript or report demonstration should be presented as a real processing result unless generated by the shipping feature.
>
> **Without hardware:** A sample [AUDIO/TRANSCRIPT] is available at [URL OR IN-APP LOCATION] for testing local import, playback, seeking and notes. This does not simulate a hardware connection.
>
> **Privacy/support/deletion:** Policy: [WORKING URL]. Support: [WORKING URL]. Account deletion: [VERIFIED SETTINGS PATH AND COMPLETION DETAILS]. Local recording deletion [ACCURATE COPY-RETENTION EXPLANATION].
>
> **Scope:** [LIST ANY MATERIAL LIMITATIONS OF THE COMPLETE RELEASE, NOT UNFINISHED PROMOTIONAL FEATURES]. Firmware updates, GPS tracking, automatic cloud backup and the separate web dashboard concept are not part of this release unless explicitly completed and described here.

## Submission Checklist

### MUST FIX BEFORE SUBMISSION

- [ ] **C1:** Publish/approve policy and expose it inside the app; ensure an operating ASC policy URL.
- [ ] **C2/H5:** Implement account deletion and necessary backend/vendor erasure or documented scheduled erasure, including sessions, assignments and recordings.
- [ ] **C3:** Resolve Hermes SDK manifest and Expo FileSystem archive resource gaps; validate every required reason and vendor declaration against the actual distribution artifact.
- [ ] **C4:** Choose a complete release scope; remove unfinished firmware/transcription/backup/demo claims or finish those features with privacy controls.
- [ ] **C5/M1:** Resolve native build/dependency drift; generate a new correctly signed and validated distribution archive with production configuration.
- [ ] **H6:** Add working support contact/link.
- [ ] **H1, if cloud transcription ships:** Explicit informed permission before sharing with Aptly Able/Plaud; aligned retention/deletion and label disclosures.
- [ ] **H2:** Arrange reproducible reviewer access, account and hardware/enrollment instructions.

### SHOULD FIX BEFORE SUBMISSION

- [ ] Verify/enhance persistent recording indication and consent guidance; do not confuse disconnect with recording stop.
- [ ] Add password recovery and decide email-verification requirements.
- [ ] Resolve unused FaceID declaration and validate Wi-Fi location/background-mode necessity.
- [ ] Clarify temporary audio, device-shared imports, hardware originals and cloud-copy deletion.
- [ ] Verify iOS file protection and backup/exclusion settings; define server/vendor retention.
- [ ] Resolve frequent native transfer stalls if hardware testing demonstrates them.
- [ ] Align native/Store name, support language, asset rights and third-party notices.
- [ ] Verify accessibility and readable retention wording; add transcript accuracy guidance when AI ships.

### APP STORE CONNECT SETUP

These items are **MANUAL VERIFICATION REQUIRED**; this audit did not inspect the authenticated ASC record.

| Item | Required decision/artifact |
|---|---|
| App identity | Confirm correct team/legal entity, `com.aptlyable.mobile`, final name (previously AA FieldSense), unique build/version. |
| Subtitle | Accurate concise hardware-companion value; no unfinished AI promises. |
| Description | Explain supported recorder models, account/setup, internet versus local transfer, storage behavior and complete released features. |
| Keywords | Relevant terms; avoid misleading brand affiliation or unavailable features. |
| Category | Likely Productivity or Utilities; choose based on shipping primary function. |
| Age rating | Complete current questionnaire honestly; do not infer mature public UGC from a private file library or choose “Kids” by default. Apple's updated questions apply. [Current requirements](https://developer.apple.com/news/upcoming-requirements/). |
| Screenshots | Genuine final iPhone screens and required iPad assets if supported, using fictional account/conversation data. No Android emulator or frontend-demo screenshots presented as native functionality. |
| Icon | Verify opaque generated1024×1024 asset, correct brand, no placeholder; confirm asset rights. |
| Support URL/contact | Reachable page with actual monitored contact information. |
| Privacy policy URL | Public functioning policy matching source/vendor/backend reality. |
| Marketing URL | Optional; accurate product page if provided. |
| Copyright / content rights | Responsible entity/year; authorization for Plaud SDK/photos, Aptly Able logo and any demo content. |
| App Privacy | Complete proposed disclosure after vendor/logging/retention verification. |
| Encryption/export | Answer questionnaire for the whole app including Plaud; supply documentation if required. Do not default the exemption flag to false without analysis. |
| Pricing / distribution | Confirm free current release, territories, public versus appropriate limited distribution. No IAP records needed for nonexistent purchases. |
| Agreements / regional status | Complete required agreements; verify trader status if EU distribution applies. These are account checks, not inferred source defects. |
| Review information | Dedicated account, contact, hardware/serial/invitation arrangement, instructions and useful video/sample files. |
| Accessibility declarations | If completed in ASC, reflect actual tested behavior rather than code semantics alone. |
| Build processing | Successful upload, encryption resolved, no manifest/signature errors, correct build selected for version. |

### MANUAL TESTING REQUIRED

- [ ] Clean install and upgrade from current pilot; cold launch without Metro/computer.
- [ ] iPhone on minimum supported iOS and current supported release; iPad if advertised.
- [ ] First sign-in, wrong password, revoked/expired session, offline restore, sign-out, account switching and deletion.
- [ ] Fresh/used/expired/wrong-account invitation; custom-link launch with app installed and manual code fallback.
- [ ] Correct serial/model, absent recorder, Bluetooth off/denied/restricted and permission recovery.
- [ ] NotePin S and Note Pro separately; already-bound recorder, full unpair, partial release/retry and new owner enrollment.
- [ ] Record/pause/resume/stop; physical-button recording; tab changes, phone lock and Bluetooth loss; persistent indication.
- [ ] BLE/Wi-Fi transfer, local-network/location denial, hotspot switching and loss of internet; IPv6-only/NAT64 cloud network.
- [ ] Interrupt transfer, background/foreground, SDK timeout/restart, large recordings, low disk, duplicate transfer and saved-file integrity.
- [ ] Playback interruptions/calls/headphones, seeking, cache eviction and reload, keep offline, delete, source Files retained.
- [ ] Import from local Files/iCloud, cancellation, unsupported/corrupt/oversized audio/transcripts, long names/notes.
- [ ] If AI enabled: permission refusal, upload interruption, provider failure, duplicate-risk retry, long processing, transcript result and backend/vendor deletion.
- [ ] VoiceOver, larger text, Reduce Motion, dark mode, landscape/iPad multitasking and keyboard/modal reachability.
- [ ] Release network/log inspection of proprietary SDK; verify collected fields, destination regions and no unexpected permissions/data transmission.
- [ ] Final Xcode privacy report, archived SDK resources/signatures, provisioning/entitlements and upload validation.

### READY FOR REVIEW

Only mark these when evidenced, in order:

1. [ ] Privacy/account/data decisions signed off; blockers resolved in source.
2. [ ] Current-source checks pass and production build is reproducible.
3. [ ] Final distribution artifact's manifests, entitlements, bundle settings and environment verified.
4. [ ] Physical acceptance matrix completed, with failures resolved or release scope narrowed.
5. [ ] Reviewer account, hardware/access, privacy/support URLs and ASC metadata verified.
6. [ ] Owner approves the exact build and truthful release claims for submission.

**If we submitted this exact build to Apple today, what are the five most likely reasons Apple would reject it?**

1. **Missing in-app privacy policy** — confirmed, 5.1.1(i).
2. **Missing account-deletion initiation and backend erasure workflow** — confirmed, 5.1.1(v).
3. **Incomplete SDK privacy packaging**, especially the absent Hermes manifest — confirmed omission; likely upload/validation failure, with additional FileSystem/Plaud verification unresolved.
4. **Visible unfinished features and unavailable transcription** — confirmed implementation, likely 2.1/2.2 objection if submitted with this feature surface.
5. **Inability to review the primary hardware workflow without prepared account/enrollment/hardware access** — conditional 2.1 risk; no adequate ASC review package was verified.

Separately, the existing development-signed archive cannot be treated as an App Store distribution build: C5 must be resolved before a normal review can even begin. If cloud transcription is enabled without H1, inadequate third-party AI sharing permission becomes another serious 5.1.2 risk.
