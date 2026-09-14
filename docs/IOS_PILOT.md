# iOS pilot archive and TestFlight handoff

By default, the command builds an **unsigned Release archive** for native iPhone hardware.
It checks compilation and bundles the current shared UI with the real Plaud Swift
module. It does not produce an installable IPA, upload to Apple, or change the
working phone app, provisioning profiles or native signing configuration.

An explicit `APTLY_IOS_DEVELOPMENT_TEAM` opts into local development signing and
allows Xcode to update provisioning profiles. This produces a signed app for the
devices in that team's development profile, not a TestFlight release. The command
never installs the app or uploads it to Apple.

## Compile the current pilot

```sh
EXPO_PUBLIC_API_URL=https://api.plaud.aptlyable.info pnpm ios:pilot
```

The API runs on a separate server. The website and installation page use Amplify
at `https://plaud.aptlyable.info`. Neither service is made live by this command.

Prerequisites are macOS, Xcode with iOS platform support, installed JavaScript
packages, the existing `apps/mobile/ios/AptlyAble.xcworkspace`, installed Pods,
and the real Plaud iOS framework. This script deliberately does not prebuild or
regenerate the working native project. If the workspace is absent, restore the
known working native project or prepare it in a separate checkout using the
project's iOS setup instructions; do not clean/recreate the working phone project
just to satisfy this script. If only Pods are missing, install from the existing
Podfile/lockfile with the project's compatible CocoaPods environment first.
The generated native Wi-Fi setting and entitlements must match the requested
variant; the script stops before compiling if they differ.

## Bluetooth-only iPhone development build

When the paid Apple team is unavailable, opt out of Wi-Fi transfer while keeping
Bluetooth pairing, automatic audio sync, device status and recorder controls.
Keep the same bundle identifier and development team as the installed phone app.
Do not uninstall it or change its pairing to switch build variants.

From the repository root, prepare the existing native project without cleaning it:

```sh
EXPO_NO_DOTENV=1 APTLY_IOS_BLUETOOTH_ONLY=1 APTLY_ANDROID_PREVIEW=0 \
  pnpm --filter @aptly/mobile exec expo prebuild --platform ios --no-install --no-clean
```

Then build, replacing `YOURTEAMID` with the existing team's 10-character ID from
Xcode (this is an identifier, not a secret):

```sh
APTLY_IOS_BLUETOOTH_ONLY=1 APTLY_IOS_DEVELOPMENT_TEAM=YOURTEAMID \
  EXPO_PUBLIC_API_URL=https://api.plaud.aptlyable.info pnpm ios:pilot
```

The config plugin removes only this feature's Wi-Fi entitlements and permission
descriptions from the generated iOS project. A native Info.plist setting disables
Wi-Fi entry points and tells the shared UI to hide Wi-Fi controls. Android retains
Wi-Fi transfer. The build verifies the resulting signature and Wi-Fi configuration;
this does not establish physical recorder behavior.

Use the `app` path from `.local/remote-pilot/ios-archive.json` to install on an
eligible connected iPhone through Xcode or `xcrun devicectl device install app`.
Personal Team profiles expire seven days after issuance; inspect the embedded
profile's actual expiry. Preserve the installed app's data by updating in place.

To restore Wi-Fi, run the same non-clean prebuild and build with
`APTLY_IOS_BLUETOOTH_ONLY=0` and a team that supports Hotspot Configuration and
Access Wi-Fi Information. Simply changing the JavaScript environment cannot
enable Wi-Fi in a Bluetooth-only native binary.

## Archive output and bundling

The script clears inherited public Expo variables and disables dotenv, sets only
the explicit HTTPS API origin and pilot auth mode, builds the shared packages,
and runs `xcodebuild archive` for scheme AptlyAble, configuration Release, generic
iOS destination. Without a development team, `CODE_SIGNING_ALLOWED=NO` and
`CODE_SIGNING_REQUIRED=NO` apply only to that command. JavaScript bundling is forced; the resulting bundle is checked
for the selected API origin. Native `.xcode.env` files must not override these
settings or embed credentials. Never put passwords, session tokens or Plaud server
secrets in an `EXPO_PUBLIC_*` variable.

Outputs are ignored local files:

- `.local/remote-pilot/ios-build.log`
- `.local/remote-pilot/ios/AptlyAble-<date>.xcarchive`
- `.local/remote-pilot/ios-archive.json` after successful validation
- `.local/remote-pilot/ios-report.md` for this run's evidence and limitations

Do not publish this archive in the website downloads. iOS testers install via
TestFlight once a separately signed build has been uploaded and made available.

## Apple account and distribution actions still required

1. Use an Apple Developer Program team with access to this app and App Store Connect.
   Confirm the team owns `com.aptlyable.mobile`; preserve the existing app identity.
2. In App Store Connect, create or select the app record for that identifier before
   upload. Complete any account agreements and required app information.
   [Apple app workflow](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-workflow).
3. Open the existing workspace in Xcode, select AptlyAble's app target and the
   intended team under Signing & Capabilities. Resolve distribution signing and
   provisioning for that team. These choices require the account owner; this task
   has not modified them.
4. Produce a fresh **signed** Release archive with the same pilot API/auth environment
   and bundled JavaScript. Do not use the unsigned script's signing overrides for
   that distribution archive. Use a unique build number if Apple already has the
   current number. In Organizer, validate and distribute to App Store Connect.
   [Apple distribution guide](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases).
5. Wait for Apple processing, resolve requested export-compliance/build information,
   and add the build to a TestFlight group. Internal testers must have appropriate
   team access. External testers require a group and the applicable TestFlight
   review approval before the build can be offered publicly.
   [Upload builds](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds),
   [TestFlight](https://developer.apple.com/testflight/).
6. Put the actual TestFlight invitation URL in the website's configured iOS download
   setting, rebuild the Amplify website package, and publish only after checking
   the invitation is usable. Keep unavailable-build copy until then.

## Physical acceptance

With the signed TestFlight build on a real iPhone: sign in with the website account,
return to the installation page after installation, open the fragment-token deep
link, claim the intended assignment, grant Bluetooth access, connect the NotePin S,
and verify handshake, recording transfer, playback and retention across restarts.
Check replaced/expired invitations and cross-account denial. Preserve the current
phone's recordings and pairing; do not uninstall or unpair to bypass an issue.
An unsigned archive compile cannot establish any of these physical-device results.
