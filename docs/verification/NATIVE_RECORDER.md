# Native NotePin S connection verification

Date: 2026-09-11. Scope: the existing Aptly Able app, its official Plaud native module, owned backend SDK sessions, and recorder connection/unpair UI. The user confirmed **Plaud NotePin S**. Work is local and uncommitted; no deployment, live Plaud call, device binding or hardware recording operation was performed.

## Implemented

- Shared Expo/React Native app with the official Swift iOS and Kotlin Android bridge, pinned to upstream `31a3de0c3fe3f4c95142592e942449bf6db4122f`. Local native fixes are listed in `apps/mobile/modules/plaud-sdk/UPSTREAM.md`.
- Backend capabilities, per-user SDK token acquisition, and owned cloud bind/unbind. Client ID/secret enable SDK use independently of the optional transcription API key. The server derives identity, serial, region and supported model; the client submits only the owned operation ID.
- Exact assigned-serial scan matching, matching successful bind callback, BLE connection and secure-handshake callback are all required for ready state. Dispatch promises alone do not establish connection.
- Cancellation, account/enrollment changes, expired session recovery, bounded waits, temporary disconnect, and partial cloud/device release handling. Native unpair flags differ by platform. Disconnect follows depair even on failure/timeout.
- Recorder is native by default; browser/Expo Go show the phone-build requirement. Explicit `mock` config retains the existing simulation. Existing local recordings, playback, imported transcripts and automatic-transcription code remain available.

## Executed checks

| Check                                       | Result and boundary                                                                                                                                                                                                                                                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                | Passed: workspace TypeScript, ESLint/import boundaries, **258 unit tests**, and contracts/API-client/API/admin builds. Includes **31 native-controller tests** with a fake native event port; these are not hardware tests.                                                                                      |
| `pnpm format:check`                         | Passed; changed final Home copy and checker script also passed scoped formatting/lint. Vendored module is excluded from automatic formatting/lint; local native patches received separate source review.                                                                                                         |
| `TEST_DATABASE_URL=… pnpm test:integration` | **28 passed** against temporary PostgreSQL schemas, including owned session/bind/unbind, revocation/reassignment and concurrency behavior. External Plaud provider responses are fixtures.                                                                                                                       |
| Compiled API runtime smoke                  | Passed: migrations/seed, roles, assignment/QR, claim/recovery, revocation/release, with temporary schema cleanup.                                                                                                                                                                                                |
| `pnpm --filter @aptly/mobile export`        | Passed final iOS, Android and web JavaScript/assets export. This does not compile an APK or IPA.                                                                                                                                                                                                                 |
| Expo native autolinking                     | Discovers `PlaudSdkModule` on Apple and `expo.modules.plaudsdk.PlaudSdkModule` on Android.                                                                                                                                                                                                                       |
| iOS native build                            | Unsigned generic physical-iPhone build passed after the Swift scan fix. Final resource-copy rebuild verification is recorded below.                                                                                                                                                                              |
| Android native build                        | Not attempted: genuine `android/libs/plaud-sdk.aar` and Android SDK/platform tools are missing. `pnpm native:check:android` fails with the exact missing binary path.                                                                                                                                            |
| SDK file preflight                          | iOS framework binaries and source resource bundle are present. This is only a presence check; actual app packaging is checked separately.                                                                                                                                                                        |
| Expo package version check                  | Online `expo install --check` recommends newer patch releases and exits 1. Existing pins were retained; the workspace has a 1440-minute release-age guard. Offline installed-SDK comparison reports up to date, with Expo's warning that offline validation is less reliable. No claim of latest-version parity. |
| Local API after restart                     | `/health/ready` returns 200. `/v1/plaud/capabilities` and `/v1/transcription/capabilities` return `not_configured`, consistent with absent Plaud credentials.                                                                                                                                                    |
| Browser, 390 × 844                          | Native Recorder requirement renders without overflow; its enrollment button opens `/enroll`; recording library remains reachable at `/recordings`. No JavaScript errors observed. Browser cannot verify native Bluetooth.                                                                                        |

