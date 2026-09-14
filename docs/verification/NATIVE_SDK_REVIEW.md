# Native Plaud connection source review

Reviewed 2026-09-11 for the NotePin S connection milestone. This is a source review of the official module pinned at `31a3de0c3fe3f4c95142592e942449bf6db4122f`, the new controller, native configuration, and the vendored Swift interfaces, followed by read-only inspection of the final iOS build log and packaged resources. No pairing, cloud mutation, hardware operation, or broad test run was performed by this reviewer. The final unsigned iOS device build succeeded after the native and resource fixes below. Android compilation remains blocked by the missing genuine Plaud AAR.

The findings below describe the initially reviewed source. Implementation owners are addressing them concurrently; the disposition section records subsequent review.

## Findings

### R1 — Android can connect after cancellation or account change (P1, definite source defect)

`apps/mobile/modules/plaud-sdk/android/src/main/java/expo/modules/plaudsdk/PlaudSdkModule.kt:194-224` captures a device/user token, launches a coroutine, and waits in `prepareHandshake` before issuing the native connect. `disconnect` at lines 227-232 only calls the SDK's disconnect function. Initialization and depair likewise do not cancel the suspended connect. Only module destruction cancels the whole coroutine scope.

Reproduction sequence from source: start connect while partner keys are pending; sign out or cancel, which calls disconnect; let partner preparation finish. The old coroutine still calls `PlaudDeviceAgent.connectBleDevice` with the captured old device/token. The controller's JavaScript generation checks only ignore promises/events; they cannot prevent this native side effect. This also permits an old connection's events to enter a replacement session.

Minimal correction: retain the active connect job and a connection/session epoch. Invalidate both on replacement initialization/connect, disconnect, depair, and destruction. Check the captured epoch and coroutine activity immediately before the SDK connect, including after signing returns. Settle cancelled promises consistently and do not swallow cancellation in general exception handling.

### R2 — Native scan cancellation is incomplete (P2, definite source defect)

Android `PlaudSdkModule.kt:159-183` requests permissions and unconditionally starts scanning when the eventual callback succeeds. `stopScan` at lines 186-191 sets a boolean that the permission callback never checks. Cancelling or changing accounts while the permission sheet is open therefore allows a later permission grant to start the old scan.

iOS `apps/mobile/modules/plaud-sdk/ios/PlaudSdkModule.swift:144-169` uses a shared `isScanning` boolean for delayed Bluetooth-readiness retries. Stop followed by a new start before an old 300 ms retry runs makes that old retry active again; both retry chains can dispatch scans. The timeout path also leaves that flag true.

Minimal correction: use a distinct monotonically increasing scan epoch captured before permissions/polling begin; invalidate on stop, session replacement, disconnect, depair, and destruction. Both Android callback/posted work and iOS delayed work must check their captured epoch before dispatch. Clear scanning state at timeout and ignore obsolete scan emissions.

### R3 — Normal unpair has different platform flags (P2, confirmed documentation mismatch)

