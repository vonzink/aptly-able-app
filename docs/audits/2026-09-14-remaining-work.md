# Remaining work from the codebase and UX audits

Reconciled September 14, 2026, against source commit `9ec1539`, the cleanup
reports, build 4 release evidence, and inspection of the live backend. The
initial list was pushed in `d19e0c3`. Item 1 was subsequently deployed at 23:40 UTC;
its status below includes the deployment checks. Broad regression suites and
physical-device acceptance remain deferred.

Sources:

- [Codebase audit](2026-09-14-codebase-audit.md): C1–C4, S1–S7, and section 4.
- [Original design/UX audit](2026-09-14-design-ux-audit.md): preserved from the
  earlier conversation; section/finding references below refer to that report.
- [Reliability pass 1](2026-09-14-reliability-progress.md),
  [reliability pass 2](2026-09-14-cleanup-without-testing.md),
  [UX pass 1](2026-09-14-ux-cleanup-pass-1.md),
  [UX pass 2](2026-09-14-ux-cleanup-pass-2.md), and
  [device/recording polish](2026-09-14-device-recording-polish.md).
- [Current release record](../verification/REMOTE_PILOT.md) and
  [original-account recovery](../verification/2026-09-14-recorder-account-recovery.md).
- [Backend pool-isolation deployment](../verification/2026-09-14-backend-pool-isolation.md).

Historical reports saying “not built,” “not deployed,” or “untracked” describe
their original pass. Build 4 subsequently shipped the mobile and dashboard
changes, and the application source is now committed. Backend rollout and
physical acceptance are separate questions, as noted below.

## Start here

### 1. Release the existing database-capacity fix

**Status: deployed; targeted release checks passed. Physical concurrency acceptance remains open.**
Source: code audit C2.

`apps/api/src/infrastructure/database.ts` now separates ordinary requests,
device operations and transcription into pools of 2, 2 and 1 connections.
`apps/api/src/bootstrap/server.ts` wires these independently. The initial live
inspection found the old shared pool. Release `20260914-pool-9ec1539` now runs
the corrected backend on EC2.

- [x] Build and release the current backend as a separate, reversible deployment.
- [x] Verify live readiness, authenticated session/assignment/enrollment reads,
  and independent pool capacity using the deployed modules. A separate diagnostic
  process held both device connections and the worker connection while ordinary
  database, identity and assignment reads completed successfully.
- [x] Preserve the shared Vaultwarden host and existing database data; verify the
  fresh backup, unchanged database/Vaultwarden containers and restored assignment.
- [ ] Complete concurrent physical Plaud pairing acceptance when testing resumes.
  The release probe made no vendor requests and is not a load or hardware test.

The earlier mobile/Amplify deployment did not update this API image. A separate
pool mitigates starvation; durable vendor-operation reconciliation remains item 11.

### 2. Restore sign-in and make account identity visible

**Status: partly addressed; session restoration remains open.**
Sources: UX §2.1, §3 account/support, §5 account recovery.

`apps/admin/src/App.tsx` stores the session in React state only.
`apps/mobile/src/services/development-credentials.ts` stores the mobile token
only in memory. The sidebar reload bug and signed-out library explanation are
fixed; refreshing the website or restarting the app still loses authentication.

- [ ] Add platform-appropriate session persistence, expiry handling and explicit
  sign-out cleanup; preserve account isolation during restoration.
- [ ] Add account email/name, sign-out, build number and support/troubleshooting
  to `features/settings/SettingsScreen.tsx`. It currently displays the marketing
  version but not the installed build number.
- [ ] Add password recovery, or a defined support-assisted recovery process.
- [ ] Make saved-enrollment recovery clear when the account or environment differs.

The original test recorder was recovered individually on the server. That repair
does not implement a general migration or returning-user recovery experience.

### 3. Validate recorder model and serial together

**Status: examples fixed; validation and correction remain open.**
Source: UX §2.2 and §7 form errors.

