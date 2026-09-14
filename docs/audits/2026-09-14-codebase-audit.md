# Aptly Able codebase audit — September 14, 2026

Repository reviewed: `/Users/zacharyzink/AptlyAble/aptly-able-app`.

This is an audit, not an implementation change. Application source, configuration, deployment, and device state were left unchanged. Audit artifacts are under `.local/audit-2026-09-14/`. Line references describe the source inspected on this date.

## 1. Executive Summary

**Overall health: 6/10. Classification: a clean mid-level implementation with a prototype-level release process. It is a credible private pilot, but it is not yet a scalable production-grade system.**

The project has a useful architecture worth preserving: a modular API, a separate dashboard, a shared React Native application, shared validated contracts, and Swift/Kotlin adapters for Plaud. Business controllers generally accept small injected ports and expose testable state. Enrollment ownership, concurrent claims, partial unpairing, stale callbacks, and ambiguous transcription submission already receive meaningful attention.

The main problems are at boundaries between otherwise reasonable components: transactions versus slow vendor calls; metadata versus audio deletion; hardware state versus foreground lifecycle; mutable UI state versus upload lifetime; and declared build configuration versus reused generated native projects. These are more consequential than the raw file lengths.

| Dimension | Score | Assessment |
| --- | ---: | --- |
| Project architecture | 7/10 | Appropriate app/package boundaries; some inner-layer inversions and inconsistent persistence ownership. |
| Maintainability | 6/10 | Good controller seams, but four HTTP engines, concentrated device orchestration, and stale operational instructions. |
| Workflow resilience and scale | 5/10 | Reproduced pool starvation and local workflow failures; eager transcript rendering and repeated library scans. |
| Verification | 7/10 | Substantial passing controller/database tests; missing component lifecycle, native failure, and artifact variant checks. |
| Release reproducibility | 4/10 | No application files tracked by Git, native build inputs depend on local generated state, and APK schemes carry across variants. |

### Scope and evidence

