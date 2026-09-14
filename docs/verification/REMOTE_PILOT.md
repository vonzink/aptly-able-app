# Remote pilot verification — September 14, 2026

## Live

- Website: https://plaud.aptlyable.info, Amplify `d3gnng58sv940j`, branch `pilot`,
  us-west-2; deployment 4 SUCCEED. Website and both enrollment routes match the
  published archive. Android version 0.1.0, build 4 is available for download.
- Backend: https://api.plaud.aptlyable.info on Ohio EC2
  `i-066c05c21f8aa2665`, Elastic IP `3.142.86.151`. Backend release
  `20260914-pool-9ec1539` deployed at 23:40 UTC with separate database pools.
  [Release checks and rollback](2026-09-14-backend-pool-isolation.md) record the
  live authenticated checks and preserved recorder assignment.
- `/health/ready` returns `{"status":"ok"}`. `/v1/auth/config` returns pilot
  enabled and development disabled. HTTPS certificates validate normally.
- During the initial deployment, Caddy was validated and reloaded with an added API hostname. Vaultwarden HTTPS
  remained 200; its original container was not restarted or replaced.
- Initial-deployment browser acceptance used a synthetic test account and serial: registration,
  owner default, NotePin S selection, assignment, Android QR, installation route,
  matching fragment continuation, platform change clearing the displayed QR,
  confirmed iPhone replacement QR, release of the test assignment, logout and
  returning-account login. The test account credentials/sessions were then
  removed; its released synthetic assignment remains as audit history.
- The Android APK was streamed from the public URL and its complete SHA-256
  compared with the signed local artifact. Headers identify an APK attachment.
- Job 4 publishes the UX cleanup, model-specific device photos, animated status
  meters, recording controls, and local recording titles/notes. Notes can use the
  phone keyboard's dictation; they are not uploaded to the server.
- The build 4 update changed the Amplify website/download package and Zachary's
  installed iPhone app. That release did not update the backend. Mobile/admin
  typechecks, scoped UI lint, import boundaries, native release builds, signing,
  bundle checks and live artifact checks passed. Automated suites and physical
  Plaud acceptance were not rerun.
- Job 4 evidence: `.local/web-distribution/20260914T222020Z/`, including
  `live-verification.json`, `deployment.json`, iPhone install/inventory/launch
  results, and `DEPLOYMENT-RESULTS.md`. `published-website.zip` is the uploaded
  archive; `rollback-job-3.zip` was verified against the preceding live HTML/APK.
  `source-build-4.tar.gz` preserves the source snapshot used for this release.
- The live browser account page finished loading its signup form successfully.

## Initial-deployment automated/local evidence (not rerun for job 4)

- `pnpm check`: 350 tests in 35 files; TypeScript, lint, module boundaries and
  workspace builds passed. Logs: `.local/remote-pilot/workspace-check.log` and
  `.local/remote-pilot/workspace-check-final.log`.
- Database integration checks: 33 tests in 6 files using temporary schemas.
  Covered account registration/login/logout/expiry and cross-account isolation
  for list/read/create/issue/revoke/end/claim.
- Auth proxy tests cover distinct clients through the single trusted proxy and
  reject client-IP spoofing from an untrusted source.
- Separate reviews covered identity, owner authorization/QR handling and release
  packaging. Findings about shared proxy throttling and stale server origins
  were fixed and reviewed again.
- Local browser screenshots in `output/playwright/` were inspected. Phone
  installation layout was checked at width 390 with no horizontal overflow.
- Linux/amd64 API image built locally, loaded on EC2 and passed readiness after
  migrations. API/Postgres are limited to 384/256 MiB on the shared host.

## Native artifacts

Android: `.local/remote-pilot/downloads/aptly-able-android.apk`, 53,578,526 bytes,
version 0.1.0, build 4, arm64-v8a.
Normal package `com.aptlyable.mobile`, native Plaud SDK, bundled JavaScript,
private pilot signing identity; API `https://api.plaud.aptlyable.info`.

SHA-256: `68f33438f08163783c83723cabe6fd85cd8dfe87f8212e3647fb18885d8db0a1`.
The certificate matches the APK from the actual previous Amplify deployment.

An earlier build using the same native packaging launched in the Android emulator
without Metro. The final-domain rebuild was signature/metadata checked and its
public download verified. Physical Android Bluetooth pairing and transfer have
not been accepted. The emulator cannot prove those behaviors.

iOS: `.local/remote-pilot/ios/AptlyAble-2026-09-14T22-20-41-099Z.xcarchive`.
Version 0.1.0, build 4 was signed and installed on Zachary's registered iPhone
with Wi-Fi transfer capabilities enabled. Installation and app inventory were
confirmed. The initial launch was blocked by the locked phone; the later
[account recovery](2026-09-14-recorder-account-recovery.md) successfully opened
the enrollment link in the installed app. Physical reconnection and Wi-Fi
transfer still need acceptance. Build evidence: `.local/web-distribution/20260914T222020Z/`.

An App Store distribution export was uploaded to App Store Connect as
**AA FieldSense**, app ID `6812058827`, version 0.1.0, build 3. Upload succeeded;
Apple processing completion was not checked. The owner then paused TestFlight.
No review was submitted, no testers were invited and no public invitation link
was enabled. The website deliberately has no iPhone download link. Existing
iPhone installations can still use enrollment links.

## Owner trial steps

1. Open the website and create an account; keep the password (no reset flow yet).
2. Assign a Plaud NotePin S to yourself using its complete printed serial.
3. Select Android and generate the enrollment QR. On the same phone, tap
   **Open setup** beside the QR; a computer is not required. If using a computer,
   scan its QR with the phone instead.
4. Download and install the APK. Return to the same setup page and tap
   **Continue setup in Aptly Able**.
5. Sign into the app with the same account. Accept the assignment, allow
   Bluetooth, and connect the powered-on nearby recorder.
6. Record a short conversation, stop recording, and verify automatic transfer,
   playback, offline retention, deletion and reconnection on that physical
   Android phone. Export to Files/share is still an open audit item.

## Remaining work and limits

- First physical Android acceptance above; capture the exact on-screen error if
  pairing or transfer fails. No recorder was paired/unpaired by these web tests.
- Apple processing/review and a real TestFlight invitation are deferred at the
  owner's request. Signing and upload are complete; website iPhone download
  remains unavailable until distribution is resumed and a URL is configured.
- Server audio upload, automatic transcript processing and Aptly Able AI remain
  the explicitly unconfigured integration stubs. Hosting does not enable them.
- Email verification/reset, production security review, monitoring and automated
  off-host backups remain future work. This is a private pilot, not a public
  production-readiness claim.

Operational details and rollback: `../EXISTING_EC2_PILOT.md`. Amplify/DNS details:
`../AMPLIFY_PILOT.md`. Android/iOS signing details: `../ANDROID_PILOT.md` and
`../IOS_PILOT.md`. Private runtime files and signing keys are outside every public
website archive. The standalone application source is committed and pushed in
`9ec1539`; the recovered audit and remaining-work list were pushed in `d19e0c3`.
The backend image records source revision `9ec1539`. The ignored source snapshot
above also preserves the earlier build 4 input independently of Git.
