# Stabilization step 3: session restoration and sign-out

Implemented locally September 15, 2026, on `main` based on `f968a4a`, alongside
the uncommitted Settings diagnostics and recorder-validation steps. This pass
does not commit, push, deploy, install a phone build, or change live accounts.

## Behavior and boundaries

- Phone sessions use the existing Expo SecureStore dependency. The session
  envelope is stored through iOS Keychain / Android Keystore-backed storage,
  using `WHEN_UNLOCKED_THIS_DEVICE_ONLY` on iOS. No password is stored.
- The dashboard and phone web preview use separate `sessionStorage` keys.
  Authentication survives refresh within that browser tab/session. This is
  not a cross-tab or permanent browser login feature.
- Saved sessions include the API origin, auth mode, expected account ID,
  expiry, token and account email. Malformed data or a different environment
  is discarded. Development access credentials remain memory-only.
- Startup verifies the token through the existing `/v1/session` endpoint
  before exposing authenticated account data. The returned account must match
  the saved account. Phone enrollment is then recovered from its existing,
  account-scoped journal; a launch invitation is retained during restoration.
- The existing seven-day server session lifetime is unchanged. Expiry is
  checked on restoration, foreground/focus and before a protected request;
  there is no idle expiry timer. A current-token 401 also signs out. A late 401
  from an older account cannot sign out the newly active account.
- If startup verification is offline, authenticated UI stays hidden and offers
  Retry or Sign in with another account. The saved token remains available for
  retry. This does not add offline cold-start library access.
- Sign-out immediately clears the in-memory credential and account state,
  invalidates enrollment/device callbacks and removes the saved credential.
  Durable writes are serialized so an older save cannot resurrect sign-in.
  Server revocation is best effort if offline. Saved recordings are retained
  under the existing account-isolation rules; sign-out does not release a
  recorder assignment or unpair its Plaud binding.
- Failure to remove a saved credential produces a blocking Retry sign out
  screen. Failure to save a newly verified credential permits the current
  session with a visible notice that sign-in was not saved.
- Settings includes account email, session notices and an explicit Sign out
  action. Account email stays out of enrollment journals and diagnostics.

## Structure

- `packages/api-client/src/session/store.ts`: versioned storage contract,
  validation and browser driver.
- `packages/api-client/src/session/controller.ts`: framework-independent
  verification, expiry, write ordering and stale-response handling.
- `apps/mobile/src/services/session-store.*`: platform storage adapters.
- `apps/mobile/src/bootstrap/AppProviders.tsx`: connects auth lifecycle to
  enrollment, recorder callbacks and foreground checks.
- `apps/mobile/src/features/session/SessionRestoration.tsx`: recovery gate.
- `apps/admin/src/features/session/use-account-session.ts`: browser lifecycle.

The old mobile `development-credentials.ts` memory holder is removed. Existing
backend auth endpoints and schemas are reused; no backend production source,
Plaud SDK behavior or recording-transfer implementation changed in this step.

## Verification

- `pnpm exec vitest run`: **422 passed across 40 files**. The new session suite
  covers offline retry, expired/revoked/mismatched sessions, storage failures,
  environment isolation, late restores, slow saves, explicit sign-out,
  request-time expiry and old-account 401 responses. Enrollment checks cover
  automatic account/recorder recovery, a QR arriving during restoration and
  immediate hiding of the previous account.
- `pnpm typecheck`, `pnpm lint` (including import boundaries), and `pnpm build`:
  passed across contracts, API client, backend, dashboard and mobile types.
- Expo production exports for iOS, Android and web succeeded in
  `.local/session-restoration-export`. All three bundles use the production
  API origin and exclude the old LAN address. These are JavaScript/Hermes
  exports, not IPA/APK builds or physical-device acceptance.
- Real dashboard UI against the existing compiled API in a disposable local
  PostgreSQL schema: login, full reload, simulated session-endpoint outage,
  retry without password entry, sign-out and a signed-out reload all passed.
- Real mobile web UI against that same isolated API: login, Settings account
  display, full reload restoring the account, Settings sign-out and a signed-out
  reload all passed. No production account, recorder or Plaud request was used.
- The mobile preview initially compiled an obsolete LAN API address from
  `.env.local`. Its API was temporarily pointed at the isolated backend for
  these checks; the original configuration was restored afterward.

## Remaining acceptance and release

- Physical iOS/Android checks: close/reopen, lock/unlock, app update, expiry,
  sign-out while connected, account switching and secure-storage failures.
  Browser tests and Hermes exports do not establish native persistence or
  Bluetooth behavior on hardware.
- iOS Keychain may survive uninstall/reinstall; Android uninstall removes its
  app storage. Do not present reinstalling as a guaranteed sign-out mechanism.
- No refresh tokens, password reset, support-assisted account recovery,
  background authentication, cookie-session migration or enrollment-journal
  environment migration is introduced. Those remain separate work.
- Publish the dashboard and rebuild/distribute both phone apps to deliver
  this step. The live site and installed phone apps remain unchanged.
- Next stabilization step: recording-transfer interruption and recovery.

Storage behavior references:
[Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/) and
[MDN sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage).
