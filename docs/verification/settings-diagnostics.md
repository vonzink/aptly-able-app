# Settings diagnostics — stabilization step 1

September 15, 2026. Source change only; no deployment, installation, signing change,
release-number increment, cloud account change or recorder operation.

## Implemented

- Settings shows the current sign-in email, app version/build, recorder connection
  stage and Bluetooth/scan authorization. The email comes from the successful pilot
  sign-in form and is attached only after the session credential is verified. It is
  display information, not an ownership or authorization input. Older in-memory
  sessions without this information show that the email is unavailable.
- Sign-out, rejected sign-in and an expired session during enrollment recovery clear
  the email. It is not added to the saved enrollment journal. Persistent sign-in
  remains a separate future step.
- The installed version/build comes from Expo Application, not the current JavaScript
  release configuration. Missing native information is explicitly unavailable; web
  has a web version and no native build number.
- Native permission getters only read OS authorization. iOS uses the static
  `CBManager.authorization` property without creating a Bluetooth manager. Android
  checks the same permission set already used by scanning without requesting access.
  This includes location permissions required by the existing Android SDK adapter.
  Permission is distinct from the phone's Bluetooth power state or a connection.
- Copy diagnostics creates an explicit, bounded report of application and connection
  state. No emails, user IDs, serials, device names/addresses, enrollment tokens,
  credentials, URLs, audio, notes, transcripts or raw error messages are serialized.
- View report exposes the same selectable text. Clipboard failure shows a recovery
  message and the selectable report. Opening Settings does not access the clipboard.
- Permission status refreshes on screen focus and when returning from phone settings.
  Missing native methods in older binaries return unknown instead of assuming access.

## Ownership

- `features/settings/diagnostics.ts`: pure report formatting, permission normalization
  and connection labels; no storage, network or SDK operations.
- `features/settings/SettingsDiagnostics.tsx`: presentation and screen lifetime.
- `services/diagnostics-runtime.native.ts` and `.web.ts`: platform build information,
  permission reads and clipboard writes. Native dependencies are optional at runtime
  so loading new development JavaScript into an older binary does not crash Settings.
- The existing enrollment controller owns the display-only email for its session.
  SDK pairing, unpairing, transfer and enrollment-journal behavior remain unchanged.

## Verification

- Workspace TypeScript and lint/import-boundary checks passed.
- 84 focused tests passed across enrollment, diagnostic privacy/status handling,
  device lifecycle and recording synchronization. New email tests initially failed
  before implementation; the diagnostic module was initially absent.
- Changed TypeScript files passed formatting checks; `git diff --check` passed.
- Android `:plaud-sdk:compileDebugKotlin` passed with JDK 21 and the existing
  `.local/android-sdk`. Gradle recognized the two pinned Expo dependencies.
- Expo production JavaScript exports passed for iOS, Android and web, using the
  existing pilot API origin. These are bundles, not signed/installable applications;
  the output is isolated in `.local/settings-diagnostics-export`.
- Local web Settings rendered at 390 pixels wide without horizontal page overflow.
  View/hide report and copying were exercised. The browser clipboard contained the
  diagnostic report; no browser errors were observed during these checks.
- iOS project compilation remains **unverified**. The unsigned `PlaudSdk` build
  stalled in the upstream ExpoModulesJSI framework script before compiling the
  changed Swift file. After termination was requested, its log reported
  `BUILD INTERRUPTED`. A separate Swift typecheck using
  cached dependencies also exceeded its 60-second limit. These are not passing
  iOS build results, and no application workaround was added to bypass that step.

Local build logs are under `.local/settings-diagnostics-*.log`. Physical permission
reads, clipboard behavior and large-text layout on iPhone/Android remain pending.
Before distributing an update, refresh iOS Pods for the new Expo Application and
Clipboard dependencies, complete native app builds, and retain the existing signing
identities. Existing installed apps and public downloads have not changed.

## Next step

Reconcile recorder-model/serial validation between registration and discovery,
using verified device compatibility rules. Session restoration, transfer recovery,
upload memory limits, HTTP consolidation and cloud-operation reconciliation remain
open; they are not included in this diagnostics change.

References: [Expo Application](https://docs.expo.dev/versions/v57.0.0/sdk/application/),
[Expo Clipboard](https://docs.expo.dev/versions/v57.0.0/sdk/clipboard/) and the installed
CoreBluetooth `CBManager.h` authorization contract.
