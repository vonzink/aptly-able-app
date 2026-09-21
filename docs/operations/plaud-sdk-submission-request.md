# Plaud support request — ready to send

Draft prepared September 18, 2026. No message has been sent. Send through your existing Plaud developer-support channel; include this evidence, not app credentials, SDK access tokens, real recorder serials or customer recordings.

Before sending, review your existing account agreement against the newly located [public SDK terms](https://dev.plaud.ai/commercial-terms-of-service/) and [DPA](https://global.plaud.ai/pages/data-processing-addendum). Existing written coverage may answer parts of this request. See the [workaround assessment](../verification/2026-09-18-plaud-workarounds.md). In particular, confirm the applicable terms cover FieldSense's field-work recording/transcription use given public section 2.3(c), and whether documented export plus app-level codec packaging changes are permitted under section 2.3(a). This is an unresolved applicability question, not a conclusion that our app violates those terms.

**Subject: Embedded SDK store-release blockers: Android 16 KB codecs, release logging, licensing and erasure**

We are preparing Aptly Able / AA FieldSense for iOS and Android store testing with Plaud NotePin S and Note Pro support.

We can now access your official `Plaud-AI/plaud-sdk-public` repository. We inspected `sdk/android/plaud-sdk.aar` at commit `8d7541e503cb96043e8629624aa6cee0241daa03`, labeled SDK v1.0.57, dated September 16, 2026. The AAR is 2,752,467 bytes with SHA-256 `041a6f8814d350dbc8bcd4a515487136529bb8bb4368fc88c9b36c9a386aedce`.

Please help us resolve these submission requirements:

1. **16 KB Android support.** The official AAR's `jni/arm64-v8a/liblame.so` still has ELF LOAD alignment of 4096 bytes and noncongruent 16 KB file/virtual offsets. The AAR also contains affected x86_64 LAME and Opus libraries; our current phone release is ARM64. Please provide a supported rebuilt AAR with compatible native codecs, checksum, exact version, dependency list and runtime support/test guidance. Repackaging/ZIP alignment alone will not fix the ELF segments.
2. **SDK redistribution and support.** Your README identifies the binaries as proprietary under a separate license. Please provide the applicable iOS/Android binary terms and confirm distribution in our own signed apps through TestFlight/App Store and Google Play, applicable attribution requirements and supported device/firmware matrix. We need the actual binary terms, not only the sample's Apache license.
3. **Release logging and local data.** The Android candidate still contains `filesDir/plaud_sdk_logs`, INFO Logback file output, detailed partner request/response body/header logging and token storage in `sdk_prefs`. We found the public `setBleLogLevel` API, but need a documented way to disable sensitive network/file logging before initialization, fully redact authentication/device signatures, and clear old SDK logs/preferences safely after sign-out/account deletion without disrupting another user. Please describe the defaults and all storage/retention limits. These findings are from static inspection, not a capture of customer traffic.
4. **Export cancellation.** Please document an API and terminal contract that cancel Bluetooth/Wi-Fi audio export and await all decoder/file writers, including timeouts, lost callbacks, disconnect and account changes. Does `stopSyncFile` or `endWiFiTransfer` stop the exporter and guarantee no later writes/callbacks? If not, what is supported? Our wrapper currently retains export ownership after cancellation until terminal completion rather than assuming the worker stopped.
5. **Migration/public APIs.** Our older integration uses `NiceBuildSdk` for partner-key readiness/serial signing and `TntAgent`/`Constants.DeviceStatus` for recording/handshake state. The new public-surface guidance excludes internals, and the latter two types are absent. Please confirm the supported handshake/failure flow and recording-state replacement using the facade and its callbacks, including delayed callbacks after disconnect/reconnect.
6. **Privacy and deletion.** For both exact SDK releases, provide endpoints/regions, data fields and purposes, local files/preferences, logs, subprocessors, processing/retention/training terms, and the account/user/device erasure process and service levels. We have committed to account deletion within seven days, including provider/backup cleanup; please state whether and how you can meet that scope. A device unbind is not equivalent to account data erasure. Include applicable Apple required-reason API/privacy manifest/signature evidence and whether Android 12+ connection can avoid precise/approximate location permission.

Our currently integrated Android AAR is labeled 1.0.13, SHA-256 `d342c8ca58a7326fb4f11e73ce23e00ae21a83c4bc399d869835e14013c6ab02`. We have not replaced it with the new candidate.

Our existing iOS frameworks are from official `Plaud-AI/embedded-react-native` commit `31a3de0c3fe3f4c95142592e942449bf6db4122f`. Their generic plist strings are `1.0`/`1`; executable SHA-256 values are:

- PlaudBleSDK: `55487f135ef2c33a1cc6433017ca5c4c7df42f1140b82aa860cdace5bb8f3154`
- PlaudWiFiSDK: `b468530d7904b358e805da2a2ddfc31cc21a001622a45a61aac6d838086d4698`
- PlaudDeviceBasicSDK: `7574af368aee4c22cf92b1747c01e90a2c8ecd2a15e38e22b5d89a0916e0a2f8`

Please identify the supported upgrade path for these iOS binaries as well. We can provide the sanitized native-library inspection JSON and a minimal reproduction if helpful.