`packages/contracts/src/enrollment.ts` accepts the general serial format;
`plaud-device-controller.ts` additionally filters discovery by model prefix.
`AssignmentForm.tsx` now shows matching examples but still permits incompatible
model/serial combinations and reports a combined generic validation message.

- [ ] Establish one verified compatibility rule for registration and discovery.
- [ ] Add field-specific errors, serial-location help and first-error focus.
- [ ] Provide a correction flow that respects immutable assignments and existing
  Plaud binding, rather than silently editing an assigned recorder's identity.

### 4. Turn setup into one guided flow

**Status: partly addressed; end-to-end guidance remains open.**
Sources: UX §2.5, §3 setup separation, §5 invitation entry and self-service.

Relevant files: `InstallationPage.tsx`, `EnrollmentScreen.tsx`,
`PlaudDeviceScreen.tsx`, `AssignmentDetail.tsx`, and `AssignmentForm.tsx`.

- [ ] Show Add recorder → Install/open app → Sign in → Connect → Ready, with
  an obvious next action and a first-recording/first-sync completion state.
- [ ] Show “Invitation received” after a deep link; hide redundant manual entry
  behind an explicit replacement action.
- [ ] Remove the Person picker for a self-service user; keep team assignment
  management as a distinct experience.
- [ ] Distinguish invitation acceptance from confirmed phone connection. Show
  “check in app” until trustworthy device completion can be reported to the server.
- [ ] Keep maintenance secondary. Firmware has moved after connection actions,
  but still occupies a full card rather than a compact maintenance row.

### 5. Add genuine audio export and per-recording storage removal

**Status: wording fixed; missing actions remain open.**
Source: UX §2.4.

`RecordingDetailScreen.tsx` now correctly says “Keep offline in app.” That action
still retains app-private audio and does not export it to Files or a share target.

- [ ] Add **Export audio…** with a real destination/share sheet and completion
  feedback, handling missing temporary audio by restoring it first.
- [ ] Add **Remove offline audio** while retaining the recording entry, title,
  notes and transcript; explain when re-downloading from the recorder is required.
- [ ] Keep temporary, retained, exported and cloud-backed-up states distinct.

### 6. Make Home and recording activity useful day to day

**Status: connection notice and controls improved; remaining layout work is open.**
Sources: UX §3 recordings/Home and §6 recording activity.

- [ ] Replace the marketing-heavy `apps/mobile/src/app/index.tsx` with current
  recorder state, the next action and recent recordings.
- [ ] Compact `RecorderSyncCard.tsx` into a status row when there is no active
  transfer or error; keep its detailed recovery actions when needed.
- [ ] Add elapsed recording time to `PlaudRecorderControls.tsx` only when a
  reliable start/session signal exists; do not invent a timer after reconnect.

## Dashboard, accessibility and presentation

### 7. Improve dashboard interaction and discovery

**Status: partially addressed.** Sources: code S5; UX §5 and §6.

`use-workspace.ts` still combines people loading, assignment paging, selection,
mutations and one global `busy` flag. `AssignmentDetail.tsx` silently resets its
copy label when clipboard access fails.

- [ ] Use operation-specific loading states and retain useful content during reads.
- [ ] Cache people separately from assignment pages; narrow component view/action
  props instead of passing the entire workspace hook everywhere.
- [ ] Open a focused detail view/sheet on small screens, so selecting a recorder
  has an immediately visible result instead of updating content below the list.
- [ ] Add visible clipboard/configuration retry feedback and actionable recorder
  troubleshooting, including permissions/settings and serial checks.
- [ ] Add server-backed person/serial search and setup-status filters before
  expanding team management; replace manual person pagination with search.

Typed assignment-creation outcomes and harmless QR re-selection are already fixed.

### 8. Complete the shared UI system

**Status: partially addressed.** Sources: code file-size/UI findings; UX §4 and §8.

- [ ] Add spacing, radius and typography roles to `apps/mobile/src/ui/theme.ts`.
- [ ] Consolidate PageHeader, enrollment and recorder headers into explicit
  variants. Ordinary LOCAL badges have already been removed.
