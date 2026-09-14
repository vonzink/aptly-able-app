# Mobile foundation implementation plan

> For agentic workers: use superpowers:subagent-driven-development for the bounded mobile task and independent review; root implements shared tooling and API. Work only inside aptly-able-app.

Goal: A reproducible pnpm workspace, secure local API skeleton and native React Native shell with explicit mock recorder discovery/connection.

Architecture: The mobile app owns UI and an injected recorder adapter. Shared Zod schemas define public contracts. The API composes validated configuration, a development identity boundary and independently testable routes. Postgres is optional to boot; readiness truthfully reflects its availability.

Tech stack: Expo 57.0.21, React Native 0.86.3, React 19.2.3, Node 24.13.0, pnpm 11.19.0, TypeScript 6.0.3, Fastify 5.12.3, Zod 4.6.0, Vitest 5.0.0.

Spec: ../../ARCHITECTURE_READINESS_REVIEW.md

## Global constraints

- User authorized starting in this folder after learning their original Plaud Note is unsupported. Implement foundation now, defer real native proof. Do not claim mock results as hardware success.
- Only aptly-able-app files change; no parent Git operations, commits, staging, publishing or deployment in this slice.
- UI uses supplied navy/orange/mint tokens and Inter, native accessible controls, light/dark support. No AI, deletion, fake upload/transcript/playback, or credentials in the app.
- Mobile cannot import API/server packages. Shared contracts cannot import mobile or server. Domain/coordinator imports no React Native.
- Runtime and package versions are exact and lockfile-backed. Do not install a guessed vendor SDK.

## Task 1: Workspace, contracts, local API (root ownership)

Files: root package.json, pnpm-workspace.yaml, tsconfig.base.json, eslint.config.mjs, .gitignore, .prettierignore, .prettierrc.json; packages/contracts/{package.json,tsconfig.json,src/{index,health,session,recording}.ts,test/contracts.test.ts}; apps/api/{package.json,tsconfig.json,src/bootstrap/{config,server}.ts,src/transport/http/app.ts,src/modules/identity/development-identity.ts,test/{config,app}.test.ts}; compose.yaml; scripts/verify-boundaries.mjs; README.md.

Interfaces: HealthResponse {status: 'ok'|'unavailable'}; SessionResponse {user:{id:UUID},mode:'development'}; RecordingSummary {id,title,recordedAt:string|null,durationSeconds:number|null,status:'awaiting_upload'|'uploaded'|'transcribing'|'complete'|'failed'}; RecorderSummary {id,name,model:'notepro'|'notepins',serialSuffix:string,batteryPercent:number,storageFreeBytes:number,storageTotalBytes:number}. All public schemas validate at runtime.

- [x] Create reproducible package/config files; install locally with pnpm.
- [x] Write tests rejecting blank titles, negative durations/storage, invalid UUID and inverted transcript segments. Run them to observe missing implementation; implement strict schemas and re-run.
- [x] Write API tests: live=200 independent of database; ready=503 when probe fails; disabled identity denies; wrong bearer denies; valid development bearer returns only internal ID; malformed config and production dev identity fail startup; error responses hide secret-bearing exceptions. Implement app injection/config/identity boundary and make tests pass.
- [x] Compose optional local Postgres on loopback port 55432 with a named volume; database readiness must perform SELECT 1. No migrations for nonexistent features.
- [x] Run typecheck, lint, test, build; run the built API and exercise health. Test import boundaries with deliberately invalid input without changing app source.

Representative behavior tests:
```ts
expect(recordingSummarySchema.safeParse({ ...validRecording, title: ' ' }).success).toBe(false);
expect((await app.inject({url:'/v1/session'})).statusCode).toBe(401);
expect((await app.inject({url:'/health/ready'})).statusCode).toBe(503);
```

## Task 2: Mobile shell and mock coordinator (worker ownership)

Own only apps/mobile/** except package.json (root owns dependency installation). Read design_handoff_aptly_able_mobile/README.md for exact tokens. Root provides Expo/router/font/query/zustand dependencies and contracts above; don't modify shared contracts without messaging root.

Files: app.config.ts, tsconfig.json, src/app/{_layout,index,recorder,recordings,settings}.tsx; src/bootstrap/{AppProviders,recorder-mode}.tsx or .ts; src/ui/{theme,components}.tsx; src/features/recorder/{RecorderScreen,recorder-adapter,recorder-controller,mock-recorder-adapter,use-recorder}.ts(x); src/features/recordings/RecordingsScreen.tsx; src/features/settings/SettingsScreen.tsx; test/recorder-controller.test.ts; assets/{aptly-able-logo,plaud-recorder}.png copied from supplied assets. Split files further only when responsibility warrants it.

- [x] Write controller behavior tests before implementation: connection is never ready before adapter resolves; scan cancel invalidates late results; disconnect while connect pending cannot reconnect from stale completion; listeners unsubscribe; unsupported real mode throws and never falls back; rejected scan is retryable. Use deferred promises for races.
- [x] Implement small adapter contract and injected coordinator. Mock shows one explicitly simulated Note Pro. Stable snapshot subscription via Zustand vanilla or useSyncExternalStore; no native SDK import. Adapter failures expose friendly copy; never fabricate recordings or transfer outcomes.
- [x] Implement polished branded shell with Home, Recordings, Recorder, Settings tabs. Home introduces recorder-to-transcript purpose and entry CTA; Recorder supports scan, select, connect, disconnect with mock badge at all times. Recordings empty state points to recorder; Settings states preview scope and app version without nonfunctional toggles.
- [x] Honor theme, safe areas, large text, >=44pt targets, accessible labels; use supplied Inter and assets. No fixed-height content. Existing prototype is reference only.
- [x] Run focused tests and mobile typecheck. Root runs exports and browser inspection after integration. Return evidence and files in docs/verification/mobile-foundation-report.md (one permitted path outside apps/mobile).

Controller shape may be refined internally; public use is state snapshot plus scan(), cancel(), connect(recorder), disconnect(), dispose(). It owns one recorder, stale-operation invalidation and cleanup. Scan returns RecorderSummary[]. Mock flags are explicit compile-time configuration, and attempting a hardware build must fail until real support exists.

## Task 3: Integrated verification and documentation (root + read-only reviewer)

- [x] Validate all packages, Android/iOS JavaScript exports and a web preview. A Metro export is not a native build or hardware proof.
- [x] Inspect rendered mobile-width UI for navigation, mock disclosure, connection workflow, empty library and dark mode.
- [x] Independent review checks security boundary, separation, stale async events and scope; fix relevant findings and re-run affected verification.
- [x] Document exact startup commands, mock limitations, infrastructure status and next phase in README and docs/verification/FOUNDATION.md. Stop at this phase checkpoint.

## Execution ledger

Preflight: Tasks 1 and 2 share contracts only; schemas above define their interface. Root alone edits package manifests/install state. Task 3 consumes both tasks' runnable outputs. No conflicts found.

Decision: Work in the exact user-selected folder and leave files uncommitted, preserving unrelated parent work. No nested Git repository/worktree is created.
Decision: Hardware unavailability changes the first deliverable to mock foundation; native SDK source and hardware proof remain separate acceptance gates.

User steering: enrollment begins with an admin-assigned recorder and QR link. Task 2 simulates an assigned-recorder invitation and only sets up that recorder; actual admin/QR/identity/link infrastructure is a later slice documented in docs/ENROLLMENT_FLOW.md.

Completion: local foundation delivered; see docs/verification/FOUNDATION.md for actual results and explicit testing limits. Root API/contracts/tooling and mobile task complete; independent review clean after fixes.
