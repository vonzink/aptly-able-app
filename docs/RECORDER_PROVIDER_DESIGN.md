# Recorder providers: future device support

Recorded September 18, 2026 following the owner's interest in other recorder manufacturers and SDKs. Plaud remains the only external recorder provider currently implemented. This is an architectural direction, not a claim that another device is supported or a request to implement one now.

## Product boundary

Keep one shared iOS/Android app, recording library and Aptly Able server workflow. Each external recorder provider owns its native SDK integration, pairing/authentication, transfer, controls, permissions and vendor-specific cleanup. Phone microphone recording and file imports enter the same library without pretending to be Bluetooth recorder SDKs.

The future setup flow can select a supported manufacturer/model, show its setup instructions, then lead into the same recordings, titles, notes, playback and processing screens. Only offer providers actually compiled into that platform's app and enabled for use.

## Current boundaries and remaining coupling

- `apps/mobile/src/features/plaud-device/plaud-native-port.ts`, `plaud-file-port.ts` and `plaud-status-port.ts` separate native SDK calls from feature logic, but their events, identities and authentication are Plaud-specific.
- `apps/mobile/src/features/recorder/recorder-adapter.ts` describes the **mock** recorder. Its generic name is not evidence of a multi-provider production interface. Do not extend it as though it owns the real Plaud lifecycle.
- `packages/contracts/src/recorder-identity.ts` validates only Note Pro/NotePin S and Plaud serial prefixes. That validation belongs to the Plaud provider when another manufacturer is introduced.
- `apps/mobile/src/features/recordings/recording-model.ts` has a general audio import/library model, but device sources and deduplication use `PlaudRecordingSource` and numeric Plaud session IDs. Phone captures have separate ownership metadata.
- `apps/mobile/src/features/recordings/recording-server-port.ts` is an unconfigured server boundary and accepts a Plaud source. Generalize that input before adding another device's server delivery; do not duplicate uploads by manufacturer.
- Backend Plaud device operations and transcription integration live in separate modules. The recorder manufacturer must not automatically select the future transcription provider.

## Target responsibilities

| Shared app                                     | Recorder provider                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| Account, assignment and enrollment             | Cloud identity, bind/unbind and secure native handshake                             |
| Connection UX and normalized session state     | Discovery, secure identity matching, callback ordering, reconnect and teardown      |
| Library, labels, notes, playback and retention | Recording enumeration, stable source IDs, transfer and audio export                 |
| Progress, retry and user-readable errors       | SDK error mapping; distinguishing cancellation requested from workers stopped       |
| Optional controls and status UI                | Supported controls and normalized battery/storage values                            |
| Opt-in location policy and local storage       | Verified recording start/pause/stop signals; connection alone is not a start signal |
| Aptly Able upload/transcription jobs           | Audio metadata and any necessary local conversion                                   |

Prefer small connection, transfer, status and control interfaces over one large SDK facade. Select the provider in the app composition layer; shared recording screens should not repeatedly branch on manufacturer or import vendor SDK types.

## Capabilities and identity

Distinguish platform/model support from current permission, connection and readiness. Capabilities can include battery, storage, Bluetooth/Wi-Fi transfer, start/stop, pause/resume, recording-state events and firmware updates. Unsupported or unknown values must not render as zero battery/storage. Show controls supported by the selected model and explain temporarily unavailable actions.

Use an internal device ID plus a provider-qualified stable device identity. A serial number is appropriate for Plaud; another provider may use a different documented identifier. BLE addresses and discovery UUIDs must not become ownership keys. Preserve server ownership checks and keep one-use enrollment tokens separate from assignments.

Future recording origins should distinguish device capture, phone microphone and file import. Device origins need provider ID, stable device ID, provider recording ID and account ownership. Treat provider recording IDs as opaque strings, not necessarily numeric Plaud sessions. Namespacing prevents collisions; the server must validate identity against the authenticated assignment rather than trust client-supplied metadata.

## Audio and lifecycle

Providers return verified files with their actual container/MIME type, size and duration where known. Our library accepts MP3, WAV and M4A. Conversion must be explicit and localized; do not require every provider to use Plaud's MP3 encoder. The proposed Android WAV/PCM-to-M4A workaround fits this boundary without deciding the format for every future recorder.

Preserve temporary-file ownership, account isolation and cleanup after late callbacks. Do not delete files while vendor workers may still write. Unpair must report separately confirmed device/cloud release when the provider requires both. Adding another SDK does not justify weakening the existing Plaud safeguards. Recording location remains opt-in and local-only.

## Incremental implementation

1. Finish and verify Plaud. Keep codec work inside its adapter and new SDK types out of shared library/upload interfaces.
2. Select a second provider based on actual iOS/Android SDK availability, hardware, distribution terms, privacy/deletion behavior and native compatibility. Pairing in the manufacturer's own app does not establish third-party SDK access.
3. Derive the smallest shared contracts from both real integrations. Add a provider/model registry and explicit capability mapping; keep vendor details in each adapter.
4. Version and migrate stored identities, recording sources, dismissal/deduplication keys, assignments and enrollment payloads. Read legacy records as Plaud where their old schema establishes that. Merely prepending a provider string to keys could re-import dismissed recordings or break ownership/location associations.
5. Implement the second provider's adapters and backend binding hooks. Keep one active recorder session initially unless a separate requirement calls for simultaneous devices.
6. Run provider contract tests, migration checks and physical acceptance for each supported platform/model. Review every SDK packaged in the final app, even if a user never selects it.

No database, enrollment, saved recording identity, SDK or production behavior was changed by this decision record. Another manufacturer remains future scope.
