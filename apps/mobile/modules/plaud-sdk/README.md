# plaud-sdk (local Expo module)

Native bridge to Plaud's device SDK on **iOS and Android** — the React Native counterpart of
the Capacitor `PlaudSdk` plugin. Exposes BLE scan/connect, on-device file listing, and audio
export to JS, plus battery/storage, recording controls, Wi-Fi sessions, and device events.
The September 14 recorder-feature additions are source-only and have not been compiled or accepted on hardware.

Both platforms share JS event names and payload shapes (`src/PlaudSdk.types.ts`).
Optional capabilities are checked by the platform adapters before use.

| | iOS | Android |
|---|---|---|
| Native source | `ios/PlaudSdkModule.swift` | `android/src/main/java/expo/modules/plaudsdk/PlaudSdkModule.kt` |
| Vendored SDK | `ios/Frameworks/*.xcframework` (3) | `android/libs/plaud-sdk.aar` |
| Registered by | `expo-module.config.json` → `apple.modules` | `expo-module.config.json` → `android.modules` |
| SDK entry point | `PlaudDeviceAgent.shared` | `sdk.PlaudDeviceAgent` (Kotlin object) |

## How it's wired

**Autolinked** — Expo scans `./modules` during prebuild, so there are no Podfile, Xcode,
`settings.gradle` or `build.gradle` edits to make by hand on either platform.

- **iOS** — the SDK ships as three precompiled `.xcframework`s (`PlaudBleSDK`,
  `PlaudDeviceBasicSDK`, `PlaudWiFiSDK`) vendored by `PlaudSdk.podspec`
  (`vendored_frameworks`). CocoaPods embeds and code-signs them automatically.
- **Android** — the SDK ships as `android/libs/plaud-sdk.aar`, consumed by
  `android/build.gradle` via `api files('libs/plaud-sdk.aar')`. Its native
  `.so` libraries (`libopus`, `liblame`, `libjni_ogg`, …) are inside the AAR and are packaged
  automatically for all four ABIs.

### ⚠️ The AAR's dependencies are declared by hand

`plaud-sdk.aar` is a **bare AAR — it carries no POM**, so Gradle cannot resolve its transitive
dependencies. Every library its bytecode touches is listed explicitly in
`android/build.gradle` (Retrofit, OkHttp, Gson, Java-WebSocket, BouncyCastle, Conscrypt,
Timber, slf4j + logback-android, Guava, coroutines). Miss one and the app compiles fine, then
dies at runtime with `NoClassDefFoundError`. **If you replace the AAR, re-derive that list.**

### Permissions

- **iOS** — `NSBluetoothAlwaysUsageDescription` and `UIBackgroundModes: bluetooth-central`
  live in the app's `app.config.ts` under `ios.infoPlist`. Wi-Fi adds Local Network and
  Wi-Fi-identification usage descriptions plus Hotspot Configuration and Access WiFi Information
  entitlements. Regenerate native configuration and the signing profile in the later build session.
- **Android** — the Bluetooth/location permissions are declared in the AAR's own manifest and
  reach the app through manifest merging. They must still be
  *granted at runtime* on Android 12+: `startScan()` requests them itself and rejects with
  `ERR_PLAUD_PERMISSIONS` if denied. `PlaudSdk.requestPermissions()` (Android-only) is
  available if you'd rather prompt earlier. The module manifest additionally declares Wi-Fi
  state/change and Nearby Wi-Fi Devices. `startWifiTransfer()` requests the API 33+ nearby
  Wi-Fi permission together with the SDK's existing location/Bluetooth prerequisites.

## ⚠️ Physical device only

Both platforms need real Bluetooth hardware and a **dev build** (not Expo Go — this is custom
native code):

- iOS: the frameworks are **arm64, iOS 15+, device-only**, with no simulator slice —
  `npx expo run:ios --device`.
- Android: `npx expo run:android` on a physical handset. An emulator has no BLE radio, so
  scanning emits `scanTimeout` with `reason: "bluetoothNotPoweredOn"`.

Where the module isn't linked (web, iOS simulator), `isAvailable` is `false` and every
`PlaudSdk` method rejects.

## Usage

```ts
import { PlaudSdk, isAvailable } from 'plaud-sdk';

if (isAvailable) {
  await PlaudSdk.initSDK({ userAccessToken, customDomain: 'platform-us.plaud.ai', userId });
  const sub = PlaudSdk.addListener('scanResult', ({ devices }) => { /* ... */ });
  await PlaudSdk.startScan();   // Android: prompts for BLE permissions first
  // ...later: sub.remove();
}
```

## Platform differences

Some capabilities and payload fields differ because the two native SDKs do:

