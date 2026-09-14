# Plaud capability review — app and dashboard

Reviewed September 14, 2026. This is a source/documentation review, not hardware acceptance. The user requested that tests and builds remain paused. Recommendations below are proposed work unless explicitly labeled as implemented in source.

## What is available now

The project uses one Expo/React Native app with a Swift bridge and a Kotlin bridge. The installed iOS frameworks expose `PlaudDeviceAgent` and `PlaudWiFiAgent`; the recovered Android SDK exposes `sdk.PlaudDeviceAgent` and a Wi-Fi agent. Existing source supports assignment/enrollment, authenticated pairing/unpairing, recording-list reads, MP3 transfer, playback, local retention, and recording-state events.

Battery, charging, and storage were already connected through the iOS bridge. This cleanup adds equivalent Android methods/events to the existing shared status controller. **The Android addition is source-only and unverified.** An existing installed APK does not acquire these methods until rebuilt and installed. Emulator preview values are simulated.

Device audio still ends at the local library. `apps/mobile/src/services/recording-server.ts` is explicitly unconfigured. The separate imported-audio transcription API already requests automatic language detection and speaker diarization; it does not make device recordings automatically upload. Hosting the dashboard does not complete that integration.

## Approved feature pass

The user subsequently approved battery/storage, Wi-Fi transfer, recording controls, and a firmware
**Coming soon** placeholder. These now have source implementations in the phone app; none has been
built or exercised in this pass. See [implementation and deferred acceptance notes](audits/2026-09-14-recorder-features.md).
Firmware checking, firmware installation, and dashboard telemetry remain unimplemented.

## Capability roadmap

| Priority | Addition | App placement | Dashboard placement | Evidence and implementation gap |
| --- | --- | --- | --- | --- |
| 1 | Device health and actionable diagnostics | Recorder: battery, charging, free storage, last successful sync, permission/connection guidance | Per assignment: latest reported readings, observation time, app version, sync failure category | Battery/storage reads exist in both installed SDK interfaces. Android bridge parity and low-battery/nearly-full warnings are implemented in source. Server reporting and dashboard health fields are not implemented. |
| 1 | Honest transfer progress | Recordings: queue count, current file, receiving/preparing/saving stages, retry | Last successful receive/upload and pending/failed counts | Current `exportProgress` supplies a percentage; our app has no separate preparation stage. Native stage support needs a version check before exposing it. A percentage reaching 100 must not imply that the app has saved or backed up audio. |
| 1 | Durable upload and automatic transcripts | Recording detail: waiting for upload, uploaded, processing, complete, failed; retry after restart | Operational upload/processing status, with appropriately scoped transcript access | Application/backend work using the existing `RecordingServerPort` and transcription service. This is the most important missing part of the intended workflow. SDK audio export alone does not provide our server retention or retry guarantees. |
| 2 | Wi-Fi fast transfer | An optional action for large recordings or a backlog | Transfer outcome and failure history, if reported by the phone | Both installed SDKs expose Wi-Fi export/session methods. Swift/Kotlin Wi-Fi helpers and the shared import flow are now implemented in source. Includes a connection deadline, cancellation cleanup, queued Bluetooth-to-Wi-Fi switching, and an explicit Bluetooth retry. Validation on each physical platform/model remains pending. |
| 2 | Firmware version and update availability | Recorder details, initially read-only | Version inventory and available-update notice with last-checked time | The app now shows a Coming soon card only. Both installed facades expose firmware checking, but it is not wired. Check results would need to be reported by the app; there is no dashboard firmware inventory today. Installation should be a separate later feature. |
| 3 | Start/stop and pause/resume | Explicit controls on Recorder, with visible recording state | Display a recent reported state only | Both installed facades expose recording controls; source now dispatches commands, confirms matching callbacks, and serializes commands with transfers. Pause/resume require a known current recording session. Physical-device acceptance remains pending. Do not add remote dashboard recording controls as a side effect of telemetry. |
| 3 | Important-moment bookmarks | Timeline markers that seek to a moment and can be included with AI input | Markers alongside an authorized recording/transcript | Installed iOS interfaces contain marking callbacks. Android parity and model behavior are not established by this review; this remains a capability investigation. |
| Later | Microphone gain and recorder preferences | Advanced recorder settings with model-supported ranges | A summary of reported settings where useful | Gain read/write exists in both installed facades. Keep controls out of the default setup flow until their ranges and persistence are verified. |

