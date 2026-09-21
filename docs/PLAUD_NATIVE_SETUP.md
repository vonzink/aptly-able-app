# Aptly Able native Plaud setup

Target recorder: **Plaud NotePin S**, confirmed by the user. The app stays in this workspace and uses one Expo/React Native interface, a Swift bridge on iOS and a Kotlin bridge on Android. This is the physical-recorder milestone; automatic transcription is a separate optional service.

## Working SDK download

The official integration repository is available:

https://github.com/Plaud-AI/embedded-react-native

Its `modules/plaud-sdk` is copied into `apps/mobile/modules/plaud-sdk`, pinned to commit `31a3de0c3fe3f4c95142592e942449bf6db4122f`. It contains the iOS frameworks, their resource bundle, Swift/Kotlin bridges and TypeScript interface. See the local module's `UPSTREAM.md` for provenance.

The older `Plaud-AI/plaud-sdk-public` repository returned 404 during the original setup. **September 18 update:** it is now public, with a release labeled 1.0.57. The official AAR was downloaded separately and inspected; it still fails ARM64 codec alignment and is not a drop-in bridge replacement. See [current SDK intake and submission gates](verification/2026-09-18-submission-gates.md). The installed SDK below is unchanged.

**Android SDK recovered (2026-09-14):** the official integration repositories omit their documented Android binary. A copy labeled SDK 1.0.13 was downloaded from the public `JinpeiHan/plaud-sdk` fork, pinned to commit `c5111a44938b8739313dcb5f105f696c6af8ad8d`, and placed at:

```text
apps/mobile/modules/plaud-sdk/android/libs/plaud-sdk.aar
```

See [Android SDK provenance](../apps/mobile/modules/plaud-sdk/android/libs/SDK_PROVENANCE.md) for the source, checksum, and verification limits. `pnpm native:check:android` and the Kotlin bridge's `compileDebugKotlin` task pass. This establishes compile compatibility; physical pairing and recording transfer still require acceptance on an Android phone. The download is a public fork copy, not a newly confirmed official distribution. Keep the reviewed Gradle transitive dependencies with this version.

## Backend credentials

Pairing needs `PLAUD_CLIENT_ID` and `PLAUD_CLIENT_SECRET` from the same Plaud Developer Portal application. Add them to the existing ignored `apps/api/.env`, keeping its current database/development account values:

```dotenv
PLAUD_CLIENT_ID=<application client ID>
PLAUD_CLIENT_SECRET=<application client secret>
PLAUD_REGION=us
```

The API obtains a per-user JWT using the authenticated internal user UUID. The app requests this token at runtime after sign-in and passes it to the native SDK. Do not put a token, secret or API key in Expo public environment variables or source files. A transcription `PLAUD_API_KEY` can be added later; it is not required merely to initialize/connect the SDK.

The phone also needs to reach the API. `localhost:4100` on a physical phone points to the phone, not this Mac. The API retains its loopback listener. For temporary phone testing, [the explicit private-network development bridge](PHONE_DEVELOPMENT.md) makes that API reachable at this Mac's selected private IPv4 address, with the existing account/assignment checks. No public internet tunnel is configured. Android can alternatively use `adb reverse tcp:4100 tcp:4100` over USB when its tools are installed. Release builds need a reachable HTTPS API; their developer HTTP exception is disabled. The API URL is public configuration; the credentials are not.

## Native builds

Both platforms require a custom installed development build. The browser and Expo Go do not contain Plaud's native module. The iOS frameworks have no simulator slice; use a physical iPhone. The project's Expo/React Native dependencies currently raise the actual iOS build target to 16.4, even though individual Plaud SDK documentation lists lower minimums.

Xcode 26.6 is installed on this Mac. CocoaPods was installed for the native build. Expo generated:

- `apps/mobile/ios/AptlyAble.xcworkspace` after `pod install`.
- `apps/mobile/android` as the Android project.