- **`getDeviceStatus()`** — implemented in iOS and Android source. Requests `getChargingState()`
  and `getStorage()` on the SDK. Promise resolution only confirms dispatch; `batteryState`
  and `storageState` contain the actual readings. Storage is in bytes and battery is 0–100.
  Power-only events omit charging state. The Android implementation was added during the
  no-testing cleanup on September 14, 2026; it has not been compiled or tried on a phone.
  The shared UI reports unavailable readings when this optional method is absent in an
  installed binary; emulator preview readings are simulated.

- **`PlaudScanDevice.uuid`** — the CoreBluetooth peripheral UUID on iOS, the **MAC address**
  on Android. Either way it's the stable identifier you pass back to `connectBleDevice`, so
  `connectBleDevice({ uuid })` works unchanged on both.
- **`PlaudScanDevice.supportWiFi`** — iOS only. Android's scan payload has no Wi-Fi capability
  flag, so it is always `false` there.
- **`PlaudPenState`** — Android's `blePenState` callback carries only `state`, `privacy`,
  `keyState` and `uDisk`; `findMyToken` / `hasSndpKey` / `deviceAccessToken` are iOS-only and
  optional in the type.
- **`PlaudFile.duration`** — Android's `BleFile` has no `duration()`, so it's computed from
  file size and channel count (exact for raw Opus). For OGG-contained recordings it is a
  slight **over-estimate**: the Android SDK's `calculateOggDuration` needs page geometry
  (header size, frames-per-page) that it never exposes.

Android's `BleFile` also carries no `sn` / `channels` / `isOgg` of its own — those are
properties of the connected device, so the module reads them from the device it connected to,
which is what the SDK itself does when decoding.

### ⚠️ Android's connect handshake has prerequisites iOS handles internally

The Android SDK leaves three steps to the caller, and skipping any of them looks the same from
JS: the scan finds the device, `connectBleDevice()` resolves, then `connectState` reports
`failed`. The module does all three — don't "simplify" them away:

1. **`initSDK` must repoint the Partner API.** `sdk.network.PartnerRetrofitClient` hardcodes
   `https://platform-jp.plaud.ai` and does *not* follow `customDomain`, so a `platform-us`
   token 401s on gen-key, the RSA key pair never arrives, and every handshake after it fails.
   The module calls `NiceBuildSdk.getPartnerApiManager().updateBaseUrl("https://$customDomain")`
   before `PlaudDeviceAgent.initSDK`.
2. **`connectBleDevice` must wait for `NiceBuildSdk.isPartnerDataReady()`** (10 s cap) —
   `initSDK` fetches those keys over HTTP, asynchronously.
3. **…then `NiceBuildSdk.signAndStoreDeviceSn(deviceType, sn)`** — the handshake reads the
   stored `snSignature`. `deviceType` comes from the SN prefix (`881` notepro, `880` notepin,
   `882` notepins, else `note`).

## Not ported from the Capacitor plugin

`readFile` / `putBinary` — those existed only to work around WKWebView CORS when Capacitor
loaded a remote origin. React Native has no WebView/CORS constraint: read exported files with
`expo-file-system` and upload with `fetch`.


## Recorder actions and Wi-Fi (source only, September 14)

- `controlRecorder({command, sessionId?})` dispatches start/stop/pause/resume. Its promise means
  dispatch only; the shared `recorder-command.ts` waits for the matching recording callback and
  times out after 15 seconds. The current session must be known for pause/resume.
- `startWifiTransfer()` opens the recorder hotspot and resolves only after Wi-Fi handshake and
  file-list preparation. Opening has a 90-second deadline. iOS uses `PlaudWiFiAgent`; Android
  uses `startWifiTransfer(connectedRecorderSerial, callback)` (the pinned SDK parameter is `sn`,
  not an app user ID) and the nested `IWifiTransferAgent.WifiTransferCallback` types in
  the pinned artifact. Android's scan `supportWiFi: false` is not a feature gate.
- `exportAudioViaWifi({sessionId})` produces MP3 in the same `PlaudExports` folder as Bluetooth.
  The shared controller supplies identity/deduplication, persistence, and temporary-cache rules.
- `stopWifiTransfer()` closes the transport. It does **not** mean a pending exporter has settled.
  Both native helpers retain export ownership until the SDK's terminal callback, including on
  cancellation. If that callback never arrives, the app leaves the lane occupied; it does not
  start overlapping exports. Reopen/reconnect recovery and SDK partial-file cleanup need hardware acceptance.
- Helpers: `ios/PlaudWifiTransfer.swift`, Android `PlaudWifiTransfer.kt` and `PlaudRecorderActions.kt`.
  The UI has no direct SDK calls, hotspot credentials, or firmware update methods.

No tests, compiler, type checker, native build, emulator, phone, signing change, or deployment was
run for this feature pass. Installed app binaries are unchanged. See
[`docs/audits/2026-09-14-recorder-features.md`](../../../../docs/audits/2026-09-14-recorder-features.md)
for the deferred acceptance work.
