# iOS store packaging and distribution handoff

Implemented locally on 2026-09-15. Backed-up, non-clean store-profile prebuild and Pod installation succeeded. A five-minute bounded unsigned archive was attempted (exit 124); it stalled in ExpoModulesJSI and did not produce a verified archive. No signing, export or upload occurred.

`withStoreReadiness.cjs` runs last in Expo config. It removes unused FaceID usage text and records the store/native/API profile in generated Info.plist. Its final Xcode build phase copies the installed `expo-file-system` and `expo-application` manifests unchanged into their podspec-declared privacy resource bundles. This explicitly covers Expo precompiled-module packaging omissions. Missing source declarations fail the build; no reason codes are invented. Expo FileSystem's supplied manifest includes DiskSpace E174.1/85F4.1; verification compares the actual archived declarations against the installed source. The packaging phase also unions the SDK-supplied required-reason entries into the app’s main PrivacyInfo.xcprivacy, preserving the app’s own collection/tracking fields. The verifier rejects missing reasons in the main manifest. This follows [Expo’s privacy aggregation guidance](https://docs.expo.dev/guides/apple-privacy/); it does not invent reasons or provider declarations.

The ignored generated workspace now contains this build phase. A completed archive still must be inspected. Run non-clean iOS prebuild with the intended store environment and install Pods only when concurrent native work has stopped. `EXApplication` and `ExpoClipboard` registration was verified in the generated provider and installed Pods; build scripts reject their absence from Podfile.lock. Native runtime/physical checks remain separate.

## Explicit environment and commands

Set `APTLY_RELEASE_CHANNEL=store`, `EXPO_PUBLIC_AUTH_MODE=pilot` (the existing authenticated backend mode), `EXPO_PUBLIC_API_URL` and `APTLY_PRODUCTION_API_ORIGIN` to the same owner-approved public HTTPS API origin. Do not use the marketing website as API origin. Set `APTLY_IOS_BLUETOOTH_ONLY` consistently with the intended production entitlements.

- `node scripts/ios-store.mjs archive --unsigned` prints a command plan and readiness blockers; it does not build.
- Add `--execute` to create an unsigned structural archive explicitly. Incomplete owner/vendor evidence still makes final verification fail; an output archive is not submission readiness.
- `node scripts/ios-store.mjs archive` plans a signed archive using existing Xcode signing. It never selects a team, changes signing, installs profiles or allows provisioning updates. Execution requires the owner to have configured distribution signing beforehand.
- `node scripts/verify-ios-store.mjs /absolute/path.xcarchive --unsigned` inspects unsigned structure; omit `--unsigned` for strict signature and distribution-entitlement checks.
- `node scripts/ios-store.mjs export --archive /absolute/path.xcarchive --export-options /absolute/path/ExportOptions.plist --export-path /absolute/output` plans a local export. The owner-supplied plist must use `method=app-store-connect`, `destination=export`, `signingStyle=manual`, the intended `teamID` and a `provisioningProfiles` mapping for `com.aptlyable.mobile`. Add `--execute` only when approved to export. No upload command exists.

Each executable build command has a 20-minute timeout. Xcode can leave nested descendants on failure; inspect only the exact task's process tree before cleanup, never kill unrelated Xcode sessions. Script execution is local-only. Real Apple validation and checking the exported IPA/profile remain required; an archive check does not assert App Store acceptance.

## Remaining blockers and primary evidence

Hermes 250829098.0.17 has no supplied manifest in the inspected installation/archive. The [official Hermes repository](https://github.com/facebook/hermes) recursive main tree at commit `378a5f023e51ec88f4ffdf4d48efe2fae51553fc` had no privacy-named path on 2026-09-15. No legitimate version-matched vendor declaration was obtained; no stub was added. Verification fails until an appropriate vendor package provides a manifest in the archived Hermes framework or identifiable Hermes resource bundle. Presence alone cannot establish vendor origin/signature; retain provenance and Xcode upload validation.

[Apple's third-party SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/) explicitly list Hermes. [Apple's manifest documentation](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files) describes SDK packaging; a generic app declaration is not vendor evidence.

Plaud is not itself named on that list, so missing Plaud manifests alone are not called an automatic rejection. Store checks still require an actual vendor assessment record: exact Basic/BLE/Wi-Fi versions, required-reason usage, repackaged listed SDKs/signatures, network destinations, retention/erasure and distribution permission. `apps/mobile/store-readiness.json` must reference this record with `providerEvidencePath`; an arbitrary boolean is insufficient evidence. Reviewers must assess the document's accuracy.

The JSON also requires confirmed legal/contact/public URLs and explicit `privacyPolicyReviewed`, `providerPrivacyReviewed`, `providerErasureVerified`, `backupRetentionReviewed`, and `hardwareReviewVerified`. Pending values block distribution. Existing public privacy content does not establish that the recorder/audio/Plaud flow is disclosed accurately; complete owner review before changing the flag.

## Local verification

`node --test scripts/tests/ios-store.test.mjs` exercises hostile release profiles, missing archive resources, development entitlements, byte-preserving vendor-resource copying, unsigned versus distribution boundaries, and rejection of upload/automatic export paths. Workspace TypeScript, ESLint and boundaries pass. Five packaging fixture tests pass. No native build success is claimed.

The verifier was also run read-only against existing `AptlyAble-2026-09-15T02-51-19-380Z.xcarchive` with the audit's API origin as a diagnostic expected value. It correctly returned exit 1: pending owner/vendor flags, missing provider evidence, stale release markers, remaining FaceID string, both missing Expo privacy bundles, and missing Hermes. It enumerated the archive's eight existing manifests. This validates diagnostic behavior against a real archive, not the new generation/build output.

## Native attempt evidence

- Backup before generation: `.local/app-store-readiness/native-before-second-pass.tgz` (ignored; Pods/build excluded).
- Successful generation: `.local/app-store-readiness/native-generation.log`.
- Successful Pod install: `.local/app-store-readiness/pod-install.log`; EXApplication 57.0.2 and ExpoClipboard 57.0.1 added, 113 total pods.
- Bounded unsigned attempt: `.local/app-store-readiness/unsigned-store-build.log`; Xcode 27.0 (27A266a), generic iOS device destination, signing disabled. The build reached ExpoModulesJSI’s shell phase, where a child xcodebuild process remained in an exiting state. Sampling that child failed; this does not identify an application compiler error. Older exiting Xcode processes were already present.
- Restarting the Mac before a fresh attempt is the next practical local recovery step; do not reuse a partial archive, falsify a framework cache hash, bypass the vendor build step or change SDK privacy assertions to force a passing check. Native compilation, signing, physical testing and Apple validation remain separate.