Native projects are generated and ignored by Git. Put app settings in `apps/mobile/app.config.ts`; keep the reusable SDK module under `apps/mobile/modules`. Do not hand-edit generated build settings as the primary configuration.

From the workspace:

```sh
pnpm --filter @aptly/contracts build
pnpm --filter @aptly/api-client build
pnpm native:check:ios
pnpm --filter @aptly/mobile ios
```

The iOS command explicitly targets a physical device and may require Apple signing configuration. The Plaud Android AAR and Android development tools are now present on this Mac. With a physical Android phone connected and the local Android SDK environment configured as described in [Android setup](ANDROID_PREVIEW.md), run:

```sh
pnpm native:check:android
pnpm --filter @aptly/mobile android
```

Re-run `pnpm --filter @aptly/mobile exec expo prebuild` after native configuration changes. A JavaScript export, successful autolinking, native compilation and an actual recorder connection are different verification steps; see [verification](verification/NATIVE_RECORDER.md) for which steps passed.

## First physical connection

1. Configure the backend credentials and phone-reachable API.
2. In the administrator dashboard, assign the NotePin S's complete serial to the testing user and generate its enrollment invitation.
3. Open the invitation in Aptly Able, sign in and claim it. Assignments and one-use enrollment tokens remain separate records.
4. Open Recorder, allow Bluetooth access and scan. The app must match the complete assigned serial; the displayed last four digits are only a user-facing label.
5. Select Connect. The backend signs the assigned serial so a new device exists in Plaud's registry, then binds it to the signed-in user's Plaud identity. The native bridge subsequently establishes BLE and the secure handshake. Live cloud confirmations containing only a device ID are checked against the exact assigned serial's registry entry before proceeding.
6. Verify the app reports ready only after successful bind and handshake callbacks. Test Bluetooth off, permission denial, wrong recorder, connection timeout and interrupted setup as well.
7. Test Disconnect separately from Unpair. **Unpair before uninstalling the app or moving the recorder to another app.** Plaud binding can lock the recorder to the application; releasing it requires both cloud unbind and local BLE depair, not just disconnecting Bluetooth.

After secure connection, finished recordings transfer automatically to the local library while the app is active. Open **Recordings** to see transfer progress and play received MP3s. **Check for new recordings** requests another file list; **Import audio file** remains an optional outside-file action. Recorder originals are never deleted. Source identity is saved with each local file to avoid duplicate imports across reconnects/restarts. A removed local copy can be downloaded again from the retained recorder source.

Server upload and automatic transcripts are deliberately stubbed for this slice. `apps/mobile/src/features/recordings/recording-server-port.ts` defines the future API boundary; `src/services/recording-server.ts` explicitly remains unconfigured. Received recorder audio stays on the phone. Existing manual transcription for outside imports is unchanged. Background transfers, S3, server delivery and AI processing are separate work.

One app-level controller owns the native session, so Home and Recorder share live status and switching tabs does not disconnect Bluetooth. Signing out, changing the enrollment or tearing down the app provider clears the session; background/relaunch reconnection is not implemented. Normal unpair maps to `clear: true` on iOS and `clear: false` on Android, waits for a device confirmation, and disconnects even after failure/timeout. The UI retains separately confirmed cloud and device releases during a retry.

**Release limitation:** unpair before revoking the enrollment or ending its assignment. A revoked operation can release the original owner's cloud binding (unless the recorder is assigned to someone else), but cannot request a new native session to reconnect and confirm local device release. An administrator must restore a valid assignment/invitation before that reconnection; a dedicated release-only recovery flow is not implemented. Partial release is reported as incomplete, never as successful unpairing.

## References

- [Official React Native module and build instructions](https://github.com/Plaud-AI/embedded-react-native)
- [Plaud iOS SDK](https://docs.plaud.ai/plaud-embedded/ios-sdk)
- [Plaud Android SDK](https://docs.plaud.ai/plaud-embedded/android-sdk)
- [Native connection design](superpowers/specs/2026-09-11-native-recorder-design.md)
- [Transcription setup](TRANSCRIPTION.md)
