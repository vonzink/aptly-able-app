# Native NotePin S connection

The user has confirmed a Plaud NotePin S and prioritized the installed iOS/Android app connecting to it. Keep the existing Expo/React Native app, with Plaud's Swift and Kotlin native module beneath a typed recorder feature. A full rewrite as two applications duplicates the existing library/enrollment work; a browser-only connection cannot use these native SDKs. This extends the previously approved assignment/enrollment design.

First native milestone: sign in, recover/claim the assigned recorder enrollment, request a per-user SDK session, scan for the exact assigned serial, explicitly cloud-bind and connect, wait for the secure handshake, and provide disconnect plus proper cloud/BLE unpairing. Real connection is never inferred from the dispatch promise or BLE-connected callback alone. Generation/transcription is separate. Device file sync follows physical connection acceptance.

SDK source: official `Plaud-AI/embedded-react-native`, pinned at `31a3de0c3fe3f4c95142592e942449bf6db4122f`. This checkout contains three iOS arm64 XCFrameworks and native Swift/Kotlin bridges. It does not contain the documented Android AAR, and has no release assets. The older `plaud-sdk-public` endpoint returns an unauthenticated GitHub API 404. Preserve provenance, expose the missing Android dependency clearly, and do not substitute an unrelated binary.

Backend SDK configuration needs only PLAUD_CLIENT_ID and PLAUD_CLIENT_SECRET, plus the configured region. PLAUD_API_KEY additionally enables transcription. Per-user tokens are obtained by the backend using the authenticated stable internal user UUID. Tokens never appear in logs, persistent mobile storage, source or build-time public environment variables. Keep existing development identity checks and loopback listener restrictions.

Public API:

- GET `/v1/plaud/capabilities`: `{available:boolean,reason:'ready'|'not_configured'|'storage_unavailable'}`.
- POST `/v1/plaud/device-session` body `{operationId:uuid}`: `{userAccessToken:string,expiresAt:iso,customDomain:'platform-us.plaud.ai'|'platform-jp.plaud.ai',userId:uuid,recorder:{serial:string,model:'notepro'|'notepins'}}`.
- POST `/v1/plaud/device-bind` same body: `{status:'bound'}`.
- POST `/v1/plaud/device-unbind` same body: `{status:'unbound'}`.

All POSTs authenticate the actor and look up the operation joined to its assignment/recorder. Session/bind require the owned pending operation and active assignment; unbind permits the same original owner to release a revoked setup as well, while avoiding release of a recorder now actively assigned to another user. The browser/client does not choose the upstream owner, domain, serial or recorder model. Existing assignments and one-use enrollment tokens remain separate concepts.

A dedicated device controller consumes native events and the typed backend client. It registers listeners before scanning, excludes unsupported/wrong-serial devices, uses bounded scan/handshake waits, cancels stale work on account/enrollment changes, and distinguishes temporary disconnect from unpair. Bind serial must match the assignment; secure ready requires successful binding and the SDK pen-state handshake event. Do not invent battery/storage values if the bridge does not expose them. Unpair success requires cloud release and successful native depair callback. Keep a recoverable failure if one side fails.

Normal unpair uses `clear: true` on iOS and `clear: false` on Android through a semantic native port. Always disconnect after a bounded depair attempt, retaining separately confirmed release steps. Current scope: leaving Recorder disconnects but preserves binding. A revoked enrollment can cloud-unbind but cannot obtain a new BLE session; unpair before revocation, or obtain a new valid invitation to reconnect. Dedicated release-only recovery remains deferred and is explicitly reported as incomplete in the UI.

Web and Expo Go show that a native phone build is required. The simulator preview can remain available explicitly and must not report a physical connection. Native permissions/configuration live in Expo config; generated iOS/Android projects are not hand-maintained. The backend must be reachable from the physical phone before live SDK setup can complete; no public exposure of the existing local development API is implicit.

Verification: provider protocol and owned-route tests; controller event sequences covering false readiness, wrong serial, failed bind, disconnect, timeout and unpair failure; workspace checks and native module discovery. iOS compilation may be attempted with installed toolchain/signing, but report actual build and hardware results separately. Android compilation remains blocked until the genuine missing AAR is available. Live pairing requires actual credentials, a reachable backend and physical user interaction.