The source review is in [NATIVE_SDK_REVIEW.md](NATIVE_SDK_REVIEW.md). Review found native cancellation/prerequisite issues and differing unpair flags; these were corrected. Final bundle inspection also found that the static Basic SDK's nested resource bundle was not automatically copied by CocoaPods; the podspec now explicitly declares it as a resource.

## iOS build evidence

Toolchain: Xcode 26.6, CocoaPods 1.17.0. The resolved Expo app target is iOS 16.4. Generated native projects stay ignored; source configuration remains in Expo config and the local SDK module.

```sh
xcodebuild -workspace apps/mobile/ios/AptlyAble.xcworkspace \
  -scheme AptlyAble -configuration Debug -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -derivedDataPath .local/plaud-native-research/DerivedData \
  CODE_SIGNING_ALLOWED=NO SKIP_BUNDLING=1 build
```

This compiles and links the native app without signing or embedding a production JS bundle. JavaScript exports are checked separately. It does not install the app, validate provisioning, exercise an SDK initialization token or prove a physical recorder connection.

Final resource-copy build: **passed** (`BUILD SUCCEEDED`). Inspected `AptlyAble.app/PlaudDeviceBasicSDK.bundle`: Info.plist, `en.lproj/Localizable.strings` and `zh-Hans.lproj/Localizable.strings` are present. Ble/WiFi dynamic frameworks are embedded; Basic SDK is statically linked. This confirms packaging, not runtime hardware behavior.

Evidence retained locally under ignored `.local/plaud-native-research/`: `workspace-check.log`, `integration.log`, `expo-export.log`, `pod-install.log`, `xcode-build.log`, autolinking output, SDK hashes, and derived native app. Browser capture: ignored `output/playwright/native-recorder/recorder-web.png`. No tokens or credentials are included in this report.

## Remaining acceptance and limits

1. Configure backend Plaud client ID/secret and a phone-reachable authenticated API. Current development identity is deliberately loopback-only and has not been exposed publicly. The API key is needed only for transcription.
2. Install/sign on a physical iPhone, claim an invitation for the real full NotePin S serial, and verify actual discovery, binding, handshake, disconnect, reconnect and both unpair confirmations. No hardware step has passed yet.
3. Obtain the compatible Android AAR from Plaud, install the Android toolchain, compile and repeat acceptance on physical Android hardware. Source review/autolinking do not replace Android compilation.
4. Unpair before revoking an enrollment or ending an assignment. A revoked enrollment can request original-owner cloud release, subject to reassignment checks, but cannot obtain a new Bluetooth session. A new valid enrollment is required for reconnection; release-only recovery is deferred. The UI reports partial release as incomplete.
5. Native controller lifecycle is tied to the mounted Recorder screen; actual unmount disconnects Bluetooth while retaining binding. Persistent background connection and device file import/export are not integrated into the library yet. Enrollment setup operations remain pending; no server-side hardware-completion endpoint or persisted connection attestation was added.
6. QR continuation through installation, verified HTTPS app links, production authentication/hardening, store distribution and live transcription acceptance remain separate work.

## Follow-up: backend credentials verified

On 2026-09-11 at approximately 16:58 UTC, after the user saved their Plaud client ID and client secret locally, the real provider adapter successfully requested both the partner token and a per-user SDK token from the configured US Plaud endpoints. Both returned HTTP 200. Tokens were kept transient and were not printed or written to this report. No recorder bind/unbind or transcription request was made.

The local API was restarted with the saved configuration. `/health/ready` returned 200 and `/v1/plaud/capabilities` returned `{ "available": true, "reason": "ready" }`. This supersedes the initial absent-credentials result above. Transcription remains unconfigured without its separate API key. Phone-reachable API setup, signed device installation and real NotePin S pairing remain open.

