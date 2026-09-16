# Location test builds — 0.1.2 (9)

Prepared September 16, 2026 on `codex/recording-location`.
Application source commit: `1542595861d1c2685ad9f5c2781d3da91ab307ce`.
The feature commit is pushed to that branch; `main` was not changed.
Both platforms use `com.aptlyable.mobile`, the real Plaud native SDK,
authenticated pilot mode and `https://api.plaud.aptlyable.info` in bundled JavaScript.
The read-only API readiness check returned `{"status":"ok"}`.

## Prepared artifacts

All paths below are relative to the repository root and ignored by Git.
Do not distribute signing files, provisioning credentials or the complete release directory.

| Artifact | Path | Installation scope |
| --- | --- | --- |
| Android APK | `.local/releases/0.1.2-build9/aptly-able-android.apk` | Standalone ARM64 Android pilot; no Metro needed |
| iPhone development IPA | `.local/releases/0.1.2-build9/ios-device/AptlyAble.ipa` | Devices allowed by the embedded development profile; the registered iPhone is included |
| iPhone TestFlight IPA | `.local/releases/0.1.2-build9/ios-testflight/AptlyAble.ipa` | Prepared for App Store Connect upload; not directly installable from a website |

The development-signed `.app` is available inside
`.local/remote-pilot/ios/AptlyAble-2026-09-16T20-17-00-011Z.xcarchive/Products/Applications/AptlyAble.app`.
The archive and exports preserve the existing Apple team `ADHWMMRYH8` and Wi-Fi/Bluetooth capabilities.
Both embedded provisioning profiles expire September 14, 2027; their future validity
also depends on the Apple account and certificates remaining valid.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Android APK | 55,234,703 | `9aecaffe7908dfcb9103d1365998f657c9d4f699ebda8401d3d748863ef6c224` |
| iPhone development IPA | 19,726,520 | `6a33d46b1969832e803bd516302cf27f2cd1e252618040317c01e4e8f1033bdf` |
| iPhone TestFlight IPA | 26,653,740 | `553b0169ae4d8fcfe020135d42841d713a95264c5058b8c172422460c9a85e59` |

## Verification

- Fresh `pnpm check`: 547 shared tests, 18 release-script tests, workspace
  typechecks, lint/import boundaries and production API/admin builds passed.
- Android native tests: 35 passed, zero failures/errors/skips. Swift location
  model/journal harness: 45 assertions passed.
- Android release assembly and APK signature verification passed. The certificate
  SHA-256 is `3cea36b39493aef7cfb4b8108a2683170bed9bce08ac1379611069493671cd66`,
  matching the preserved build 8 signer. Version code is 9, permitting an in-place
  update from build 8 without uninstalling or changing the signing identity.
- Compiled Android package contains the native Plaud/location code, private
  location foreground service with `stopWithTask=true`, location/notification
  permissions, no `ACCESS_BACKGROUND_LOCATION`, and disabled backup plus compiled
  cloud-backup/device-transfer exclusions. Optimized resource paths were resolved
  from the APK resource table before checking the exclusions.
- Signed iOS Release archiving and both local Xcode exports succeeded. Each IPA
  was extracted and its app signature verified with `codesign --verify --deep --strict`.
  Bundle identity/version, API URL, native location code, location purpose strings,
  `location`/`bluetooth-central` background modes and Wi-Fi entitlements were checked.
  The device IPA has development entitlements and a registered-device profile;
  the TestFlight IPA has `get-task-allow=false` and an App Store profile.
- Both iOS exports contain ten privacy manifests. Packaged Expo FileSystem and
  Expo Application manifests match the installed vendor declarations.
- Pilot builds intentionally have a `pilot` release marker and an empty store-only
  native API marker; their actual API URL is verified in bundled JavaScript.
  These are not `store` profile artifacts and no store-readiness flags were changed.

Logs, manifests, signature evidence and machine-readable verification are in
`.local/releases/0.1.2-build9/`. Previous local APK/signature metadata were preserved
there before new artifacts were built. Signing material remains in its original
private location and was not committed.

## Handoff and limits

No phone installation, website/backend deployment, TestFlight upload, tester
invitation or store submission occurred. The emulator preview is a different
package and does not validate Plaud hardware or this location capture path.

For Android, distribute only the prepared APK (and public build metadata if needed).
Install it over the existing pilot app; do not uninstall to work around a signature
or installation error. Publishing it at the existing website download URL is a
separate deployment step.

For the registered iPhone, the signed development app can be installed in place
using Xcode or `xcrun devicectl device install app` when the phone is ready. For
TestFlight, upload the distribution IPA, check Apple's processing/validation
result, then enable the build for the appropriate testers. No invitation code or
public testing URL has been generated for build 9.

Follow the [recording-location acceptance checklist](../RECORDING_LOCATION.md)
on real iPhone and Android hardware: opt-in/permissions, Plaud button events,
locked-screen start, pause/resume/stop, disconnect, force-close, local metadata,
Maps, deletion, account changes and battery impact. Existing vendor/privacy,
backup/erasure and store-review evidence remains open; successful signing and
export do not establish physical reliability or Apple/Google approval.
