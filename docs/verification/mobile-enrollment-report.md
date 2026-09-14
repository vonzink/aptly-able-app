# Mobile enrollment verification

Date: 2026-09-10

## Implemented behavior

- `/enroll` is a hidden Expo Router route reachable from Home and Settings.
- Web invitations accept a 43-character URL-safe token only from the `/enroll` fragment and scrub the fragment from browser history immediately. Query tokens and links for other routes are rejected. Native cold- and warm-launch links use Expo Linking; manual full-link or raw-code entry supports local testing.
- Local development access codes exist only in controller memory. They are never embedded in the bundle, placed in URLs, written to preferences, or logged. Sign-out clears the credential, invitation, local operation state, and recovery journal.
- The authenticated preview displays only recorder model and serial suffix. Claim writes the authenticated actor and cryptographic UUID idempotency key before the request, then records the returned operation ID. A lost response can retry with the same key; a restart can recover the committed operation through the claim-key lookup without retaining the raw invitation.
- Native recovery uses Expo SecureStore. Web recovery uses sessionStorage only for the nonsecret actor ID, idempotency key, and optional operation ID. A storage failure blocks claiming rather than continuing without recoverability.
- Account changes clear another actor's journal before any operation is shown. Replaced invitations clear prior preview and recovery state. Sign-out cancels active HTTP work and generation checks prevent late results from restoring stale state.
- The final mobile state says **Enrollment saved** and **Recorder setup is pending**. It explicitly says hardware connection is unavailable and the recorder is not paired.

## Verification evidence

- `./node_modules/.bin/vitest run apps/mobile/test/enrollment-link.test.ts apps/mobile/test/enrollment-controller.test.ts apps/mobile/test/recorder-controller.test.ts` — 21 tests passed, including cancellation and native custom-link coverage.
- `./node_modules/.bin/tsc --noEmit -p apps/mobile/tsconfig.json` — passed after mobile integration.
- The scoped ESLint command listed below passed after removal of one unused import.
- Expo export from `apps/mobile` completed the web bundle, then native bundling stopped because the shared `@aptly/contracts` React Native export pointed Metro at TypeScript containing NodeNext `.js` source specifiers. This is a shared package export/configuration issue, not evidence that native export passed.

## Required final checks

Run after the shared React Native package export is corrected:

```sh
./node_modules/.bin/vitest run apps/mobile/test/enrollment-link.test.ts apps/mobile/test/enrollment-controller.test.ts apps/mobile/test/recorder-controller.test.ts
./node_modules/.bin/tsc --noEmit -p apps/mobile/tsconfig.json
./node_modules/.bin/eslint apps/mobile/src/features/enrollment apps/mobile/src/features/session apps/mobile/src/services apps/mobile/src/app/enroll.tsx apps/mobile/src/app/_layout.tsx apps/mobile/src/bootstrap/AppProviders.tsx apps/mobile/src/features/settings/SettingsScreen.tsx apps/mobile/src/app/index.tsx apps/mobile/app.config.ts apps/mobile/test/enrollment-controller.test.ts apps/mobile/test/enrollment-link.test.ts
(cd apps/mobile && ./node_modules/.bin/expo export --platform all)
```

## Limits

- Production authentication remains undecided. This UI is explicitly local development access against separately configured API codes.
- Signed iOS Universal Links, Android App Links, verified HTTPS hosting, app-store continuation, and physical Plaud SDK integration are not configured.
- No Bluetooth permission, discovery, cloud binding, or hardware pairing occurs. The existing recorder simulation remains a separate preview and is not connected to backend assignments.

## Independent review remediation

The independent review identified two mobile recovery races. Both were corrected with regression coverage:

- Claim now captures an immutable actor, invitation token, idempotency key, and controller generation. It checks the generation after every storage or network wait. Journal writes and clears remain serialized, so sign-out or invitation replacement cannot be undone by a late native storage write, and an old claim response cannot overwrite the replacement flow.
- Opening the original invitation after a restart preserves an existing nonsecret recovery journal and attempts claim-key recovery before resolving the invitation again. An authenticated replacement during an active claim clears the stale pending journal safely.
- A failed saved-operation status refresh retains the operation and presents **Retry status refresh**. Session expiry still offers sign-out so the user can authenticate again; it no longer routes a saved operation into the token-claim retry action.

The controller suite now includes delayed journal sign-out, replacement during delayed storage, late claim completion after invitation switching, restart recovery with an incoming original link, and failed-then-successful operation refresh.

The scoped re-review found three additional lifecycle cases. The controller now coordinates sign-in with its one-time journal initialization, so a cold-launch invitation cannot invalidate an in-progress SecureStore load. Revoked enrollment uses an explicit reset action that clears the old operation and journal before accepting another invitation. Initial operation-recovery failures enter a dedicated recovery state with a claim-key/operation retry; an unauthorized recovery returns to local sign-in while retaining the nonsecret recovery journal. Sign-out publishes its empty snapshot before awaiting serialized storage cleanup, and an old claim's completion handler can clear only its own tracked promise.

Live browser review also showed Expo Router restoring its captured fragment after the first history scrub. The web adapter now preserves Expo's existing history state while replacing the URL, listens for later `hashchange` restoration, and scrubs again before forwarding the invitation. Repeated delivery of the same invitation is idempotent in the controller, so this cleanup cannot cancel an active sign-in. The screen ignores late initial-link promises after unmount or Strict Mode effect cleanup.

The final scoped review found a missing branch when recovery changed from an offline error to a confirmed 404. Retry now clears the uncommitted journal and resolves the retained invitation; without an invitation it transitions to explicit rescan guidance instead of remaining in the resolving state.