- [ ] Introduce shared form fields, notices and semantic status badges. Dashboard
  table/detail states still use different badge treatment.
- [ ] Split the 957-line `apps/admin/src/styles.css` into tokens, primitives,
  layouts and feature styles. Preserve the fixed primary-link styling.
- [ ] Consolidate connection/transfer/availability wording across Home, Recorder,
  sync cards and transcription controls so one state has one meaning.

### 9. Finish accessibility and readable forms

**Status: partly fixed; implementation and device acceptance remain.** Source: UX §7.

- [ ] Increase dashboard operational text: current CSS still includes 10-pixel
  table headers and 9-pixel mobile status badges.
- [ ] Associate field errors/help with inputs and focus the first invalid field.
- [ ] Extend keyboard avoidance to remaining native forms; the recording-details
  editor has it, but the general Screen/sign-in flow does not provide it.
- [ ] Verify large text, landscape, keyboard focus, screen-reader modal focus,
  accessible timeline adjustments, meter wrapping and reduced-motion changes.

Muted-text contrast, persistent sign-in labels, larger media controls, a draggable
native timeline, and bounded destructive-action dialogs are already implemented.

## Reliability and maintainability

### 10. Finish native failure and cancellation handling

**Status: partially implemented; failure ownership remains open.** Source: code §4.

Relevant files: `PlaudSdkModule.kt`, `PlaudRecorderActions.kt`,
`PlaudSdkModule.swift`, native Wi-Fi helpers, and `plaud-sync-controller.ts`.

- [ ] Apply guarded exception handling to remaining asynchronous dispatch paths,
  including Kotlin scan start/stop callbacks.
- [ ] Define terminal ownership for exports when callbacks are missing or late.
  Current safety locking can leave transfer blocked until restart.
- [ ] Provide a verified native cancel/reset path or an explicit restart-required
  state. A JavaScript timeout alone must not permit overlapping native writes.
- [ ] Finish session-scoped scan-cache cleanup and remove unused Kotlin scanning
  state after checking vendor callback requirements.

Several dispatch calls and export-directory failures already have guards. Do not
redo those fixes or treat a successful compile as proof of cancellation behavior.

### 11. Reconcile uncertain Plaud cloud operations

**Status: open.** Source: code C2 longer-term recommendation and §4 cloud mutations.

`apps/api/src/modules/plaud-devices/service.ts` performs vendor bind/unbind before
the audit transaction commits. A timeout or later database failure can leave the
cloud outcome uncertain.

- [ ] Persist operation intent, outcome/uncertainty and assignment version.
- [ ] Read/reconcile vendor ownership before retrying an uncertain mutation.
- [ ] Preserve assignment locking and keep cloud binding separate from physical
  handshake completion.

### 12. Consolidate HTTP cancellation and errors

**Status: open.** Source: code S4.

`packages/api-client/src/index.ts`, `auth.ts`, `plaud-device.ts` and
`transcription.ts` still have separate request engines.

- [ ] Share deadlines, cancellation races, parsing and safe error categories.
- [ ] Keep endpoint schemas and binary-upload policies separate.
- [ ] Verify cancellation against delayed/non-cooperative transports before
  replacing the existing factories.

### 13. Split the large device controllers along ownership boundaries

**Status: open/partial.** Source: code S1 and file-size findings.

Current sizes: device controller 592 lines, Kotlin module 691, Swift module 554.
Some native recorder-action/Wi-Fi helpers have already been extracted.

- [ ] Extract cancellable jobs, handshake evidence, discovery/session acquisition
  and partial-release recovery from `plaud-device-controller.ts`.
- [ ] Continue separating native session and export ownership from the Expo facade.
- [ ] Preserve public snapshots, cancellation ordering and two-sided unpair rules.

### 14. Give feature and persistence contracts clear ownership

**Status: open.** Sources: code S2/S3 and §4 naming/codec findings.

- [ ] Move `ActorContext`/`SessionVerifier` out of `development-identity.ts` into
  neutral identity contracts; rename policies that intentionally allow self-service.
