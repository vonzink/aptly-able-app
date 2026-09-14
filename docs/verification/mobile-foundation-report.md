# Mobile foundation verification

Date: 2026-09-10

## Delivered behavior

- Native Expo Router shell with Home, Recordings, Recorder, and Settings tabs.
- Light and dark Aptly Able tokens, Inter typography, safe-area handling, scalable text, and controls with at least 44-point targets.
- Font and icon imports use only the five Inter weights and Ionicons font needed by the app. A font-load failure falls through to readable system typography instead of leaving a permanent loading screen.
- An explicit `SIMULATED` disclosure in every screen header.
- Assigned-recorder preview: the app presents the simulated Plaud Note Pro ending in 4812 as assigned to the current enrollment, describes the permission step without opening an OS prompt, and searches only for that recorder.
- Injected recorder adapter and framework-independent controller with scan, cancel, connect, disconnect, subscribe, and dispose behavior.
- Empty recordings library. The app does not fabricate recordings, sync, upload, transcript, playback, analysis, identity, enrollment token, or hardware outcomes.
- Compile-time app configuration declares mock mode. Any unsupported mode throws instead of falling back to the mock adapter.
- Controller cleanup survives React Strict Mode's setup/cleanup replay and still disposes after the final unmount. The rectangular supplied wordmark is used only in content; it is not configured as an unsupported application icon.

## Test evidence

The first focused test command on the test-first controller suite exited before Vitest collection because pnpm's automatic install rejected `zod@4.6.1` under its minimum-release-age policy. This was an environment failure, so it did not provide the intended missing-module RED assertion. The root owner corrected the dependency baseline to the mature `zod@4.6.0`; no mobile manifest was changed here.

After implementation:

```text
$ pnpm exec vitest run apps/mobile/test/recorder-controller.test.ts
Test Files  1 passed (1)
Tests       7 passed (7)
Duration    109ms

$ pnpm --filter @aptly/mobile typecheck
$ tsc --noEmit
exit 0
```

The seven focused tests cover pending connection truthfulness, cancelled-scan stale results, disconnect during pending connection, adapter listener cleanup on dispose, unsupported real mode, retry after a rejected scan, and Strict Mode lifecycle replay.

## Files

- `apps/mobile/app.config.ts`, `tsconfig.json`, `expo-env.d.ts`
- `apps/mobile/assets/aptly-able-logo.png`, `plaud-recorder.png`
- `apps/mobile/src/app/_layout.tsx`, `index.tsx`, `recorder.tsx`, `recordings.tsx`, `settings.tsx`
- `apps/mobile/src/bootstrap/AppProviders.tsx`, `recorder-mode.ts`, `recorder-lifecycle.ts`
- `apps/mobile/src/ui/theme.ts`, `components.tsx`
- `apps/mobile/src/features/recorder/RecorderScreen.tsx`, `recorder-adapter.ts`, `recorder-controller.ts`, `mock-recorder-adapter.ts`, `use-recorder.ts`
- `apps/mobile/src/features/recordings/RecordingsScreen.tsx`
- `apps/mobile/src/features/settings/SettingsScreen.tsx`
- `apps/mobile/test/recorder-controller.test.ts`

## Remaining concerns and scope boundary

- The assigned-recorder, enrollment-link, permission, discovery, and connection behaviors are simulated UI only. They do not prove Plaud SDK compatibility, Bluetooth access, serial verification, QR enrollment, native builds, or hardware behavior.
- The simulated adapter uses short timers solely to make the state changes reviewable. It has no vendor SDK import and no hidden fallback path.
- Root integration owns Expo exports and browser inspection. A successful export will prove JavaScript bundling, not a native build or hardware integration.
