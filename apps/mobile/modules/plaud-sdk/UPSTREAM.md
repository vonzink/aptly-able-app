# Upstream SDK provenance

Source: https://github.com/Plaud-AI/embedded-react-native
Commit: `31a3de0c3fe3f4c95142592e942449bf6db4122f`
Copied directory: `modules/plaud-sdk`
Retrieved: 2026-09-11

The TypeScript wrapper and iOS XCFrameworks are preserved from this commit. The Swift/Kotlin bridges and iOS podspec include these local fixes:

- Scan generations invalidate delayed iOS Bluetooth retries and Android permission callbacks after cancellation.
- Android retains and cancels the pending handshake coroutine, and checks connection generations before native BLE dispatch.
- Android stops setup when region initialization, partner-key readiness or device signing fails; cancellation remains distinct from failure.
- Disconnect and depair invalidate pending scans/connections so old work cannot resume them.
- The iOS podspec explicitly copies `PlaudDeviceBasicSDK.bundle`. Its containing SDK binary is static, so CocoaPods does not embed that framework's nested resources automatically.

Application behavior belongs in `apps/mobile/src/features/plaud-device` and its service adapter. Upstream's license declaration is retained; this copy does not grant additional rights. The Kotlin bridge compiled successfully on 2026-09-14 against the recovered Android SDK described below; physical Android acceptance is still pending.

The documented `android/libs/plaud-sdk.aar` is absent from this exact official upstream checkout, and its releases provide no binary. On 2026-09-14, a copy labeled SDK 1.0.13 was recovered from a public fork of the SDK repository and added at that path. Its pinned source, hash, compatibility checks, and provenance limits are recorded in [SDK_PROVENANCE.md](android/libs/SDK_PROVENANCE.md). This is a separately sourced binary, not a file from the official React Native checkout.

The old `https://github.com/Plaud-AI/plaud-sdk-public` repository returns HTTP 404 from GitHub's unauthenticated repository API at this check. That alone does not establish whether it was renamed, removed or made private.