- [ ] Inject enrollment repositories from bootstrap instead of having the service
  instantiate its concrete repository; keep persistence transitions cohesive.
- [ ] Move feature contexts/hooks out of `AppProviders.tsx`, leaving dependency wiring.
- [ ] Inject the recording audio-source port into playback/transcription instead
  of importing the storage singleton directly.
- [ ] Share native/web enrollment-journal validation while retaining platform I/O.

### 15. Make long transcripts and large libraries efficient

**Status: library virtualization completed; remaining performance work is open.**
Sources: code §4 performance; UX §8.

- [ ] Replace the duplicated readers in `TranscriptPanel.tsx` and
  `GenerationPanel.tsx` with one virtualized transcript reader. Playback updates
  should affect visible/active cues, not remap every segment every 250 ms.
- [ ] Add source-key indexing and incremental reconciliation to
  `recordings-controller.ts`; each Plaud import still rereads the entire library.
- [ ] Separate lightweight recording summaries/search indexes from full transcript
  payloads. Search still builds full title/name/notes/transcript strings.
- [ ] Preserve eviction updates, overlapping transcript cues and duplicate
  suppression when reducing reads.

The recording list already uses FlatList and memoized rows; that part is done.

### 16. Add metadata recovery and bounded upload memory

**Status: partial/open.** Source: code §4 library failures and large upload allocation.

- [ ] Add persisted metadata schema versions and deliberate migrations, plus a
  non-destructive repair/recovery path for unreadable entries.
- [ ] Keep the current healthy-entry display and import pause when source identity
  cannot be read; do not silently discard corrupt metadata to unblock sync.
- [ ] Replace or cap the full-file ArrayBuffer upload in
  `services/recording-upload.native.ts`; the allowed payload can reach 250 MiB.
  Choose compatible streaming/chunking or an explicit mobile limit.

### 17. Add useful operational diagnostics

**Status: open.** Source: code §4 diagnostics and server scale boundary.

`transcription/worker.ts` and database error handling still discard useful safe
failure categories.

- [ ] Record stage, duration, attempt/request ID, safe error category and retry
  decision; add queue age, worker progress and pool-wait measurements.
- [ ] Provide user-actionable error states without exposing credentials, audio
  content or raw vendor responses.
- [ ] Before multi-host processing, define shared audio storage, job deadlines,
  retention and orphan reconciliation. The current worker/local-disk design is
  intentionally a single-host pilot.

## Release discipline and verification

### 18. Make native releases reproducible from a clean checkout

**Status: partially implemented.** Source: code S7.

- [ ] Add an isolated fresh iOS build path and preserve/pin CocoaPods resolution
  and toolchain inputs; `ios-pilot.mjs` still requires the existing ignored workspace.
- [ ] Add machine-checked iOS SDK hashes; `sdk-artifacts.json` currently pins Android only.
- [ ] Automate final artifact checks for package, schemes, mode, origin, SDK,
  signature and version, including preview → pilot → preview transitions.

Shared release numbering, explicit Android AAR selection and Android hash checks
are done. Read-only inspection of the build 4 APK found the intended `aptlyable`
scheme and no `aptlyable-preview` scheme; it also contains Expo's generated scheme.
The full variant-transition acceptance remains open.

### 19. Add CI and enforce actual architecture boundaries

**Status: open.** Sources: code C1 remaining CI portion and S6.

- [ ] Add a repository CI workflow for the existing checks and a frozen dependency install.
- [ ] Enforce React Hooks dependency rules and controller/service boundary rules.
- [ ] Lint authored native-bridge TypeScript currently excluded by ESLint; add
  suitable Swift/Kotlin compilation/lint gates where SDK inputs are available.
- [ ] Add mounted provider/screen and dashboard workflow coverage when testing resumes.

The standalone source baseline and `.gitignore` are complete and pushed; they
are not open audit defects anymore.

### 20. Close outstanding verification when testing resumes

