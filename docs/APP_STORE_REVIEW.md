# Store review preparation

**Draft, not submitted.** Source is 0.1.0 build 6; no corresponding signed store build is verified. The chosen App Store listing name was AA FieldSense, while the app displays Aptly Able. Confirm final naming and asset rights before submitting metadata or screenshots.

## Intended store release

Native Plaud companion: create an account in-app or sign in, enroll an assigned recorder, Bluetooth connection/control, foreground audio transfer, supported Wi-Fi transfer, playback, titles/notes, local audio/transcript import, storage controls, unpair, privacy/support and account-deletion request.

The `store` release profile excludes firmware promotion and cloud/automatic AI transcription. GPS tracking, automatic cloud backup and the separate browser dashboard demonstration are not part of this app release. A physical recorder and iPhone are needed to validate hardware features.

## Fill in before App Store Connect review

- Final app name and actual validated version/build.
- Dedicated review account email; password entered only in App Store Connect's credential fields, never this repository or public review notes.
- Supported models actually tested, hardware access arrangement, recorder assignment and fresh enrollment instructions. Do not use a real customer recorder/account.
- Reachable review contact name, phone, availability and monitored email. Company contact email is info@aptlyable.com; confirm app support ownership.
- Private demonstration-video URL showing genuine hardware behavior and the shipped UI.
- Owner-approved public privacy URL, reachable support URL and screenshots from the exact shipping build.
- Evidence for encryption/export answers, SDK licenses/privacy/signatures, photo/brand rights, age rating and App Privacy labels.

## Reviewer walkthrough to verify before copying

1. Install the validated build. Sign in with the dedicated account and accept its recorder invitation if not already enrolled. Internet is needed for account and Plaud authentication.
2. Keep the assigned supported recorder powered on nearby. Open Recorder, allow Bluetooth and connect; wait for a confirmed ready state. Show any required prior-app release procedure verified for this model.
3. Start recording after confirming participant awareness. Sound is captured by the physical recorder, not the iPhone microphone. The global banner reports Recording or Paused; disconnected state is explicitly uncertain. Stop and save on the Recorder screen.
4. Keep the app foregrounded to receive audio. Open Recordings, listen, seek, label and add notes. Demonstrate temporary audio versus Keep offline in app and local deletion boundaries.
5. If Wi-Fi transfer ships, demonstrate its local-network join and permission purpose. Verify denial/retry and Bluetooth fallback before describing them to Apple.
6. Open Settings → Privacy & your recordings and Help & support. Both remain readable without a signed-in session; external company links need connectivity.
7. For deletion testing use a separate disposable account. Settings → Delete account asks for its password, literal DELETE and final confirmation. Accepted requests lock the account immediately, invalidate the local session and clean up that account's readable recorder downloads. Manual imports and hardware originals remain. The saved receipt gives a seven-day due date, refreshes after sign-out and accurately reports pending or overdue external/backup work; demonstrate completed erasure only after actual evidence exists.
8. Verify interruption after acceptance: reopen Settings → Delete account to recover the original receipt using the securely retained recovery credential. Recovery is a status lookup, not a second automatic deletion request. After receipt recovery succeeds, the retained status-only credential allows further checks until the app has saved confirmed completion. Test this without signing in again.

Use a harmless, owned sample audio/transcript for local import tests without hardware. Record its provenance; do not use customer conversations. A sample file is not a simulation of a Plaud connection.

## Final physical checklist

Fresh install/enrollment; existing-account restore; wrong password and offline sign-in; Bluetooth allow/deny; device button starts recording; pause/stop; leave Recorder tab; disconnect while active; Wi-Fi allow/deny; interrupted transfer/cache recovery; local import/export/delete; unpair plus dashboard release; offline privacy/help; large text/VoiceOver/Reduce Motion; iPad layouts/orientation if tablet support remains; deletion wrong password/cancel/accept/restart/retry/isolation; actual server/provider/backup completion.

Commands and artifact checks are in `verification/ios-store-packaging.md`. No push/deployment/signing/Apple submission is implied by this draft.