`apps/mobile/src/features/plaud-device/plaud-device-controller.ts:440` calls `native.depair({ clear: true })`; `plaud-native-port.ts:36` requires the literal `true`, and the shared native adapter forwards it unchanged. Current [Android SDK documentation](https://docs.plaud.ai/plaud-embedded/android-sdk.md#depair-unbind-a-device) specifies `false` for ordinary unbind and reserves `true` for stale bond recovery. Current [iOS documentation](https://docs.plaud.ai/plaud-embedded/ios-sdk.md#depair-unbind-a-device) specifies `true` for normal unbind.

Minimal correction: expose a semantic normal-unpair operation in the application port and map its flag in the platform adapter. Keep recovery separate. Actual effects of the incorrect Android flag on the NotePin S are hardware-unverified; the argument mismatch itself is confirmed.

### R4 — Failed or timed-out depair leaves native connection active (P2, definite cleanup gap)

Controller `plaud-device-controller.ts:435-467` preserves cloud/device release confirmations, which is useful, but its partial-failure branch only publishes an error. It does not guarantee disconnect. The [Android SDK's depair guidance](https://docs.plaud.ai/plaud-embedded/android-sdk.md#depair-unbind-a-device) requires a bounded callback wait followed by disconnect even if confirmation never arrives.

Minimal correction: always close the BLE connection after a depair attempt, while retaining the two release confirmations. Use the resulting disconnected state to offer the appropriate reconnect/release retry. Do not report device release from the depair dispatch promise or disconnect callback; only a successful depair callback confirms it.

### R5 — Revoked enrollment has no path to complete device release (P2, definite application flow gap)

Controller `plaud-device-controller.ts:477-501` invalidates the native session and resets the assignment when enrollment status changes. `canScan` at lines 293-300 requires pending enrollment. The approved API contract likewise permits session creation only for a pending operation. The error text still offers original-recorder unpairing, and `unpair` is permitted, but its device branch requires an active BLE connection. A revoked owner can release the cloud association and then cannot reconnect through this application to confirm device release.

Minimal correction requires an explicit product/backend choice: either provide an original-owner, release-only session/scan path that rejects a recorder actively reassigned to someone else, or mark physical release recovery as unavailable for revoked enrollment and document the remaining work. Do not broaden ordinary bind authorization merely to make recovery work.

### R6 — Android continues after handshake prerequisites fail (P2, definite source error handling gap)

`PlaudSdkModule.kt:433-441` finishes its readiness loop at the ten-second deadline without checking that keys arrived, then ignores both exceptions and a false result from serial signing. `initSDK:139-141` similarly ignores failures while setting the partner region. These are documented prerequisites in the [Android SDK connection flow](https://docs.plaud.ai/plaud-embedded/android-sdk.md#connect-to-a-device). The bridge can resolve connect dispatch after known preparation failure and lose the actionable cause; the controller then waits for a generic failure or timeout.

Minimal correction: reject initialization if regional setup fails; reject connect before BLE dispatch if partner data remains unavailable or signing fails. Preserve coroutine cancellation. This does not establish that the underlying SDK accepts an insecure handshake; the observed bug is dispatching despite failed prerequisites and concealing the reason.

### R7 — Static iOS framework resources are omitted from the application (P2, confirmed packaging defect)

The original `apps/mobile/modules/plaud-sdk/ios/PlaudSdk.podspec:24-30` declared only `vendored_frameworks` and claimed the nested basic-SDK resource bundle would be embedded automatically. Independent `file` inspection confirms `PlaudDeviceBasicSDK` is a static `ar` archive, while `PlaudBleSDK` and `PlaudWiFiSDK` are dynamic arm64 libraries. Linking the static archive does not copy its framework directory. Root's original built-app inspection found the two dynamic frameworks but no `PlaudDeviceBasicSDK.bundle`.

The nested bundle exists in the vendored source and contains its `Info.plist`, English localization, and Simplified Chinese localization. The corrected podspec explicitly declares this exact existing bundle under `s.resources` at line 31, preserving its name and internal localization directories. Its comments now distinguish static linking from dynamic framework embedding. This is the appropriate narrow source correction and follows the local iOS SDK skill's explicit bundle-resource installation requirement. Missing bundle behavior during a real SDK session was not tested; this finding does not claim it necessarily prevents pairing.

## Checks that did not produce findings

- Initialization uses the per-user token, domain-only regional hostname, and the authenticated app user identifier. Android includes the upstream region override and serial-prefix signing steps.
- The controller subscribes before scanning, matches the assigned serial and supported model prefix, and requires cloud bind plus successful matching `bind`, BLE connection, and `penState` events before readiness. The [iOS callback documentation](https://docs.plaud.ai/plaud-embedded/ios-sdk.md#plauddeviceagentprotocol) defines `penState` as post-handshake; no particular numeric pen-state value is a separate success code.
- The controller removes all six event subscriptions on invalidation/disposal and keeps partial unpair confirmations separately. `depair` status zero, not dispatch resolution, confirms device release.
- Android destruction conditionally removes its global listener so it does not detach a replacement module's listener. The vendored iOS `PlaudDeviceAgent` interface declares its delegate weak; there is no source evidence for a delegate retain-cycle claim. Native destruction still needs to cancel outstanding native work as part of R1/R2.
- iOS Bluetooth purpose/background configuration is present. Simulator support and Android hardware operation cannot be inferred from JavaScript tests or autolinking. The separate packaging finding is recorded as R7.

## Disposition after implementation review

Focused source re-review of the concurrent owner changes confirms:

| Finding | Current disposition | Source evidence |
| --- | --- | --- |
| R1 | Addressed in source; Android compilation/hardware still blocked | Android bridge retains `connectJob`, invalidates `connectionEpoch`, calls `ensureActive`, and checks the captured epoch before SDK connect. Cancellation rejects with `ERR_PLAUD_CANCELLED`. |
| R2 | Addressed for the reported delayed-work races | Android checks its captured scan epoch at both permission callback and main-thread dispatch. iOS delayed readiness retries carry a scan epoch and clear scanning on timeout. |
| R3 | Addressed in source | Application port exposes `unpair()`; `plaud-native.native.ts` maps normal unpair to `clear: Platform.OS !== 'android'`. |
| R4 | Addressed in source | Controller runs bounded disconnect from a `finally` after native unpair, retains both release confirmations, and removes event subscriptions after the attempt. |
| R5 | Explicitly deferred recovery limitation for this milestone | Revoked enrollment may cloud-unbind, but cannot obtain a new BLE session or scan to complete physical release. A new valid invitation/enrollment is required before this application can attempt reconnection. Ordinary session/bind authorization remains restricted. |
| R6 | Addressed in source; Android compilation/hardware still blocked | Android initialization exceptions reject with sanitized `ERR_PLAUD_INIT`; readiness timeout, absent serial, and false/failed signing reject before BLE dispatch. `ensureActive` runs before and after signing, and connect distinguishes cancellation from setup failure. |
| R7 | Addressed in source and verified in the rebuilt application | `PlaudSdk.podspec:31` lists the existing bundle under `s.resources`; the final `AptlyAble.app` contains its `Info.plist` and both localization files, with bundle identifier `com.plaud.PlaudDeviceBasicSDK`. |

The final iOS build includes the Swift scan-epoch and podspec resource changes: `.local/plaud-native-research/xcode-build.log:28179` contains `BUILD SUCCEEDED`, and root reported process exit zero. Independent read-only inspection confirms `.local/plaud-native-research/DerivedData/Build/Products/Debug-iphoneos/AptlyAble.app/PlaudDeviceBasicSDK.bundle/` contains `Info.plist`, `en.lproj/Localizable.strings`, and `zh-Hans.lproj/Localizable.strings`; `plutil` confirms bundle identifier `com.plaud.PlaudDeviceBasicSDK` and platform `iPhoneOS`. This supersedes the earlier pre-fix build caveat. These are compilation and packaging results, not installation, signing, or physical connection evidence. No application source or native bridge was edited by this reviewer.

`apps/mobile/modules/plaud-sdk/UPSTREAM.md` now documents the local Swift/Kotlin modifications separately from the preserved upstream wrapper, build declarations, and binary frameworks.

The native controller is owned by the recorder screen hook. `use-plaud-device.ts:38-42` schedules teardown on actual screen unmount, and `recorder-lifecycle.ts:14-19` cancels disposal when React immediately replays effect setup. Actual disposal invalidates callbacks and queues native scan-stop/disconnect. The connection therefore does not intentionally survive recorder-screen unmount in this milestone; returning to the screen requires reconnection. A tab switch that retains the mounted screen is not equivalent to unmount. This is a source-level lifecycle statement, not hardware-tested background connection behavior.

The final controller refinement was also read: connect rechecks session expiration before cloud binding or native dispatch, and unpair cleanup rechecks the current job after awaiting disconnect before changing connection state. Revoked-enrollment messages now explicitly describe cloud-only release and the need for valid enrollment before reconnection. The mobile implementation owner reports 31 focused tests and typecheck passing; this reviewer did not repeat those runs.

## Evidence locations

- Design: `docs/superpowers/specs/2026-09-11-native-recorder-design.md`.
- Provenance: `apps/mobile/modules/plaud-sdk/UPSTREAM.md` and upstream module `README.md`.
- iOS interface: `apps/mobile/modules/plaud-sdk/ios/Frameworks/PlaudDeviceBasicSDK.xcframework/ios-arm64/PlaudDeviceBasicSDK.framework/Modules/PlaudDeviceBasicSDK.swiftmodule/arm64-apple-ios.swiftinterface:1151-1236`.
- Resource correction: `apps/mobile/modules/plaud-sdk/ios/PlaudSdk.podspec:24-31`; bundle source: `apps/mobile/modules/plaud-sdk/ios/Frameworks/PlaudDeviceBasicSDK.xcframework/ios-arm64/PlaudDeviceBasicSDK.framework/PlaudDeviceBasicSDK.bundle`.
- Live official documentation retrieved read-only on 2026-09-11. Review copies: `/tmp/aptly-native-review-docs/{ios-sdk,android-sdk,advanced-ios-sdk,advanced-android-sdk,react-native}.md`. Android normal-unpair guidance is at lines 340-350; iOS normal-unpair guidance is at lines 288-292.