The current [iOS SDK guide](https://docs.plaud.ai/plaud-embedded/ios-sdk) documents Wi-Fi transfer through the recorder hotspot and requires the iOS Hotspot Configuration entitlement. It also says the Wi-Fi session must be closed on success, failure, and cancellation. Treat faster transfer as a measured benefit, not a promised completion time.

The [Android SDK guide](https://docs.plaud.ai/plaud-embedded/android-sdk) documents battery/storage callbacks, transfer stages, Wi-Fi operations, and firmware callbacks. Wi-Fi Fast Transfer and the recorder's own Wi-Fi auto-sync configuration are separate features. Configuring auto-sync does not establish that the recorder can upload to Aptly Able's server or S3.

Plaud's [firmware documentation](https://docs.plaud.ai/plaud-embedded/ios-sdk#firmware-update-ota) warns that updates erase device recordings. **Do not enable installation or automatic device-file deletion until a durable, recoverable backup exists.** A temporary phone cache is insufficient. Recovery/reset should not be ordinary dashboard actions either.

## Dashboard architecture

The dashboard should consume our API. The paired phone collects Bluetooth readings; AWS cannot directly reach a remote recorder over Bluetooth. A cloud binding record proves an ownership association, not that a recorder is currently nearby, charged, or connected.

Add a device-health boundary alongside assignments, not inside `enrollment_tokens`. Proposed fields: assignment ID, authenticated reporter, observed time, server receipt time, battery/charging/storage, firmware and app versions, last completed receive/upload, queue counts, and a normalized failure code. Store unknown values as null. Expired readings should say when they were observed rather than show a permanent green connected badge.

The phone must send bounded reports on connection, completed sync, state changes, and a throttled refresh. The API should validate ownership against the current assignment, reject old-assignment reports, and enforce idempotency. Raw SDK logs, credentials, and transcript text do not belong in these health reports. Keep the latest snapshot separate from any bounded diagnostic history.

Suggested additions, when implemented:

```text
packages/contracts/src/device-health.ts
apps/api/src/modules/device-health/
  routes.ts
  service.ts
  repository.ts
apps/mobile/src/features/device-health/
  device-health-controller.ts
  device-health-port.ts
apps/mobile/src/services/device-health-client.ts
apps/admin/src/features/device-health/
  DeviceHealthPanel.tsx
```

Expand the native module through small capability-specific adapters. Do not put SDK calls, retry timers, or server writes into `PlaudDeviceScreen.tsx` or the dashboard component. Keep firmware and Wi-Fi session lifecycles separate from the enrollment controller. Our Android scan payload currently hardcodes `supportWiFi: false` because the vendor scan model lacks that field; it must not be treated as proof that Android Wi-Fi transfer is unsupported.

## Source evidence and limits

- Shared native contract: `apps/mobile/modules/plaud-sdk/src/PlaudSdk.types.ts`.
- Implementations: `ios/PlaudSdkModule.swift` and `android/src/main/java/expo/modules/plaudsdk/PlaudSdkModule.kt` under that module.
- Status and sync behavior: `apps/mobile/src/features/plaud-device/plaud-status-controller.ts`, `plaud-sync-controller.ts`, and their service adapters.
- Server integration boundary: `apps/mobile/src/features/recordings/recording-server-port.ts`; current stub: `apps/mobile/src/services/recording-server.ts`.
- Transcription options: `apps/api/src/modules/transcription/plaud/index.ts`.
- Installed iOS API evidence: the ignored `PlaudDeviceBasicSDK.swiftinterface` under `ios/Frameworks/…/Modules/PlaudDeviceBasicSDK.swiftmodule/`.
- Android evidence: the existing `.local/plaud-native-research/android-candidate/JinpeiHan/public-api.txt`. This was read; additional static javap reads of the same installed artifact informed the approved feature pass. The underlying artifact is pinned in `sdk-artifacts.json`; provenance is in `android/libs/SDK_PROVENANCE.md`.

The Android artifact came from a pinned public fork. Its method inventory and the current vendor documentation are evidence of available APIs, not proof of NotePin S behavior on a particular firmware. The [advanced iOS guide](https://docs.plaud.ai/plaud-embedded/advanced-ios-sdk) and [advanced Android guide](https://docs.plaud.ai/plaud-embedded/advanced-android-sdk) recommend keeping the high-level facades as the main integration path. Use low-level methods only for verified gaps.

Next order: validate the source changes and approved recorder features on both physical platforms, implement durable server upload/reconciliation, then add dashboard health reporting. Bookmarks, firmware features, and advanced preferences remain separate future work.
