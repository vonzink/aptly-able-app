# Simpler recorder setup — September 22, 2026

Publication follow-up: this work shipped in **0.1.2 (11)** on September 22.
The API/migration, website and Android download are deployed. See the
[build 11 deployment verification](2026-09-22-build11-deployment.md). The rollout
notes below describe the original preparation state.

## Implemented flow

1. Open the website and select **Get the phone app**; no invitation or website account is required to reach the installation page.
2. Install and open Aptly Able from its phone icon. Select **Set up my recorder**, then sign in or create an account.
3. Recorders already assigned to this account appear automatically. An unfinished setup is recovered on a fresh installation when it is the only active recorder. Multiple recorders remain an explicit choice.
4. If permitted, add a recorder inside the app: choose NotePin S or Note Pro and enter its complete serial number. Model/prefix and incomplete-serial errors appear before saving.
5. Continue directly to Recorder, then search and connect using the existing permission and Bluetooth flow. The separate “Enrollment saved → Open Recorder” step is removed.

QR invitations remain available under **Have an invitation link?** in the app and **Invitation link & QR options** on the website. They are optional for ordinary account-based setup. A revoked setup still requires an explicitly granted replacement invitation; account discovery does not bypass revocation.

The website now reports **Setup saved** rather than **Invitation: Not sent** for account-based setups. This is not a claim that Bluetooth is connected. A **Get the app** link remains available after website sign-in.

## Boundaries and recovery

- New authenticated endpoints: `GET /v1/me/recorders`, `POST /v1/me/recorders`, `POST /v1/me/recorders/:id/setup`.
- The authenticated account determines ownership. Request bodies cannot supply another user. Even administrators using `/me` see and start only their own recorders.
- Self-service/admin actors may add to their own account. Managed users may discover and start assigned recorders but cannot self-assign.
- Retrying an add or start request returns the existing assignment/operation. Account, recorder, and assignment locks serialize competing requests; another account cannot take an active assignment.
- Migration `007_account_recorder_setup.sql` allows setup operations without an invitation-token row. Assignments, setup operations and optional invitation tokens remain separate concepts. Existing QR operations are preserved.
- Released assignments disappear from discovery. Ending an assignment revokes direct setup operations as well as invitation-based operations.
- The mobile controller saves the operation to its recovery journal before advancing and ignores late responses after sign-out/account changes. Failure to persist does not advance to pairing.
- An older API returning 404 for discovery retains the legacy invitation path. Network/service errors present a retry; they are not misreported as “no recorder.”

## Verification

- `pnpm check`: passed (type checks, lint/import boundaries, 585 unit tests, 25 release-tooling tests, API and website production builds).
- PostgreSQL integration suite: 60 tests across 10 files passed using disposable schemas. Includes concurrent add/start, cross-account rejection, managed-user limits, admin ownership scope, released assignments, revoked setup and explicit reauthorization.
- Expo exports for Android, iOS and web completed. These are local preview bundles, not signed or published phone installers.
- Browser at 390px: public install page without a token; in-app sign-in using a disposable local account; invalid serial feedback; model/serial entry; successful save; direct transition to `/recorder`; the same recorder visible in the web workspace; mobile header wrapping and optional QR controls.
- Browser cannot validate Plaud Bluetooth. No physical recorder, real account, public server or vendor binding was modified for these checks.

## Secure-connection investigation

Jake's original report reached **Finishing secure setup**, but it did not include a build number or native failure code. Build 10 already adds sanitized connection-stage diagnostics, retains a 30-second handshake deadline and offers **Settings → Copy setup details**. The unit suite checks timeout/cancellation, callback order, mismatched recorder identity and rejection after partial success.

Compared the current bridge/controller against Plaud's official [Android SDK](https://docs.plaud.ai/plaud-embedded/android-sdk) and [advanced Android SDK](https://docs.plaud.ai/plaud-embedded/advanced-android-sdk) documentation on September 22:

- The Android bridge waits for partner keys and signs the serial before connecting; the model mapping includes `882 → notepins` and `881 → notepro`.
- It sets the partner API domain and uses the per-user SDK token. No credentials were changed.
- The controller requires Bluetooth connection, a successful bind callback matching the assigned serial, and recorder readiness. A Bluetooth link alone is never reported as success.
- The documentation recommends cloud binding after the successful device bind callback; the existing shared controller currently cloud-binds first. This is a sequence difference to investigate, **not evidence that it caused Jake's failure**. Do not reorder an established cross-platform pairing contract without a failing trace/test and iOS compatibility review.
- No forced ownership recovery, device reset, relaxed success criteria or speculative SDK changes were introduced.

**Next evidence:** Jake should capture Settings → Copy setup details immediately after the failure, before retrying or closing the app. The latest stage/detail and confirmation flags distinguish key/signing, ownership rejection, Bluetooth and missing readiness. The physical failure remains unconfirmed and unresolved.

## Rollout dependency

At the time of the initial implementation, this work was local and the public
download remained build 10. The API, website and Android rollout below has since
completed for build 11; iOS distribution and physical acceptance remain pending.

1. Deploy the API and migration 007 first. Verify the new authenticated routes and existing invitation/unpair routes.
2. Prepare new iOS/Android installers with a new build number and the public API origin. Do not overwrite a published build number or distribute the local preview export.
3. Publish the website and updated Android download together. Retain the existing iPhone distribution configuration until the corresponding build is available.
4. Test fresh-account, existing-assignment, invitation, restart, unpair/re-pair, permission denial and transfer/playback on physical Android and iPhone devices.

Successful build and local UI checks do not establish Bluetooth success or store acceptance.
