# Standalone Android pilot

The real recorder build is `com.aptlyable.mobile`, uses the native Plaud module,
contains its JavaScript bundle, and needs no Metro server. It is signed with a
private local pilot key. The current artifact targets ARM64 Android devices.
The planned API origin is `https://api.plaud.aptlyable.info`; the website and APK downloads use Amplify at `https://plaud.aptlyable.info`.
The API runs on a separate server; hosting and DNS are a separate handoff. Building the APK does not make that service live.

## Build on this Mac

```sh
EXPO_PUBLIC_API_URL=https://api.plaud.aptlyable.info pnpm android:pilot
```

The script requires an explicit HTTPS origin without credentials, paths, query
or fragment. It clears inherited `EXPO_PUBLIC_*` variables, disables dotenv and
bundles only the selected API origin plus `EXPO_PUBLIC_AUTH_MODE=pilot`. No account
credential or Plaud server secret belongs in the app. Dependencies must already
be installed. It uses `.local/android-sdk` and macOS JDK 21 unless overridden.

The command checks the real Plaud AAR, builds shared packages, runs Android-only
`expo prebuild --platform android --no-install --no-clean`, and assembles a signed
release with bundled JavaScript. The signing plugin takes secrets only from the
Gradle process environment and rejects release tasks with missing signing data.
Debug builds retain their development signing configuration. `pnpm android:preview`
continues to opt into its separate preview package and simulated recorder module.

Outputs:

- `.local/remote-pilot/downloads/aptly-able-android.apk`
- `.local/remote-pilot/downloads/aptly-able-android.json` (SHA-256, origin, date, size)
- `.local/remote-pilot/android-signature.txt`
- `.local/remote-pilot/android-manifest.txt`

Only copy the APK and public metadata into the deployment download folder. Never
copy the signing directory into a web root, container image, source control or chat.

## Signing identity backup

The first build creates `.local/remote-pilot/signing/aptly-pilot.p12` and `password`.
The directory is mode 0700 and both files are 0600, under the ignored `.local/`
folder. Alias: `aptly-pilot`. Back up both files together in an encrypted offline
backup or approved secret vault before distributing the first APK. Test restoration
in a private directory and compare the signing certificate fingerprint with
`android-signature.txt`. Preserve this identity for all pilot updates; losing it
prevents in-place updates. If only one file exists, the script stops instead of
silently generating a replacement. Restore both original files and permissions.

If an existing normal app has a different signature, Android will reject an update.
Do not uninstall a tester's app to bypass that check: preserve recordings and
resolve signing identity/distribution with the owner. Increment version/versionCode
before publishing subsequent update releases.

## Acceptance still required

Emulator launch is packaging evidence only. Before inviting testers:

- Provision the HTTPS service and verify account signup, login and logout against it.
- Download/install from the hosted page on a physical ARM64 Android phone.
- Return to that browser page after install; Continue opens `aptlyable://enroll`
  with the invitation in the fragment, and the same account can claim it.
- Test expired/replaced invitation and cross-account denial on the phone.
- Grant Nearby Devices permissions; connect and complete NotePin S handshake.
- Transfer a real recording, play it, restart the app, and verify local retention.
- Verify denied permission/disconnect/reconnect paths without unpairing or deleting data.
- Confirm updates preserve recordings with this same signing key.

The public-fork SDK provenance and checksum are recorded in
`apps/mobile/modules/plaud-sdk/android/libs/SDK_PROVENANCE.md`; compilation is not
vendor distribution approval. iOS needs Apple signing and a real TestFlight upload,
a configured TestFlight URL, and separate physical-device acceptance.
