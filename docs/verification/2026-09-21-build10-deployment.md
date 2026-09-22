# Pilot 0.1.2 (10) deployment

Published September 21, 2026 at 18:07 MDT (September 22 at 00:07 UTC).
Application source: `56f310edf7242e3715de062e9e6151469df0897f`, pushed to
`main` before deployment. The prepared phone-recording branch was fast-forwarded
into `main`, including the earlier recording-location commits.

## Published release

- Website: https://plaud.aptlyable.info, Amplify app `d3gnng58sv940j`, branch
  `pilot`, us-west-2, account `116981808374`. Job **9 SUCCEED**; both DEPLOY and
  VERIFY succeeded.
- Android: https://plaud.aptlyable.info/downloads/aptly-able-android.apk,
  **0.1.2 (10)**, `com.aptlyable.mobile`, ARM64, standalone pilot build using
  `https://api.plaud.aptlyable.info`. Size: **57,049,579 bytes**.
- APK SHA-256:
  `bb75684103b6d5a05f9fd8eb8b296528e76680f8af6a9ae612372a2931965918`.
- Complete published website ZIP SHA-256:
  `cd7b71db5d888fec66445b367fe384c021f4d528138be7edf2f4b9140d3e67cf`.

The downloaded public APK signature was verified. Its certificate matches build 8,
so users can install this update over the existing application. Updating the
website does not update an installed phone automatically. No iOS build 10 was
distributed and no TestFlight or Google Play submission was made.

## Changes users will see

1. Phone-only setup with **Continue on this phone**, consistent **Add your
   recorder** labels, and a clear next step to create the setup link/QR.
2. Explicit Android download/install steps, an app-icon checkpoint, Samsung
   installation help, and a copy/selectable-link fallback if the app does not open.
3. Enrollment links received at the app level, retained through sign-in, with an
   indication that the invitation was received. A new incoming link takes priority
   over a delayed launch URL.
4. NotePin S charging/wake instructions before searching, plus guidance for a
   recorder still paired to another app/account.
5. More useful secure-connection progress and error messages. The existing
   30-second deadline and cancellation behavior remain in place. **Copy setup
   details** in Settings reports allowlisted connection stages and confirmation
   results without credentials, serial numbers, recording content or coordinates.
6. Earlier prepared phone-microphone recording, pause/resume/save/discard, owned
   draft recovery, and Android ongoing-recording notification support. Phone audio
   is saved locally first; this release does not configure server transcription.
7. Earlier opt-in Plaud recording-location support. It is off by default and
   stores phone location locally. Phone-microphone recording does not start the
   Plaud-only location feature.

The native SDK binary and required secure-pairing confirmations were preserved.
SDK provenance, inspection tooling and store-readiness documentation are also
committed. This release does not resolve the outstanding vendor/store gates.

## Deployment preservation and rollback

The previous complete website ZIP was compared against all **25** previously
published file hashes before replacement, then retained as `rollback-job-8.zip`.
Its SHA-256 is
`0785a44d21055ac8e2d08584d0be0b8c452271f51d853efa54327e3baab955fc`.
Ten older hashed assets were added to the fresh website bundle so previously open
pages can still load their existing chunks. The deployed ZIP contains 28 public
files plus the unchanged `customHttp.yml` hosting configuration.

The API/contracts have no changes relative to the previously deployed main
revision. No backend container, database, DNS record, security rule, signing
identity or Amplify rewrite was changed. The existing EC2 API remains healthy.

An initial deployment request was rejected for an expired request timestamp,
before creating a job. A fresh request created job 9 and succeeded. No partial
release was activated by the rejected request.

To roll back the website, upload the retained complete job-8 ZIP to the existing
Amplify branch. This does not downgrade applications already installed on phones;
an application correction should normally use a higher build number.

## Verification

- Fresh shared suite: **576 tests across 53 files passed**.
- Fresh release-tooling suite: **25 tests passed**.
- Workspace typechecks, lint/import boundaries and staged whitespace checks passed.
- Build preparation: signed Android release compilation passed; **38 Android
  native tests** passed. See the linked setup report for preparation evidence.
- All **28 public file hashes** match the prepared release, including the complete
  downloaded APK. Its package, version, build number and signing identity passed.
- All **nine entry routes** served the expected new index with required headers:
  `/`, enrollment, dashboard, privacy and support, including trailing slashes.
  Missing APK requests still return 404. Existing Amplify rewrites match the
  pre-deployment snapshot. The API readiness endpoint returns `{"status":"ok"}`.
- The public installation page was checked at 390 px: updated instructions,
  Samsung help, invitation fallback and selectable link render without horizontal
  overflow. The continuation link retains its synthetic invitation token. No real
  account, assignment or recorder was modified during verification.

Private local evidence, package manifests, checksums, rollback ZIP and deployment
receipts are under `.local/releases/0.1.2-build10/` and remain outside Git.

## Remaining acceptance

Jake's original secure-setup failure has **not been reproduced or proven fixed**
on physical hardware. Install build 10 over his existing app, confirm the build in
Settings, and follow the [physical setup test](2026-09-21-jake-android-setup.md#next-physical-test).
If setup fails, collect **Settings → Copy setup details** immediately before
retrying or closing the app. Real-phone enrollment handoff, Plaud pairing/transfer,
microphone/background recording, location and store acceptance remain separate
tests. iOS requires a new signed native build and its own installation/testing.

Related: [setup changes](2026-09-21-jake-android-setup.md),
[phone recording](2026-09-18-phone-recording.md),
[recording location](../RECORDING_LOCATION.md),
[submission gates](2026-09-18-submission-gates.md).
