# Pilot 0.1.2 (11) deployment

Published September 22, 2026 at 13:53 MDT (19:53 UTC).
Application source: `fdc474fa55b92192ac6131df0c0226106ad015cf`, pushed to `main`
before deployment.

## Published and verified

- Website: https://plaud.aptlyable.info; Amplify app `d3gnng58sv940j`, branch
  `pilot`, us-west-2. Job **10 SUCCEED**, including DEPLOY and VERIFY.
- Setup/download page: https://plaud.aptlyable.info/enroll. It no longer requires
  a QR invitation or website login to reach the Android download.
- Public Android APK: https://plaud.aptlyable.info/downloads/aptly-able-android.apk.
  **0.1.2 (11)**, `com.aptlyable.mobile`, ARM64, standalone, production API origin.
  Size **57,062,503 bytes**; SHA-256
  `10fc76ae1aacdfbaa8edc583b22bcf1b9cf81cee79393836f8195c5679ca491d`.
- The downloaded APK's signature and package/version were checked. Its signing
  certificate matches public build 10, preserving the in-place update identity.
- Backend: https://api.plaud.aptlyable.info; existing EC2 host `i-066c05c21f8aa2665`.
  Release `/opt/aptly-able-pilot/releases/20260922T195041Z-0.1.2-build11-fdc474f`;
  image `aptly-able-pilot-api:0.1.2-build11`, loaded image digest
  `sha256:049f401bf950e9bf649db7f70c6b0dcdeae6565ccaff26fcd4f87816aa06105b`.
- Migration 007 applied before API activation. All seven migration checksums,
  nullable invitation-token column, authentication on the three new recorder
  setup routes, pilot authentication configuration, deletion-route rejection
  without authentication, and HTTPS readiness passed.
- All **31 public file hashes** and **nine entry routes** matched the prepared
  release. Missing APK requests return 404; required headers and existing
  Amplify rewrites are preserved. Complete website ZIP SHA-256:
  `6ae53f34b11000ca95c84ca16897273926379ad34501fd605ca3954e883073f6`.

## What changed

Build 11 introduces account-based setup inside the app: sign in, discover an
existing assigned recorder, or choose the model and enter the serial in the app.
QR invitations remain optional. Setup advances directly to Recorder and saves
recovery state before advancing. Repeated add/start requests reuse the existing
assignment/setup; managed-account and ownership boundaries remain enforced.

The website now leads with **Get the phone app**, explains opening the installed
app from its icon, and reports **Setup saved** for direct setup without implying
Bluetooth readiness. The no-invitation download page, fallback instructions,
home-page API configuration loading, and 390px layout were checked in the public
browser. No horizontal overflow was observed on the inspected pages.

This release also includes build 10's invitation handoff improvements, recorder
wake instructions, connection-stage progress, safe error details and
**Settings → Copy setup details**. The existing 30-second handshake deadline and
cancel behavior remain in place. These improve recovery and evidence collection;
they are **not proof that Jake's secure-connection failure is fixed**. The native
SDK and pairing success criteria were not changed in build 11.

## Preservation and recovery

- Built the API image off-host. Only the API container was replaced; Postgres and
  Vaultwarden container identities, start times, images and mounts were preserved.
  API recording mounts, private environment and Caddy configuration were checked.
  Both API and Vaultwarden HTTPS health checks passed after activation.
- No DNS, firewall, credential or signing-identity changes were made. Existing SSH
  access worked; no temporary rule was needed.
- Fresh database backup before migration/activation:
  `/opt/aptly-able-pilot/backups/pilot-before-activation-20260922T195225Z.dump`.
  Its mode-600 off-host copy has SHA-256
  `ecc4635720d88b859df629af7d277f4f3887d546198dfeda1af04f0efc218fe2`.
  Archive listing passed; a complete restore rehearsal was not performed.
- Previous backend build 8 and public website job 9 are retained. All 28 previous
  public file hashes were checked before publication. Retained rollback ZIP hash:
  `cd7b71db5d888fec66445b367fe384c021f4d528138be7edf2f4b9140d3e67cf`.
- Do not reverse migration 007 or restore a stale database over new user data.
  New direct setup operations have no invitation token; review compatibility and
  accepted deletion/setup requests before any backend rollback.

## Validation and remaining acceptance

- Fresh workspace checks: **585 unit tests**, **25 release checks**, typechecks,
  lint/import boundaries and API/website production builds passed.
- Fresh PostgreSQL integration checks: **60 tests** passed in disposable schemas.
- Signed Android release build and public artifact verification passed.
- No real account, assignment or Plaud binding was changed to verify deployment.
- Installed phones do not update automatically. Jake must install build 11 over
  his existing app and confirm the build in Settings. Do not uninstall to update.
- Real Samsung installation, pairing/handshake, recording transfer and playback
  remain to be tested. Collect setup details immediately after any failure.
- No iOS installer, TestFlight distribution or store submission was published in
  this release. Existing iPhone distribution configuration was preserved.

See [Jake's test checklist](../testing/JAKE_ANDROID_BUILD11.md) and the
[implementation and connection investigation](2026-09-22-simplified-setup.md).
Private deployment receipts, backups and release artifacts remain under
`.local/releases/0.1.2-build11/`, outside Git.