## Follow-up: iPhone installation preparation

On 2026-09-11 at approximately 17:02 UTC, the user's iPhone was paired, Developer Mode was enabled, and developer disk image services were available. The earlier device-preparation issue was no longer present. The app was not already installed under `com.aptlyable.mobile`.

A signed Debug build was attempted for the connected device using the existing Apple Development identity, its matching team, and Xcode automatic provisioning. Apple rejected Xcode's saved account login, and no matching development provisioning profile was available. The build exited 65 before installation. The account must be signed in again in Xcode before retrying; no app was installed and no account credentials were changed by the assistant. The prior successful unsigned compilation remains valid evidence for the native code, not for installation.

The signing failure is recorded above; the ignored `.local/plaud-native-research/xcode-signed-build.log` holds the most recent build attempt and is superseded on retry. No Plaud credential or user token was printed. Phone API connectivity and actual recorder pairing remain open.

## Follow-up: signed build and iPhone installation succeeded

On 2026-09-11 at approximately 17:09 UTC, after the user signed back into Apple Accounts in Xcode, the signed Debug build succeeded. `codesign --verify --deep --strict` passed. The development provisioning profile matches `com.aptlyable.mobile`, includes the connected iPhone, and expires on 2026-09-18; another development build/provisioning refresh will be needed after expiration.

`devicectl device install app` succeeded, and a separate device app query confirmed **Aptly Able 0.1.0 (1)** under the expected bundle ID. The development preview server was restarted in LAN mode on port 8088 and responds on the Mac's private network address. The authenticated API remains on loopback port 4100; changing the preview server does not make that API reachable from the phone.

The first launch was denied by iOS with its code-signature/entitlements/developer-trust error. The local signature and matching provisioning checks passed, so the next check is manual developer trust on the iPhone. Do not claim app UI startup, API connectivity, Bluetooth initialization or physical pairing from successful installation alone.

Local evidence: `iphone-install.json`, `iphone-install.log`, `iphone-installed-app.json`, `iphone-launch.json`, `iphone-launch.log` and the latest `xcode-signed-build.log`, all under ignored `.local/plaud-native-research/`.

## Follow-up: app launch and private-network API connectivity verified

The user approved developer trust and confirmed the Aptly Able home screen on the iPhone. `devicectl` subsequently launched the app successfully, and Metro served the native iOS bundle to its connected React Native runtime.

A temporary development bridge now listens on this Mac's explicitly selected private IPv4 address, forwarding to the unchanged loopback API. The bridge rejects wildcard/public/nonlocal addresses and production mode. Shared API clients support an exact private HTTP origin opt-in; the mobile app supplies it only in development builds. The ignored mobile environment contains public addresses only. See [phone development](../PHONE_DEVELOPMENT.md) for startup, limits and shutdown.

Verification of this addition:

- `pnpm check` passed: typechecks, lint/import boundaries, **291 unit tests** and workspace builds. The 33 added client tests cover explicit opt-in, exact host/port matching and rejected origins for all three API clients.
- `pnpm format:check` passed. The bridge rejected `0.0.0.0`, a public IP, and production mode in direct command checks.
- Requests through the private bridge returned health 200, unauthenticated session 401, authenticated session 200 for the expected existing user, and admin access 403 for that ordinary user. Plaud capabilities returned ready. User credentials were loaded transiently from the ignored API environment and not printed.
- A bounded diagnostic evaluated inside the **physical iPhone's actual React Native runtime** received HTTP 200 from the private API's `/health/ready`, and confirmed `PlaudSdk.startScan` exists on the native Expo module. The temporary diagnostic property was removed afterward. This was a network/module-presence check; it did not initialize the SDK, scan, bind, depair or inject an enrollment.

The native diagnostic result is saved at ignored `.local/plaud-native-research/phone-api-runtime.json`; full workspace output is in `phone-network-check.log`. Earlier inspector attempts encountered an Origin-header rejection, a Node dependency-resolution error and a runtime timeout. The final foreground runtime check succeeded; no Bluetooth pairing was attempted by these diagnostics.

