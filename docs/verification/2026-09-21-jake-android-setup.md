# Jake’s Android setup feedback — 2026-09-21

Publication follow-up: build **0.1.2 (10)** and the website were subsequently
committed, pushed to `main`, and published in Amplify job **9**. See the
[deployment verification](2026-09-21-build10-deployment.md). The investigation and
preparation notes below describe the state before that publication.

## Evidence and scope

Reviewed the complete text and relevant embedded screenshots in the supplied
`FieldSense_Android_Setup_Workflow_Review_for_Zach_v5 (1).docx`.
The report confirms account creation, APK installation, successful enrollment via
a copied link, permission grants, and discovery of the assigned NotePin S. The
reported stopping point is **Finishing secure setup**. The report contains no
native failure code, app build number, or measured timeout duration. Do not call
this a missing SDK, codec failure, or confirmed ownership conflict on that evidence.

Read-only inspection of the public download on September 21 found **0.1.2 (8)**,
package `com.aptlyable.mobile`, SHA-256
`b190c060b63bf2d3bfd546e68d21876c37a00adedc4c07b9d9c380c7f20dd1d0`.
Some report screenshots have an older layout; Jake’s installed build is still
unconfirmed. The public site was not changed during this pass.

## Changes for each reported friction point

| Reported issue | Implementation | Remaining acceptance |
| --- | --- | --- |
| Invitation missing when the app opens | Enrollment links are received by the app provider, independent of whether the enrollment screen is mounted. New intents take precedence over a delayed launch URL, survive sign-in, and are removed on teardown. The screen now says when an invitation was received. | Cold launch, background resume and another-tab resume on Jake’s Samsung and an iPhone. |
| Forced detour to a computer or Slack | Dashboard offers **Continue on this phone** above the QR. Website and app explain phone-only setup. The app offers **Get a setup link on this phone**. | End-to-end fresh-account setup using only a phone. |
| QR lands on the download page again | That page is deliberately the installation bridge. It now explains skipping to step 2 if installed, has a copy-link fallback there, and provides a selectable link if clipboard access fails. No invitation secrets are put in query parameters. | Samsung browser/camera handoff and clipboard denial on a physical phone. |
| Android download versus install confusion | Explicit phone Downloads/APK/Install instructions, an app-icon checkpoint, and expandable Samsung/installation-blocker help. No device protections are changed by the app. | Confirm current Samsung wording on Jake’s phone. |
| Add versus assign confusion | The self-service workspace uses **Add your recorder** consistently, labels the assignee **Your account**, explains what adding does, and tells the user to create a setup link next. Administrative assignment remains distinct. | Review the authenticated mobile layout with a real test account. |
| Missing physical-recorder instruction | NotePin S charge, short-press and white-light instructions appear before search and on the setup website. Existing-app unpairing is explained without directing users to uninstall or reset the device. | Hardware instruction confirmation; Note Pro remains a separate model. |
| Secure setup gives no useful progress or recovery | The UI distinguishes Plaud authorization, Bluetooth connection, pairing confirmation and recorder readiness. The existing 30-second handshake deadline and cancel behavior are retained and regression-tested, including a native call that never settles. Errors link to Settings. | The original hardware failure is **not yet reproduced or proven fixed**. |
| Cannot diagnose the secure failure | Bridge forwards allowlisted `bleConnectStage` values from the installed Android SDK. Missing partner keys and failed device signing now have distinct safe errors. Settings **Copy setup details** includes stage/result and which confirmations arrived, without raw SDK text, serials, credentials or recording/location content. | Collect the report immediately after a failed physical attempt, before retrying or closing the app. |

Key code: `enrollment-link-intake.ts`, `EnrollmentScreen.tsx`,
`InstallationPage.tsx`, `SetupLinkFallback.tsx`, the assignment components,
`connection-diagnostics.ts`, `plaud-device-controller.ts`, and the Android
`PlaudConnectionProgress` / `PlaudSdkModule` bridge.

The Android SDK binary, binding token contract, server assignments, cloud binding,
and requirement for all three success callbacks were not changed. Progress alone
cannot mark a recorder ready. Confirmation evidence is retained after a failed
attempt, cleared before a new scan, and cleared when the enrollment/account changes.
The new progress event is declared on iOS for the shared listener surface; Android
is the platform that emits vendor stage details.

## Verification

- Full shared test suite: **576 tests across 53 files passed**.
- Release-tooling suite: **25 tests passed**.
- Android native module tests: **38 tests passed**, including 3 new progress
  sanitization/identity tests; Kotlin compilation passed.
- Type checks, lint/import-boundary checks and build checks passed.
- Browser check at 390 px: installation instructions, correct Android download
  destination, continuation link retaining its synthetic token, copy feedback,
  selectable manual fallback and no horizontal overflow. No real invitation was used.
- Signed ARM64 Android pilot build **0.1.2 (10)** prepared against
  `https://api.plaud.aptlyable.info`; standalone bundle/manifest/signature checks
  are performed by `scripts/android-pilot.mjs`.
- The signing certificate matches the public build-8 APK, enabling an in-place
  update. This is not evidence of installation, Bluetooth success or store approval.

The working tree also contains earlier, uncommitted phone-recording and submission
readiness work. Build 10 includes that working tree, not an isolated onboarding-only
release. No iOS build-10 IPA was prepared in this pass. Existing store/vendor and
physical-device release gates remain open.

Prepared local artifacts:

- `.local/releases/0.1.2-build10/aptly-able-android.apk`
- `.local/releases/0.1.2-build10/aptly-able-android.json`
- `.local/releases/0.1.2-build10/aptly-able-amplify.zip` — complete website assets,
  APK and existing hosting headers; built with the public pilot API/download URLs.
- `.local/releases/0.1.2-build10/SHA256SUMS.txt`

Final APK SHA-256:
`bb75684103b6d5a05f9fd8eb8b296528e76680f8af6a9ae612372a2931965918`.
Archive CRC and required-entry checks passed. These ignored build artifacts are
prepared for publishing; this pass did not commit, push, upload or deploy them.

## Next physical test

After publishing the prepared website/APK bundle, install the update over the
existing app. Do not uninstall, release the assignment or factory-reset the recorder
just to update the app. Confirm Settings shows **0.1.2 · Build 10**.

1. If enrollment is already saved, go straight to Recorder. Otherwise create/open
   its setup link on the phone, sign in with the assigned account, and accept it.
2. Charge/wake the NotePin S, keep it beside the phone, and ensure Bluetooth and
   internet access are available. If another app owns it, unpair there first while
   physically connected; a cloud assignment change alone does not prove device unpairing.
3. Search, connect, and wait for **Connected and ready** or the failure message.
   Do not record/import as proof of success until the connection is confirmed.
4. On failure, open Settings → **Copy setup details** before retrying, signing out
   or closing the app. Share that report and the displayed error with the project owner.
5. Once pairing succeeds, record a harmless sample and verify transfer and playback.

Vendor references inspected for callback and handshake behavior:
[Android SDK](https://docs.plaud.ai/plaud-embedded/android-sdk) and
[Advanced Android SDK](https://docs.plaud.ai/plaud-embedded/advanced-android-sdk).
No ownership recovery, firmware reset or vendor-binary replacement was attempted.