**Status: verification work, not a list of missing implementations.**

- [ ] Verify the second reliability pass: rename during upload, library reload
  during playback, valid/corrupt entries, owner changes and duplicate suppression.
- [ ] On the released native builds, check recording/paused state during
  background/foreground/reconnect, Bluetooth/Wi-Fi cancellation, long and multiple
  transfers, denied permissions, and recovery after missing SDK callbacks.
- [ ] Confirm deletion, cache limits, offline retention, title/notes persistence,
  native keyboard dictation and original recorder-file preservation.
- [ ] Complete Jake's physical Android pairing/transfer trial and the corresponding
  iPhone acceptance. Emulator launch and compilation do not prove Plaud behavior.
- [ ] Complete the accessibility checks in item 9 and variant checks in item 18.

Earlier regression suites passed for reliability pass 1. Later source changes
received type/lint/build and selected browser checks, but not a complete new
regression or physical-device acceptance run. No tests were run to prepare this list.

### 21. Reconcile documentation and remaining dead scaffolding

**Status: partly addressed.** Source: code §4 maintenance/documentation.

- [ ] Maintain one current platform/capability/release matrix; label historical
  reports and link forward to later deployment and verification evidence.
- [ ] Update stale repository ownership, SDK availability and deployment claims.
- [ ] Index or archive root handoff ZIPs/duplicate prototypes outside active source;
  they are ignored now, but remain in the local folder.
- [ ] Resolve the unused `recordingSummarySchema`/`RecordingSummary` contract after
  checking external consumers; retain actively used transcript/recorder contracts.
- [ ] Standardize remaining MB/MiB labels and misleading development-only names.

Unused React Query/Zustand scaffolding, the injected sign-in client, incorrect
fallback DNS example, Card style typing and much of the stale product copy are
already corrected.

## Deferred capabilities and related follow-ups

These are distinct from finishing the original cleanup. They should remain
visible without being mistaken for features already working in the hosted pilot.

- [ ] Durable recording upload queue, server acknowledgement, private object
  storage, retention/deletion and automatic Plaud transcripts/Aptly Able AI.
  The requested server integration is still a stub; local notes are not backed up.
- [ ] Automated off-host backups and restore practice; broader production security
  and account recovery before expanding beyond the pilot.
- [ ] Real administrator roles and account/team management. The recent admin-login
  question confirmed live accounts are owner-only; this is related product work.
- [ ] Dashboard battery/storage/connection telemetry, with last-seen/stale status.
  The phone has telemetry; the website does not automatically receive it.
- [ ] Firmware installation. The requested Coming soon presentation is done.
- [ ] Public iPhone distribution/TestFlight when the owner chooses to resume it.
  Direct signed installation on the current iPhone already works.

## Closed implementation findings — do not redo

- Reviewed, committed and pushed source baseline and ignore rules.
- Separate database pools for ordinary requests, device operations and the worker,
  now deployed to the live API (remaining physical verification in item 1).
- Recoverable local deletion and confirmed-idle gating before recorder transfers.
- Stable transcription controller identity during rename, selected recording
  retained through reload, and partial library reads (remaining acceptance in item 20).
- Typed assignment creation outcome and injected shared sign-in client.
- Android version/scheme/AAR improvements and removal of unused state providers.
- Primary link appearance, mobile signup layout, harmless dashboard navigation/QR
  selection, stronger muted-text contrast and visible mobile sign-in labels.
- Destructive-action confirmations, storage moved to Settings, recording-library
  virtualization, explicit signed-out state, and separate audio/transcript badges.
- Honest Keep offline in app wording, device photos, animated meters, improved
  media controls, draggable timeline, recording titles/notes and keyboard dictation.

Recommended sequence: fix returning-use items 2–4; deliver
export/Home/dashboard improvements 5–7; establish shared UI/accessibility 8–9;
then take reliability/architecture/performance items 10–17 in separate slices.
Build CI/release discipline alongside those slices. Keep the deferred acceptance
list visible rather than equating a source change with a verified hardware result.
