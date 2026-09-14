# Recorder features — source implementation, September 14, 2026

## Scope and evidence

Approved: battery/storage, Wi-Fi transfer, recording controls, firmware Coming soon. Implemented
in the shared phone app with Swift and Kotlin adapters. This continues the no-testing cleanup.
Source and installed SDK interface/bytecode signatures were inspected. **No tests, type checks,
lint, format checks, builds, simulator runs, phone checks, installs, or deployments were run.**
These are implementation notes, not evidence of working phone behavior. Previous build/test
results predate this change and do not validate it.

## Implemented in source

- Recorder status: battery percentage/charging and recorder free/total storage, with unknown
  readings preserved as unknown. Battery at or below 20% and storage at or above 90% used have
  warnings. Status refresh waits during a transfer or command, preserving prior readings and
  refreshing afterward. These are recorder readings, not phone-storage readings.
- Device controls: start, stop, pause, resume; state updates follow SDK events. Commands subscribe
  before dispatch, match recording session IDs where available, and have a confirmation timeout.
  If a recording was already active when reconnecting, pause/resume are omitted until its session
  is known; stop is still available. An uncertain command returns to unknown state for reconciliation.
- Wi-Fi: explicit receive action, pending-file counts and current-file progress, a connection
  timeout, cancel, and Bluetooth retry. Android uses the connected recorder serial for the pinned
  SDK’s `startWifiTransfer(sn, callback)`, confirmed by inspecting that artifact’s parameter contract. Requesting Wi-Fi during Bluetooth work finishes the current
  file before changing transports. No duplicate transfer worker is introduced.
- Both transports use the existing source identity, duplicate/dismissed-entry checks, and library
  import/retention behavior. Library copy/metadata persistence must complete before counting a file
  as received. Files already received remain saved when a later transfer fails or is cancelled.
- Wi-Fi session cleanup runs on success, failure, cancellation, connection loss, background,
  unpairing, SDK reinitialization, and destruction. iOS inactive permission sheets are allowed;
  actual app backgrounding detaches sync. Native helpers own in-flight exporters until callbacks
  settle; stopping the network does not release that ownership prematurely.
- Recording controls, disconnect, and unpair UI are disabled while the shared operation is busy.
  Unpair is also disabled while recording/paused. Receiving a physical record-start/pause event
  closes an active Wi-Fi session; recording takes precedence over initiating another transfer.
- Firmware is a static Coming soon card. No firmware check, download, or update call is exposed.
- Wi-Fi permissions/entitlements are declared in authored configuration. No native workspace was
  regenerated and no installed app or distributed artifact changed.

## Separation of concerns

`PlaudDeviceScreen.tsx` composes `PlaudDeviceStatus`, `PlaudRecorderControls`,
`PlaudWifiTransferCard`, and `PlaudFirmwareCard`. Each component reads shared controller state.
`plaud-sync-controller.ts` owns the single operation lane, batch scheduling, and library boundary;
`recorder-command.ts` owns acknowledgement/timeout handling; `plaud-sync-model.ts` defines the UI
snapshot. `plaud-files.native.ts` adapts optional native capabilities for older builds.

The Swift Wi-Fi helper and Kotlin Wi-Fi/actions helpers own vendor callbacks, hotspot lifecycle,
and native exporter exclusion. Android keeps the existing pairing prerequisites and vendor SDK
artifact. The dashboard/backend and server-upload stub are unchanged; Wi-Fi receives locally and
does not upload to Aptly Able or configure the recorder's separate cloud auto-sync feature.

## Deferred acceptance, in order

1. Run workspace static checks and focused regressions: SDK commands rejected/timed out, late
   callbacks, queued Wi-Fi, cancellation while opening/exporting/persisting, recording events during
   transfer, corrupt-library protection, duplicate avoidance, and owner/foreground transitions.
2. Compile both bridges against the vendored artifacts. Regenerate iOS native configuration from
   `app.config.ts`; enable Hotspot Configuration and Access WiFi Information in the Apple signing
   setup/profile if required. Preserve the existing bundle/package IDs and signing identities.
3. On physical iPhone and Android with NotePin S: read battery/storage/charging; start/stop and
   pause/resume; reconnect to an already active or paused recording. Confirm callback status values,
   session identity, model support, and UI recovery after an unsupported/failed command.
4. Exercise Wi-Fi allow/deny, Wi-Fi off, timeout, no pending files, large files, multiple files,
   queueing during Bluetooth export, cancellation at each stage, background/foreground, disconnect,
   app restart, and switching accounts. Verify normal Wi-Fi/internet restoration after every exit.
   Confirm the SDK terminates exports after cancellation. A stalled exporter intentionally blocks
   further commands/transfers until it settles; the source does not promise recovery without restart.
5. Check export decoding, actual disk growth, native SDK partial-file cleanup, duplicate suppression,
   phone cache limits, Download to phone, audio reload, and deletion. Confirm that no recorder files
   are deleted by these actions. Validate health refresh after recording and Wi-Fi completion.
6. Prepare signed app updates only after those checks. Neither the public Android APK nor any
   iPhone build currently includes these source changes. The emulator preview still simulates the
   recorder; it cannot validate these hardware features.

Durable server upload, automatic device transcripts, dashboard device telemetry, and firmware
installation remain future work. This pass does not establish production readiness.