- Inventory: **217 authored source/test/config/reference files, 25,996 lines**. Of these, **166 active files under apps/packages/scripts total 15,832 lines**; **43 test/harness files total 6,896 lines**. Remaining inventory entries include retained prototypes and root tooling configuration.
- Reviewed the API, contracts, clients, dashboard, mobile controllers/screens/storage, authored native bridges, build/release scripts, deployment configuration, and relevant operational documentation.
- Generated builds, dependencies, Pods, and vendor binary internals were excluded from authored-code quality counts. Selected generated configuration and the existing APK were inspected for release correctness.
- The 23 GB workspace is largely local artifacts: approximately 17 GB in `.local`, 1.8 GB in generated Android files, and 621 MB in generated iOS files. This is a local workspace-management issue, not evidence that 23 GB ships to users.
- **Passed:** `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, **350 unit tests across 35 files**, and **33 integration tests across 6 files** against isolated schemas in local PostgreSQL.
- SDK presence checks passed. Existing Android SDK and APK hashes match the recorded provenance. These checks do not establish vendor authenticity or physical-device correctness.
- Reproductions used actual application controllers/services with delayed fake provider calls or in-memory filesystem/hardware dependencies. No real Plaud cloud operation was performed. Temporary database schemas were removed.
- No new native compilation, install, physical Bluetooth test, live deployment verification, performance benchmark, or penetration test was performed. Physical Android pairing/transfer and current signed iOS distribution remain separate acceptance work.

Detailed supporting reviews: [backend](../../.local/audit-2026-09-14/backend.md), [mobile](../../.local/audit-2026-09-14/mobile.md), [native and delivery](../../.local/audit-2026-09-14/native-delivery.md). These supporting artifacts are local and ignored; this report is the durable synthesis.

## 2. Critical Issues — Must Fix

Priority meanings: **P1** is an immediate reliability or release-control problem. **P2** is an important conditional workflow defect or risk to address before expanding the pilot. Not every must-fix finding is an observed production incident.

### C1 — P1: There is no version-controlled application baseline

**Confirmed repository state.** The Git root is `/Users/zacharyzink/AptlyAble`, but `git ls-files -- .` from the app returns **zero files**, and `git status --short -- .` returns `?? ./`. No `.github` workflow directory was found in the app or its parent repository.

The application may work locally, but its source, tests, lockfile, native integration declarations, and release instructions cannot currently be recovered or reviewed through Git history. A dependency lockfile on one machine does not provide release reproducibility if the application containing it is untracked. Existing external backups were not assessed.

**Action:** Establish an intentional source baseline in the parent repository or a dedicated application repository. Review ignore rules and stage source, tests, lockfiles, migrations, nonsecret deployment configuration, and SDK provenance deliberately; keep private environment files, signing material, recordings, vendor artifacts requiring separate handling, and generated output excluded. Then make the existing checks a repeatable CI gate. Do not indiscriminately add the 23 GB folder.

### C2 — P1: Two slow pairing-session requests can exhaust the entire database pool

**Runtime reproduced with local PostgreSQL and delayed fake provider calls.** [database.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/infrastructure/database.ts:6) sets `max: 2` and a 3-second connection acquisition timeout. [Device service](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/modules/plaud-devices/service.ts:49) holds a connection and transaction while awaiting Plaud work; its session operation at line 132 waits inside that transaction. [Provider requests](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/modules/plaud-devices/provider.ts:50) can each wait 10 seconds, with two sequential requests for a session.

Two sessions for different owned recorders reached the delayed providers. A readiness probe then failed after **3,002 ms** with `timeout exceeded when trying to connect`. It recovered immediately after releasing the providers. Normal authentication and enrollment queries use the same pool. Transcription does not need to be enabled for this failure.

The transaction intentionally preserves ownership/reassignment ordering. Removing its locks without a replacement protocol would introduce another bug. Existing device concurrency tests use a larger pool and miss the deployed budget.

**Action:** First bound device-operation admission and reserve database capacity for normal requests, with a mixed-workload test using the real configured pool. Longer term, use durable operation intent, provider-result reconciliation, and assignment/version revalidation to shorten transactions while preserving ownership guarantees. A larger pool alone only moves the threshold.

Evidence: [executable reproduction](../../.local/audit-2026-09-14/backend-pool-repro.mjs), [output](../../.local/audit-2026-09-14/backend-pool-repro.log).

### C3 — P2: A failed delete can remove cached audio, retain its library entry, and block restoration

**Runtime reproduced with actual storage/controller code and an in-memory filesystem.** [file-recording-store.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/services/recordings/file-recording-store.ts:246) persists the device-source dismissal and removes cached audio before moving metadata into its deletion tombstone. If that move fails, the controller reports failure and retains the old visible snapshot.

Observed result: delete returned false; the displayed entry still reported audio available; the audio file was gone; the dismissal marker was set; restoring that entry failed with “This recording was deleted from the app.” The original audio on the recorder was not deleted. This is a local consistency/recovery failure, not evidence of permanent loss of the hardware source.

The existing failed-delete test covers a permanent manually imported recording, not this temporary Plaud path.

**Action:** Define one logical deletion commit covering metadata visibility and dismissal, followed by idempotent cache cleanup. Before commit, the recording must remain recoverable; after commit, cleanup must resume safely. Test faults at every filesystem boundary, including the interaction with automatic resync. Simply rearranging two calls does not define a crash-safe protocol.

Evidence: [mobile reproduction](../../.local/audit-2026-09-14/repro-mobile.mjs), [output](../../.local/audit-2026-09-14/repro-mobile.log).

### C4 — P2: Foregrounding can start synchronization while the recorder is still recording

**Runtime reproduced at the controller boundary; physical-device consequences remain unverified.** [PlaudSyncProvider.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/plaud-device/PlaudSyncProvider.tsx:35) clears its connection on background and restores it on foreground. [plaud-sync-controller.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/plaud-device/plaud-sync-controller.ts:278) resets `recording=false` on connection changes and immediately syncs after subscribing to future events. [The file port](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/plaud-device/plaud-file-port.ts:10) provides transitions but no current recording-state snapshot.

After a record-start event, background/foreground without a stop event caused an export and an `idle` phase while fake hardware remained recording. Neither authored native bridge independently reconciles/gates this current state. Plaud's SDK may reject or protect the operation; corruption or interruption was not demonstrated.

**Action:** Model `unknown`, `recording`, and `idle` explicitly. Reconcile current hardware state on connection/resume and require confirmed idle before transfer. Keep one export lane. Cover already-recording first connection, foreground, reconnect, and missing stop callbacks.

## 3. Structural Improvements — High ROI Refactors

### File-size findings

These are all inventoried authored files over 500 lines. **No active application source file exceeds 1,000 lines.** Large generated/vendor files were intentionally excluded.

| Lines | File | Assessment and concrete split |
| ---: | --- | --- |
| 1,911 | [design support.js](/Users/zacharyzink/AptlyAble/aptly-able-app/design_handoff_aptly_able_mobile/support.js) | Retained design reference, not runtime. Archive with provenance under `docs/reference`. |
| 1,142 | [design HTML](</Users/zacharyzink/AptlyAble/aptly-able-app/design_handoff_aptly_able_mobile/Aptly Able Mobile.dc.html>) | Same treatment; do not spend product refactoring effort decomposing a historical export. |
| 921 | [admin styles.css](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/admin/src/styles.css) | Tokens, page layout, forms, dialogs, status states, and installation styling share one global file. Split tokens/base styles and colocate assignment/install component styles. |
| 592 | [plaud-device-controller.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/plaud-device/plaud-device-controller.ts) | Most important code decomposition: cancellation jobs, handshake evidence, discovery/session setup, and two-sided release. |
| 591 | [device controller tests](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/test/plaud-device-controller.test.ts) | Useful tests rather than a product defect. Split by discovery, handshake permutations, teardown, and partial release using shared fixtures. |
| 574 | [PlaudSdkModule.kt](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/modules/plaud-sdk/android/src/main/java/expo/modules/plaudsdk/PlaudSdkModule.kt) | Separate option/event types, guarded SDK dispatch/session ownership, and export operation management. Keep a small Expo facade. |

Line count alone should not drive the order. The 397-line enrollment repository and 331-line transcript generation panel have more consequential ownership questions than some larger presentation files.

### S1 — Decompose the connection state machine along its existing seams

The 592-line device controller owns roughly 18 mutable lifecycle/session variables, pending event promises, timeout logic, serial filtering, handshake evidence, and partial release. Extract:

- Lines 128–219: a private cancellable job helper owning generations, deadlines, and stale-result rejection.
- Lines 221–303: typed handshake evidence and event-order predicates.
- Lines 305–379: assigned-recorder discovery and session acquisition.
- Lines 451–524: cloud/device release state and retry rules.
- Keep public session orchestration in the controller.

Use explicit internal states to reduce impossible boolean combinations. Preserve current snapshot APIs and event-order tests. Do not distribute the same mutable booleans across several modules merely to reduce file length.

The 449-line [Swift bridge](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/modules/plaud-sdk/ios/PlaudSdkModule.swift) already contains distinct classes in one file; extract its session and export ownership to match the Kotlin responsibility split without forcing identical vendor API implementation details.

### S2 — Give persistence and identity contracts neutral ownership

[Enrollment service](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/modules/enrollments/service.ts:16) constructs the concrete PostgreSQL repository, while [that repository](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/modules/enrollments/postgres-repository.ts:103) implements the service interface and owns policy, token issuance, audit SQL, and transactions. Recording writes instead live partly in the service and partly in the transcription worker.

Move ports into independent contract files. Let bootstrap inject repositories; let cohesive repositories own persistence transitions, while application services orchestrate use cases. Split enrollment assignment/token/claim operations when working in that module, preserving its deterministic lock-order helper.

`ActorContext` and `SessionVerifier` live in [development-identity.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/modules/identity/development-identity.ts) even though production pilot services use them. Move them into `identity/contracts.ts`. Rename `requireAdmin` policies that intentionally permit owner-scoped self-service so the name expresses the real permission rule. This is a clarity problem, not a demonstrated authorization bypass.

Some imports form type-only back edges. **No runtime import cycle was established by this review.** The recommendation is about dependency ownership, not an invented circular-execution failure.

### S3 — Make bootstrap a composition root, not the home of feature contracts

[AppProviders.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/bootstrap/AppProviders.tsx:21) constructs feature controllers, while feature hooks import their contexts from this bootstrap file. Put contexts and hook contracts within their features; leave bootstrap to assemble dependencies.

The library generally uses injected storage, but [GenerationPanel.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/transcription/GenerationPanel.tsx:11) and [use-playback-source.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/recordings/use-playback-source.ts:2) directly import singleton storage. Expose an audio-source port through recording context so ownership and test substitution follow one path.

Preserve the existing plain controllers plus `useSyncExternalStore`. There is no architectural reason to introduce another state framework here.

### S4 — Consolidate the four HTTP request engines

[index.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/packages/api-client/src/index.ts:45), [auth.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/packages/api-client/src/auth.ts:31), [plaud-device.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/packages/api-client/src/plaud-device.ts:52), and [transcription.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/packages/api-client/src/transcription.ts:50) repeat dispatch, authentication, timeout/abort, parsing, validation, and safe error mapping.

The duplication has already diverged. Using the supported injected-fetch seam, enrollment accepts a valid late response after cancellation, transcription remains pending if a transport ignores abort, and malformed successful JSON becomes different error categories across clients. The ignored-abort reproductions deliberately use non-cooperative transports; normal platform fetch was not shown to fail this way. Auth/device clients already have a stronger explicit cancellation race.

Create one platform-neutral request primitive with shared deadline/cancellation semantics, response validation, and error classification. Keep endpoint schemas and feature-specific messages separate. Keep binary uploads as a separate body/deadline policy using the same cancellation primitive. Preserve public client factory APIs and run a table-driven transport contract suite against each endpoint client.

### S5 — Remove behavior tied to dashboard presentation strings

[Dashboard.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/admin/src/features/assignments/Dashboard.tsx:23) closes the assignment form when a notice starts with `Recorder assigned.`; [use-workspace.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/admin/src/features/assignments/use-workspace.ts:146) manufactures that English sentence. A copy change can alter application behavior.

Return a typed mutation outcome, or a discriminated notice such as `{ kind: 'assignment-created', message }`, and close the form on success. Several components also accept the entire inferred return type of `useWorkspace`; define narrow view/action contracts instead.

The workspace hook handles pagination, people loading, selection, mutations, notices, request cancellation, and recovery. Separate independent people/assignment loading from mutation orchestration. Changing assignment pages currently reloads the first people page and resets loaded people options; cache those independently.

### S6 — Enforce the intended boundaries in checks

[eslint.config.mjs](/Users/zacharyzink/AptlyAble/aptly-able-app/eslint.config.mjs:9) ignores the authored local Plaud module. Its controller import restriction at line 31 only targets the simulated recorder controller/adapter, not the real enrollment/device/transcription controllers. React Hooks dependency rules are absent.

[verify-boundaries.mjs](/Users/zacharyzink/AptlyAble/aptly-able-app/scripts/verify-boundaries.mjs:15) checks coarse app/package directions, not inner domain/transport or feature/bootstrap boundaries. Direct calls to its rule function accept hypothetical `react` or `node:fs` imports in real mobile controllers and a transport import in an API service. These are demonstrated holes in the guard, not claims that those imports currently exist.

Extend checks to the actual pure controllers and contracts, authored bridge TypeScript, and service/transport direction. Give Swift/Kotlin an explicit compile/lint gate. Add React composition tests for the failures in this report; current Node-based tests do not mount providers/screens. Dashboard tests currently exercise two helper files, not its interactive workflow.

### S7 — Make release inputs explicit and reproducible

**Existing APK defect:** [android-preview.mjs](/Users/zacharyzink/AptlyAble/aptly-able-app/scripts/android-preview.mjs:68) and [android-pilot.mjs](/Users/zacharyzink/AptlyAble/aptly-able-app/scripts/android-pilot.mjs:108) reuse the same generated directory with incremental prebuild. Read-only APK inspection confirms the normal release registers both `aptlyable-preview` and `aptlyable`, although [app.config.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/app.config.ts:14) selects only one. With both variants installed, link resolution may be ambiguous or use the wrong saved default; device chooser behavior was not tested.

Use isolated generated projects or a precise plugin that removes the opposite Aptly-owned scheme. Verify package, scheme, recorder mode, API origin, SDK inclusion, signature, and version in the resulting artifact.

[ios-pilot.mjs](/Users/zacharyzink/AptlyAble/aptly-able-app/scripts/ios-pilot.mjs:43) requires an existing ignored Xcode workspace/Pods and archives it without a native-input fingerprint check. There is no preserved CocoaPods resolution outside that ignored project. Supply an isolated fresh-build path with pinned toolchain/dependency inputs; preserve the working development install.

[check-plaud-sdk.mjs](/Users/zacharyzink/AptlyAble/aptly-able-app/scripts/check-plaud-sdk.mjs:13) verifies presence/minimum size and Android ZIP header, while [build.gradle](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/modules/plaud-sdk/android/build.gradle:29) includes every AAR in its folder. Use an exact dependency plus a machine-checked artifact/hash manifest. The current AAR matches its documented hash; this is provenance enforcement, not a tampering finding.

Own `ios.buildNumber` and `android.versionCode` explicitly and derive published metadata from the artifact instead of the hardcoded `0.1.0` in the Android packaging script.

## 4. Medium / Minor Issues

### Important P2 workflow and recovery issues

| Finding and evidence | Concrete change |
| --- | --- |
| **Rename cancels an upload.** [GenerationPanel.tsx:62](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/transcription/GenerationPanel.tsx:62) includes `title` in controller identity. Changing it deactivates the old controller and aborts its upload; [RecordingDetailScreen.tsx:102](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/recordings/RecordingDetailScreen.tsx:102) keeps rename available. Confirmed static composition path, not a UI runtime reproduction. | Own the job by actor, record ID, and immutable audio identity; pass mutable title separately. Test rename during a deferred upload. Review full-screen loading branches that unmount playback/jobs on unrelated library reloads. |
| **One bad metadata file hides the library.** [file-recording-store.ts:182](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/services/recordings/file-recording-store.ts:182) rejects the whole listing if one entry fails parsing/validation; web storage has equivalent batch failure. | Return healthy entries plus explicit recoverable entry failures. Preserve bad data for recovery, add persisted schema versions/migrations, and test two valid entries alongside one invalid entry. |
| **Cloud mutations are not atomic with database commit.** [Device service:137](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/modules/plaud-devices/service.ts:137) binds/unbinds before audit insert/commit. Lost acknowledgement or a later DB failure can leave uncertain cloud state. Static risk; provider retry behavior unverified. | Persist an operation attempt and uncertainty state; provide ownership-state reconciliation before retry. Keep cloud outcome separate from physical setup completion. |
| **Native exception boundaries differ.** [Kotlin initialization:154](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/modules/plaud-sdk/android/src/main/java/expo/modules/plaudsdk/PlaudSdkModule.kt:154) catches exceptions inside `main.post`, but scan/disconnect/list/export calls do not. Export directory creation failures are also ignored on both platforms. Conditional vendor-throw risk; no crash induced. | Centralize guarded main-thread dispatch and explicit filesystem preparation errors. Use a throwing fake SDK to test error propagation and cancellation independently. |
| **A missing native terminal callback can occupy the sync lane indefinitely.** [Swift export ownership:277](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/modules/plaud-sdk/ios/PlaudSdkModule.swift:277) waits for vendor callbacks; [sync controller:118](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/plaud-device/plaud-sync-controller.ts:118) deliberately keeps the lane busy until native settlement. Conditional, not hardware reproduced. | Give exports operation IDs, terminal-state ownership, and a verified cancel/reset path, or an explicit restart-required state. A JS-only timeout cannot safely permit another transfer while native work may still write. |
| **Safe diagnostic distinctions disappear.** [worker.ts:61](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/api/src/modules/transcription/worker.ts:61) flattens safe provider errors; its loop swallows unexpected failures at line 147. HTTP/pool logging also discards useful categories. | Keep public messages coarse, but record safe category, stage, duration, request/attempt ID, and retry decision. Add worker progress/queue age and pool-wait counters without logging raw audio, tokens, or vendor bodies. |

### Performance and efficiency

These are source-established scale risks, not measured claims that current short recordings are slow.

1. **Transcript work every 250 ms:** [RecordingPlayer.tsx:16](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/recordings/components/RecordingPlayer.tsx:16) passes playback time through [TranscriptPanel.tsx:58](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/recordings/components/TranscriptPanel.tsx:58) and [GenerationPanel.tsx:278](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/transcription/GenerationPanel.tsx:278), both of which eagerly map all transcript segments. Extract a shared virtualized transcript view; isolate active/visible-row highlight updates and preserve overlapping cue behavior.
2. **Quadratic metadata work during initial sync:** every device import in [recordings-controller.ts:120](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/recordings/recordings-controller.ts:120) rereads the full library. N new recordings cause roughly `N(N+1)/2` metadata visits. Some native filesystem operations are synchronous despite async wrappers. Maintain a source-key index and return committed-record plus eviction deltas, or batch reconciliation. Preserve cache-availability updates when removing full reloads.
3. **Eager library/search:** [RecordingsScreen.tsx:50](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/recordings/RecordingsScreen.tsx:50) searches full transcript strings and mounts every row. Separate lightweight summaries from full transcript payloads, precompute searchable text, and use a virtualized library list. The 100 MiB audio cache does not cap metadata count.
4. **Large upload allocation:** [recording-upload.native.ts:21](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/services/recording-upload.native.ts:21) materializes the full file in an ArrayBuffer; permitted audio can reach 250 MiB. This establishes at least one full-payload allocation, not a demonstrated out-of-memory crash. Evaluate compatible streaming/chunk transport or a lower mobile cap, preserving the tested octet-stream behavior.
5. **Server scale boundary:** the current transcription worker is intentionally single-worker and the API/worker require shared local audio files. A shared database alone would not make multiple independent hosts work. Before increasing upload volume, define storage retention/orphan reconciliation, bounded work deadlines, and queue progress. These are documented pilot limits rather than missing promised functionality.

### Lower-priority consistency, dead code, and documentation

- **Unused state scaffolding:** `zustand` has no mobile runtime/test import. TanStack Query appears only in [AppProviders.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/bootstrap/AppProviders.tsx:7); no query or mutation uses the provider. Remove these unused declarations/provider unless a concrete near-term use is approved. No bundle-size saving was measured. Do not label Expo autolinking dependencies or platform facades unused merely because a text search finds no ordinary import.
- **Unused vocabulary:** `recordingSummarySchema`/`RecordingSummary` in [contracts/recording.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/packages/contracts/src/recording.ts:2) are referenced only by their tests. Confirm external compatibility expectations, then remove or mark reserved. Keep the actively used transcript and recorder contracts.
- **Dead native state:** Kotlin's `isScanning` is written but never read; the `Permissions` import is unused. Native scan caches also accumulate discovered devices across sessions. Remove dead state and scope caches to session ownership; no memory-growth benchmark was run.
- **Duplicated persistence codec:** native/web enrollment journals repeat key and JSON/shape validation. Share the codec while retaining platform-specific I/O and recovery behavior.
- **Naming:** PascalCase component files, kebab-case noncomponent TypeScript, and platform suffixes are broadly consistent. Server ESM `.js` specifiers versus bundler extensionless imports are legitimate toolchain differences. Prioritize misleading ownership/policy names such as `development-identity` and `requireAdmin`; do not mass-rename compatible import styles.
- **Weak shared UI typing:** [ui/components.tsx:64](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/ui/components.tsx:64) uses `style?: object`; use a React Native style prop type. Standardize MB versus MiB labels to match calculations.
- **Development-only auth configuration drift:** [PilotAccessCard.tsx:30](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/session/PilotAccessCard.tsx:30) builds its own auth client without the development HTTP origin that bootstrap supplies to other clients. Explicit LAN HTTP pilot sign-in fails configuration checks; the HTTPS release path is unaffected. Inject the shared auth client from bootstrap.
- **Misleading product copy:** [SettingsScreen.tsx:43](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/settings/SettingsScreen.tsx:43) says direct transfer is coming later; it exists. Plaud transcript guidance can say audio is saved when it has been evicted. Derive messages from capabilities and `audioAvailable`.
- **Wrong fallback DNS instructions:** [AWS_PILOT.md:28](/Users/zacharyzink/AptlyAble/aptly-able-app/docs/AWS_PILOT.md:28) still references the old `zvzsolutions.com` zone/`api.aptly` hostname, while the same guide declares `api.plaud.aptlyable.info`. This affects a future fallback deployment, not an observed current outage.
- **Contradictory current runbooks:** README says EC2 setup is future work, phone development instructions retain pre-pairing status, and the local SDK README says the Android AAR is missing. Other current records confirm later milestones. Create one current capability/acceptance matrix by platform, artifact, date, and evidence; label historical reviews rather than deleting history. All 47 checked documentation files had valid relative link targets, so link checking alone does not detect this content drift.
- **Misplaced references:** root ZIPs, `design_handoff_aptly_able_mobile`, `aptly-able-plaud-dashboard`, `aptly-able-app-handoff`, and `plaude intergration` are reference material beside production entrypoints. Preserve them under an indexed `docs/reference` or external archive location; do not treat the old dashboard as a second supported app.

### Deferred work that should remain explicit

Automatic device-audio forwarding to the future Aptly Able server/AI is an intentional stub. Its presence is a useful integration seam, not dead code or a falsely completed feature. Trusted physical setup completion, server retention/deletion, account recovery, off-host backup automation, Android physical acceptance, and signed iOS distribution should remain visible release gates. Source availability does not prove a deployed capability or completed hardware acceptance. This audit does not reverse the agreed decision to stage those capabilities separately.

## 5. Suggested Refactoring Plan — Order of Operations

1. **Establish the recoverable baseline.** Deliberately track the authored application, tests, lockfiles, migrations, and nonsecret release inputs. Preserve the current artifact hashes and known acceptance results. Add CI for existing checks; do not commit generated trees or private data.
2. **Turn reproduced failures into regression tests.** Add actual-pool two-session contention, temporary Plaud deletion fault injection, and background/resume recording-state tests. Add a mounted rename-during-upload test and mixed valid/corrupt metadata tests. Define correct behavior before changing orchestration.
3. **Repair database admission and local workflow commits.** Reserve normal-request pool capacity while preserving ownership locks. Implement recoverable deletion and confirmed hardware-state gating. Stabilize upload lifetime and isolate invalid stored entries. Keep these as separate reviewable changes.
4. **Make the next native release deterministic.** Fix scheme accumulation, pin native inputs/hashes/version numbers, provide a clean isolated iOS build path, and verify final artifacts. Add guarded SDK dispatch/export ownership tests. Perform physical Android and iOS acceptance on the exact resulting artifacts.
5. **Extract device and storage responsibilities while preserving public APIs.** Move job/handshake/release helpers out of the device controller, separate native session/export ownership, and move feature contexts/ports out of bootstrap and concrete stores. Preserve existing race and partial-unpair tests throughout.
6. **Unify transport and backend persistence conventions.** Consolidate request cancellation/errors, neutralize identity contracts/policy names, and give repositories ownership of persistence transitions. Add durable cloud-operation uncertainty/reconciliation before treating retries as safe. Keep the modular monolith.
7. **Scale the local library on representative fixtures.** First measure long timed transcripts and large device libraries; implement source-key indexes, incremental metadata changes, summary/transcript separation, and virtualized views. Verify eviction, playback, overlapping cues, and search behavior. Reassess large native upload memory.
8. **Finish maintenance and operations documentation.** Split global CSS, type dashboard outcomes, remove confirmed unused scaffolding, archive reference exports, and consolidate current topology/capability instructions. Track deferred retention/backups/distribution acceptance separately from code refactoring.

Completion criteria should be behavioral: two delayed sessions do not block ordinary authenticated reads; failed deletion remains recoverable or is reported as committed; reconnect does not assume idle; rename does not cancel upload; one malformed entry does not hide healthy recordings; each APK contains exactly its intended scheme; a fresh build can explain every native input. A reduced line count is not a sufficient success criterion.

## 6. Example Refactor Suggestions

This is an illustrative target for the identified hotspots, not a mandate to create every directory immediately. Keep one backend and one shared mobile UI.

```text
apps/
  api/src/
    bootstrap/                         # Constructs adapters and services
    modules/
      identity/
        contracts.ts                   # Actor/session ports used by all modes
        pilot-identity.ts
        development-identity.ts
      enrollments/
        service.ts                     # Use-case orchestration
        repository.ts                  # Persistence port
        postgres/
          assignments.ts
          tokens.ts
          claims.ts
          locks.ts                     # One preserved lock-order convention
      plaud-devices/
        service.ts
        operation-repository.ts        # Attempts/results/uncertainty
        provider.ts
      recordings/
        service.ts
        processing-repository.ts       # Owns guarded state transitions
  mobile/src/
    bootstrap/AppProviders.tsx          # Wiring only
    features/
      plaud-device/
        context.tsx
        plaud-device-controller.ts     # Public orchestration
        device-job.ts
        plaud-handshake.ts
        plaud-discovery.ts
        plaud-release.ts
        plaud-sync-controller.ts
      recordings/
        context.tsx
        ports/
          recording-store.ts
          audio-source.ts
        components/
          RecordingPlayer.tsx
          TranscriptSegments.tsx       # Shared, virtualized rendering
    services/recordings/
      file-recording-store.ts
      recording-metadata.ts            # Versioned codec/recovery
      recording-cache.ts
  mobile/modules/plaud-sdk/
    ios/
      PlaudSdkModule.swift             # Expo facade
      PlaudSession.swift
      PlaudExportCoordinator.swift
      PlaudEvents.swift
    android/src/main/java/expo/modules/plaudsdk/
      PlaudSdkModule.kt                # Expo facade
      PlaudSession.kt
      PlaudExportCoordinator.kt
      PlaudEvents.kt
  admin/src/
    features/assignments/
      workspace-controller.ts
      workspace-types.ts               # Narrow view/action/outcome contracts
      components/
    styles/
      tokens.css
      base.css
packages/api-client/src/
  http/request.ts                      # One tested transport policy
  auth.ts
  enrollment.ts
  plaud-device.ts
  transcription.ts
docs/
  current-capabilities.md
  operations/
  reference/
  audits/
```

For the dashboard, replace the existing English-string trigger with an explicit result:

```ts
type CreateAssignmentResult =
  | { ok: true; assignmentId: string }
  | { ok: false; code: 'INVALID_INPUT' | 'UNAVAILABLE' };

const result = await workspace.createAssignment(input);
if (result.ok) setAssignmentFormOpen(false);
```

For a recording job, define identity from stable inputs rather than presentation text:

```text
Controller identity: actor ID + recording ID + immutable audio identity
Mutable metadata: title, display labels
Lifecycle events: activate, deactivate, source replaced, actor changed
```

Update the title through the job's metadata input; do not replace the controller when only the title changes. Tests should exercise that composition, rather than merely retest the controller's existing abort method.

The highest-value outcome is a recoverable, deterministic pilot with clear state ownership. The existing architecture supports that outcome without a rewrite, separate Android/iOS product codebases, or microservices.
