# Foundation verification — 2026-09-10

Status: First local foundation slice complete. Not a complete MVP, production deployment, native signed build or hardware validation.

## Delivered

- Independent pnpm workspace under aptly-able-app without changing the parent workspace or Git branch.
- Exact dependency manifests and a reproducible lockfile. Node 24.13.0; pnpm 11.19.0; Expo 57.0.21; React Native 0.86.3; React 19.2.3; React Native Web 0.21.2; TypeScript 6.0.3; Fastify 5.12.3; Zod 4.6.0; Vitest 5.0.0.
- Strict shared health/session/recorder/recording/transcript schemas. Mobile and server import boundaries checked by lint plus an AST-based check.
- Fastify local API with validated startup configuration, opaque development session verification, safe errors, no-store responses and database-backed readiness.
- Optional dedicated local Postgres Compose configuration pinned to an immutable image digest, loopback port 55432, persistent named volume.
- Shared native app shell with Home, Recordings, Recorder and Settings; exact supplied light/dark palette, Inter, authentic source assets and all-screen simulation disclosure.
- Assigned-recorder invitation and simulated permission/discovery/connect/disconnect. Stale asynchronous results cannot restore canceled connections. Lifecycle cleanup supports development effect replay.
- Product enrollment contract in docs/ENROLLMENT_FLOW.md, reflecting the owner's admin-assignment/QR direction.

## Executed checks

| Check | Result and practical limit |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed; lockfile and manifests agree |
| `pnpm check` | Passed: TypeScript, ESLint/import checks, 25 tests in 5 files, API/contracts compilation |
| `pnpm format:check` | Passed after formatting only new source/configuration |
| `pnpm peers check` | No peer dependency issues |
| `pnpm --filter @aptly/mobile exec expo install --check` | Dependencies up to date for installed Expo |
| `pnpm --filter @aptly/mobile export` | iOS, Android and web JavaScript/assets exported; not IPA/APK compilation |
| Built API runtime smoke | Real HTTP liveness 200, readiness 200 against this workspace's running Postgres, unauthenticated session 401; process then stopped |
| Optional API env-file invocation | tsx accepted `--env-file-if-exists=.env`; no real credential file created |
| Browser interaction | Verified invitation → simulated scan → assigned recorder ending 4812 → connection → disconnect; navigated all four tabs and confirmed empty recordings |
| Phone-width inspection | Dark theme observed at 393×852 and 320×568; no document horizontal overflow at either width. Native Dynamic Type and light-theme runtime remain untested |
| Independent review | Substantive import-boundary finding resolved and re-reviewed; no open substantive findings in foundation-review.md |

The API/contracts tests initially failed to collect because the implementation modules did not yet exist. Subsequent behavior tests caught a malformed URL validation failure. The boundary regression was observed failing with a server-only import accepted, then passing after the guard fix. The mobile report records that its first intended failing run was blocked by installation policy; that is not represented as a successful test-first cycle. Its added lifecycle regression was observed failing before the replay fix.

Dependency findings resolved: the newest Zod patch was inside the configured 24-hour package-age window, so the mature 4.6.0 patch was selected. Automatically selected React Native peers were aligned with Expo's compatible versions. One upstream deprecated `uuid@7.0.3` transitive package warning remains; no security conclusion is implied by this foundation check. Broad font/icon barrel imports were replaced to avoid bundling unused font families/weights.

## Runtime state and boundaries

- Local web preview runs at http://localhost:8088 while its development server remains active. Restart with `pnpm dev:web` if needed.
- The smoke-test API process was stopped.
- The new `aptly-able-mobile-dev-postgres-1` container was stopped after verification; its volume is retained. Start with `pnpm db:up`. Existing unrelated Docker services were not stopped or changed.
- All app-folder work is local and uncommitted. No staging, commits, branch changes, remote pushes or deployment were performed.
- Original design/technical handoff files and all unrelated parent-repository work were preserved.

## Not implemented or proven

Real QR generation/redemption, admin dashboard, user login, verified HTTPS app links, persistent assignments/recordings, Plaud cloud auth/binding, native Plaud SDK, actual Bluetooth, MP3 export, S3, transcription, player, hosted infrastructure, AI, notification and deletion features are absent. The mobile preview does not yet call the API. There are no application database tables or migrations for nonexistent features.

The original Plaud Note is unsupported. Hardware work requires a Note Pro or NotePin S plus real iOS and Android phones. Exact Plaud source/binary pins are still unresolved. Successful JavaScript bundles do not certify native compilation, device permissions or store readiness.

Next slice: implement persistent assigned-recorder enrollment and its authorization contract, with the admin/UI scope agreed before expansion. Real hardware integration remains a separate gate after supported equipment and SDK sources are available.