Next acceptance requires the actual NotePin S serial, its assignment/enrollment, then physical scan/bind/handshake and unpair testing. The USB cable can be disconnected for this development workflow, but the phone/Mac must stay on the same private network and the Mac/API/bridge/Expo processes must stay running. Standalone operation with a hosted production API remains future work.

Setup instructions: [PLAUD_NATIVE_SETUP.md](../PLAUD_NATIVE_SETUP.md).

## Follow-up: native enrollment destination and app icon

The first real recorder invitation used `http://localhost:8088/enroll`, which targets the browser preview on the Mac and the phone's own localhost when scanned on an iPhone. The ignored local API configuration now uses `aptlyable://enroll`. Configuration validation allows only this exact native destination outside production; HTTPS and existing local browser destinations retain their behavior. Tokens remain in URL fragments. The dashboard's native invitations instruct the user to scan with their phone and omit the Mac-targeted **Open setup** action. Existing QR images must be replaced to use the new destination; see [phone enrollment](../PHONE_DEVELOPMENT.md).

Before any enrollment claim or setup operation, the active local recorder ending **5641** was found to have model `notepro` even though its serial starts with `882` and the user identified it as a NotePin S. Its model was corrected to `notepins` in a guarded transaction while preserving the recorder, assignment and invitation. An audit event records the correction; a subsequent authenticated API read confirmed the NotePin S model, active assignment and unclaimed invitation. The transaction rejected changed ownership/status or existing claims/setup rather than altering an in-progress pairing. No hardware bind occurred.

The user also requested and approved the logo app icon. The shared Expo icon now references `apps/mobile/assets/app-icon.png`, a square opaque adaptation of the existing blue a/elephant logo. The source and generation prompt are documented in [the asset notes](../../apps/mobile/assets/README.md). The source is 1254 × 1254; Expo generated an opaque 1024 × 1024 iOS app icon, inspected visually. Both platform configurations inherit this shared icon; Android compilation remains unavailable as described above.

Verification:

- The new native-destination config and HTTP QR tests failed before the validation change and then passed. `pnpm check` passed with **294 unit tests**, typechecks, lint/import boundaries and all workspace builds. The subsequent dashboard hint change and icon configuration passed their relevant builds/typecheck, lint and formatting checks.
- The API restarted successfully with the native enrollment destination, and the private network health endpoint returned 200.
- iOS prebuild regenerated the native project and icon. The first build could not find the workspace before CocoaPods installation; `pod install` restored it, and the signed device build then returned **BUILD SUCCEEDED**. Strict code-signature verification passed. The built app retained the `aptlyable` URL scheme and the Plaud Basic SDK resource bundle.
- The updated app installed successfully on the physical iPhone under the same `com.aptlyable.mobile` identifier. No app data was uninstalled or cleared.
- Reopening the updated app was denied because the iPhone was locked (`FBSOpenApplicationErrorDomain`, code 7). The user must unlock and reopen Aptly Able; launch/runtime verification of this updated build is pending.

Phone-camera scanning of a replacement QR, invitation acceptance and actual recorder pairing still require the user's next test. The app icon update and a registered native link are not hardware-pairing evidence.

## Follow-up: first physical pairing attempt and cloud compatibility

The user opened the replacement invitation on the iPhone and accepted enrollment for the NotePin S ending **5641**. The database confirms a pending setup operation and `enrollment.claimed` event. Screenshots show the installed app's recorder screen with a generic setup error after attempting connection; the development element inspector visible in an earlier screenshot is separate from that error.

The failure was reproduced through the owned enrollment API and the real Plaud provider. Partner and user-token requests returned 200, but `/sdk/bind` returned 404 with `detail: Not Found`. The URL matches Plaud's published API; its [binding reference](https://docs.plaud.ai/api-reference/device-binding-api/bind-device) defines 404 as an unknown device serial. The same serial's registry lookup also returned 404.

