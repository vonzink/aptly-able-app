# Native recorder implementation

Implement the approved device connection goal in this repo. Preserve local recordings, transcription and enrollment behavior. No commits, production deployment, external messages or unrelated repository changes.

1. Pin/install the official Expo native module, preserve SDK attribution, configure Bluetooth and inspect iOS/Android dependency readiness.
2. Add separate backend SDK sessions and owned cloud bind/unbind operations. Decouple SDK credentials from the optional transcription key. Add typed contracts/client methods and tests.
3. Add the real recorder controller and phone-build screen with exact assigned-device matching, secure-handshake readiness and cloud/BLE unpairing. Retain explicit browser simulation separately.
4. Validate owned routes/provider calls and native event behavior; run workspace checks and native discovery/build checks. Document actual evidence and any external blockers.

Independent backend and mobile implementation can run in parallel under the parallel-agent workflow while root owns SDK installation, Expo configuration, integration and verification. The user has approved the existing app/assignment design and explicitly prioritized native connection; no additional design-approval question is needed.

## Implementation status

Steps 1–3 are implemented locally. Workspace tests/builds, database integration tests, native discovery and JavaScript exports passed. Source review corrected native cancellation, handshake prerequisites, platform unpair flags and explicit iOS resource copying. See [verification](../../verification/NATIVE_RECORDER.md) for final build evidence and limits.

Physical acceptance remains open: backend Plaud credentials and a phone-reachable API are absent; Android additionally needs the genuine SDK AAR and Android toolchain. Do not equate completed application code or unsigned compilation with a successful recorder pairing.