A bounded call to the SDK's documented [`sn-sign` endpoint](https://docs.plaud.ai/plaud-embedded/advanced-ios-sdk#plaudpartnerapimanager) returned a signature. A subsequent registry lookup changed to 200 with `is_bind: null` and an empty binding history. This establishes the missing first-device registration prerequisite for this recorder. The provider now signs the server-owned serial before cloud binding; the native SDK still obtains its own signature and verifies its encrypted BLE handshake. No RSA private keys or signatures are stored by the API.

The next live bind returned 200, but its body was `{ device_id, is_bind }`, rather than the `{ type, sn, is_bind }` example in the published schema. The provider now accepts either form. For an opaque `device_id`, it looks up the exact owned serial and requires both the same device ID and the requested binding state before returning success. Any present type/serial fields must still match. Unbind uses the same response validation but never signs/registers the device. Raw vendor failures remain private; the mobile controller now preserves the API client's curated error message instead of replacing every failure with a generic connection error.

Verification:

- Regression tests reproduced the unseen-device 404 before the registration fix, the live-response rejection before compatibility handling, and the masked mobile error before the presentation fix.
- `pnpm check` passed with **306 tests**, workspace typechecks, lint/import boundaries and builds. Tests include empty/missing signatures, documented and live bind/unbind responses, mismatched device IDs/states, and contradictory serial/model fields. Scoped formatting checks passed.
- The local API was rebuilt and restarted. The real owned `POST /v1/plaud/device-bind` then returned **200** and `{ status: 'bound' }` at 18:19:56 UTC on 2026-09-11. Registry ownership and exact-device response validation passed. No physical BLE-handshake success has been recorded yet.
- These changes are server/JavaScript only; the installed native build and logo remain usable without another reinstall. No enrollment was revoked or replaced and no device was unpaired during this investigation.

Sanitized evidence is under ignored `.local/plaud-native-research/`: `pairing-provider-trace.json`, `pairing-registry-before.json`, `pairing-first-device-sign.json`, `pairing-bind-response-trace.json`, `pairing-api-after-registration.json`, and `first-recorder-pairing-check.log`. The user has been asked to search/reconnect again so the native handshake can be observed separately from cloud binding.

## Follow-up: shared Home connection status

The user subsequently reported successful pairing and recording a conversation. A read-only check of the physical iPhone's native `PlaudSdk.isConnected()` returned `true`. Hardware audio transfer remains unimplemented; the existing import action selects an audio file already on the phone.

Home still displayed a hardcoded orange instruction to connect through the phone app, regardless of pairing. It now subscribes to the same app-level native controller as Recorder. Switching tabs does not dispose the SDK session. Home shows green only after the controller's complete secure handshake, uses the assigned recorder model, and updates after disconnect, sign-out or enrollment changes. A partial unpair and mock simulation never appear as a normally connected physical recorder. Session disposal remains tied to app-provider teardown; no background/relaunch reconnect behavior is implied.

Verification:

- `pnpm check` passed with **307 tests**, typechecks, lint/import boundaries and workspace builds. Controller tests cover Home's readiness across every handshake callback order, subscriber changes, disconnect, sign-out, enrollment revocation, simulation and partial unpair. The final unpair-progress copy adjustment passed the 33 targeted controller tests and scoped formatting.
- Expo exported iOS, Android and web JavaScript bundles successfully. This does not resolve the previously documented Android native build limitation.
- The browser Home page rendered a neutral phone-connection notice and its View recorder action; a visual check confirmed the stale orange banner was removed. The physical iPhone's native SDK still reported `connected: true` after editing. The updated green Home banner and tab switching on the physical phone remain user acceptance checks.
- No reinstall, enrollment change, hardware unpair or native rebuild was performed.

Local logs: `.local/plaud-native-research/home-recorder-status-check.log` and `home-recorder-status-export.log`.
