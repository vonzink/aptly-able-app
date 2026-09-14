# Original design and UX audit — September 14, 2026

This is the original audit response from this project conversation at 21:17 UTC,
preserved unchanged below. Its findings, line numbers and scores describe the
application before the subsequent cleanup and build 4 release. For current status,
see [the reconciled remaining-work list](2026-09-14-remaining-work.md).

## 1. Executive Summary

**Overall Design / UX Health Score: 5/10**

**Maturity: rough but serviceable for a guided pilot. Not production-grade yet.**

The application has a recognizable visual identity: Inter typography, a consistent navy palette, restrained cards, and generally understandable buttons. The desktop account page looks credible. The separation between controllers and presentation is also a useful foundation.

The larger problem is the experience between screens. Users must understand accounts, assignments, invitations, enrollment, Bluetooth connection, temporary audio, and downloaded audio. The product exposes these distinctions without consistently guiding users through them.

**The product currently depends too much on someone explaining how to use it.** Your earlier questions about installation, pairing, transfers, and storage correspond directly to gaps still visible in the implementation.

I inspected the active dashboard and mobile screens, shared components, styling, state controllers, and relevant data contracts. I visually reviewed the live public account and invitation-recovery pages, including the account page at **1440 × 900** and **390 × 844**. Authenticated dashboard and native interactions were assessed from source. I did not create accounts, change assignments, run automated suites, or exercise hardware. **No project files were changed.**

## 2. Critical UX / Design Issues (Must Fix)

**1. Ordinary navigation can discard the website session. App restarts also require signing in again.**

Where: [App.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/admin/src/App.tsx:9), [Dashboard.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/admin/src/features/assignments/Dashboard.tsx:29), [development-credentials.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/services/development-credentials.ts:7).

- Website authentication lives only in React state.
- The sidebar uses a normal `href="/"`, which reloads the application and loses that state.
- Mobile pilot credentials also live only in memory; the saved enrollment journal does not restore authentication.
- On mobile, Plaud recordings are filtered by the signed-in account in [RecordingsProvider.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/recordings/RecordingsProvider.tsx:58). When signed out, these recordings disappear from the visible list even though their files remain.

**Consequence:** a returning user can interpret a sign-in reset or empty library as lost setup or lost recordings.

**Change:** implement deliberate session restoration, client-side navigation, and an explicit signed-out library state: “Sign in to view your recorder’s recordings.” Account identity and sign-out should live in Settings.

---

**2. Recorder registration can accept a model/serial combination that discovery will never match.**

Where: [AssignmentForm.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/admin/src/features/assignments/AssignmentForm.tsx:13), [enrollment.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/packages/contracts/src/enrollment.ts:14), [plaud-device-controller.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/plaud-device/plaud-device-controller.ts:228).

The form defaults to **NotePin S** but shows the serial example **8810004812**. The scanner expects a NotePin S serial to start with `882`; `881` is its Note Pro branch. Assignment validation checks the general serial format without checking that relationship.

**Consequence:** the dashboard can report a successful assignment, followed by repeated unsuccessful discovery on the phone.

**Change:** reconcile registration and discovery around one verified model/serial rule. Show model-specific guidance beside the serial field, validate incompatibilities before saving, and provide a safe correction path. Do not make the user discover a registration mistake through a Bluetooth timeout.

---

**3. Important destructive actions have inconsistent safeguards.**

Where: [PlaudDeviceScreen.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/plaud-device/PlaudDeviceScreen.tsx:253), [plaud-device-controller.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/plaud-device/plaud-device-controller.ts:451), [RecordingStorageCard.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/recordings/components/RecordingStorageCard.tsx:37).

- **Unpair recorder** immediately starts cloud and device release.
- **Clear temporary audio** immediately clears eligible cached recordings.
- Deleting an individual recording does have a confirmation.
- Dashboard assignment changes also have confirmations.

**Consequence:** users receive less protection for broad or disruptive actions than for deleting one recording.

**Change:** introduce consistent, consequence-specific confirmations. Unpairing should identify the recorder and explain the next setup requirement. Clearing audio should show how many recordings and how much space are affected, plus the requirement to reconnect to retrieve audio again.

---

**4. “Download to phone” creates the wrong expectation about file ownership.**

Where: [RecordingDetailScreen.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/recordings/RecordingDetailScreen.tsx:161), [recordings-controller.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/recordings/recordings-controller.ts:191), [recording-store.native.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/services/recordings/recording-store.native.ts:41).

The action retains audio in the app’s private Documents storage. It does not present an export destination or save a user-selected file outside the app.

The explanatory copy partially clarifies this, but the button remains easy to misunderstand.

**Consequence:** someone may believe they have an independent backup when they have only retained the app’s copy.

**Change:** distinguish three actions:

- **Keep offline in app**
- **Export audio…**
- **Remove downloaded audio**

Show the actual storage state beside each recording. Only display a backup confirmation after a real backup exists.

---

**5. The installation-to-pairing journey has no unified completion model.**

Where: [InstallationPage.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/admin/src/features/installation/InstallationPage.tsx:53), [EnrollmentScreen.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/enrollment/EnrollmentScreen.tsx:121), [AssignmentDetail.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/admin/src/features/assignments/AssignmentDetail.tsx:146).

The journey presents several apparent milestones:

- Assignment saved.
- Invitation created.
- Enrollment saved.
- Recorder connected.

The website asks users to install the app, return to the browser, open the app again, sign in, accept the assignment, navigate to Recorder, search, and connect. The dashboard’s setup indicator never becomes a complete device-pairing progress view.

**Consequence:** users reasonably ask “Am I done?” or stop after enrollment, believing pairing is complete.

**Change:** present one user-facing sequence: **Add recorder → Install app → Sign in → Connect recorder → Ready**. Keep assignments and enrollment tokens separate internally, but translate them into this simpler journey.

The website should explicitly say when it cannot confirm phone connection. Do not label invitation acceptance as successful pairing.

## 3. High-ROI Improvements

| Priority | Improvement | Specific change |
|---|---|---|
| High | Put recordings first | In [RecordingsScreen.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/recordings/RecordingsScreen.tsx:59), move the library and search above the full storage/import panels. Replace the large sync card with a compact status row. |
| High | Make Home operational | Replace the repeated marketing content in [index.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/app/index.tsx:23) with recorder status, the next required action, and recent recordings. |
| High | Compact phone registration | The live 390-pixel layout places the first input at **625 pixels** from the top. Reduce the mobile brand/story block and bring the account form into the initial viewport. |
| High | Separate setup from device management | In `PlaudDeviceScreen`, show only connection prerequisites during setup. Reveal recording controls, transfer settings, and maintenance after connection. |
| Medium | Give each recording independent status indicators | The library currently prioritizes “Transcript attached” over audio availability. Show **audio location** and **transcript state** separately. |
| Medium | Add a useful account/support area | Settings needs the signed-in account, sign-out, installation version/build, troubleshooting, and a support entry point. |

The visual direction does not require replacement. These changes would improve the product more than new gradients, shadows, or animation.

## 4. Design System / Consistency Problems

**The app has a palette and several primitives, but not a complete design system.**

**Primary links and primary buttons do not share their appearance.**

[styles.css](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/admin/src/styles.css:65) styles `button.primary`, while installation actions use `<a className="button primary">`.

Those links receive the generic white button styling rather than the navy primary treatment. I observed this on the invitation recovery action; the download and continuation links use the same pattern.

**Change:** share variant styles between button and link primitives.

**There are three competing mobile header implementations.**

- Shared `PageHeader`: 28/35 title sizing.
- Enrollment header: independently recreates essentially the same design.
- Recorder header: 31/38 sizing and different eyebrow treatment.

See [components.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/ui/components.tsx:18), [EnrollmentScreen.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/enrollment/EnrollmentScreen.tsx:317), and [PlaudDeviceScreen.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/plaud-device/PlaudDeviceScreen.tsx:276).

The shared header also forces either **LOCAL** or **SIMULATED**, making it unsuitable for ordinary product screens.

**Change:** make the badge optional and introduce explicit header sizes instead of duplicating headers.

**Spacing, typography, and radii are mostly local decisions.**

[theme.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/ui/theme.ts:3) defines colors and font families, but no spacing, radius, or typography roles. The admin stylesheet has 921 lines with many independent sizes and eight distinct radius declarations.

Different web and native dimensions are reasonable. Repeatedly inventing dimensions within each platform is the maintainability problem.

**Change:** define roles such as `body`, `caption`, `sectionHeading`, `screenTitle`, `controlRadius`, and `cardPadding`.

**Status colors are not consistently semantic.**

- Dashboard table invitation badges always use the base `.status` class.
- The detail panel adds state-specific classes.
- “iPhone test download is not available” uses the green `.notice` treatment.

**Change:** use shared `StatusBadge` and `Notice` components with explicit neutral, success, warning, and error tones.

## 5. UX Flow & Usability Problems

**The self-service experience still speaks like an administrator tool.**

[Dashboard.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/admin/src/features/assignments/Dashboard.tsx:53) tells an individual owner to “Give each person a recorder.” The form presents a Person selector even when only that user is available.

For Jake, the task is **Set up my recorder**. Team assignment management should be a separate mode.

**The currently selected recorder can destroy the displayed QR.**

[use-workspace.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/admin/src/features/assignments/use-workspace.ts:120) clears the invitation whenever an assignment is selected—even the current assignment. Its button remains clickable while labeled “Selected.”

The UI then says a replacement QR is required.

**Change:** make selecting the current row a no-op. Preserve the current invitation during harmless interaction within the authorized session. Keep deliberate replacement separate.

**Mobile dashboard selection does not bring the detail into view.**

At the small-screen breakpoint, [styles.css](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/admin/src/styles.css:797) stacks the detail after the entire list. Selecting a row updates state without moving focus or scrolling to the detail.

**Consequence:** “Manage” may appear to do nothing, particularly with a full page of assignments.

**Change:** open a dedicated detail route or focused sheet on small screens.

**Invitation entry is shown even when an invitation has already arrived.**

The signed-out branch of [EnrollmentScreen.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/enrollment/EnrollmentScreen.tsx:80) always displays the manual invitation card before sign-in.

**Change:** show “Invitation received” when the deep link has been accepted; collapse manual entry under “Use another invitation.”

**Account recovery is absent.**

[AccountAccess.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/admin/src/features/session/AccountAccess.tsx:149) openly states that password reset is unavailable. That honesty is good, but a remote user still has no recovery path.

Before broader use, provide password recovery or a clearly defined support-assisted process.

**Dashboard discovery will not scale.**

The assignment list has pagination but no search, filtering, or meaningful summary. The person selector uses “Load more people.”

For a growing team, add server-backed search by person/serial suffix and filters for setup status. A searchable person picker should replace manual pagination inside the assignment form.

## 6. Interaction Polish Gaps

**Loading state is too broad.**

[use-workspace.ts](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/admin/src/features/assignments/use-workspace.ts:39) uses one `busy` state for list loading, selection, creation, and invitation mutations.

Consequently, opening a detail can disable unrelated controls and make the list’s Refresh action say “Updating…”.

**Change:** track loading by operation and preserve usable content during background reads.

**Some failures have no useful visible recovery.**

- Clipboard failure in [AssignmentDetail.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/admin/src/features/assignments/AssignmentDetail.tsx:74) silently returns to “Copy setup link.”
- Account configuration failure tells users to reload the page.
- Several recorder errors offer retry text without a direct Settings or troubleshooting action.

**Change:** associate each error with an appropriate action: retry copying, retry connecting, open phone settings, or review the serial.

**Playback controls have uneven interaction behavior.**

The shared mobile Button has pressed and busy styling. The custom controls in [RecordingPlayer.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/recordings/components/RecordingPlayer.tsx:87) do not consistently provide the same feedback.

The native [PlaybackSlider.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/recordings/components/PlaybackSlider.tsx:17) is a tappable track without drag handling or a visible thumb.

**Change:** standardize control feedback and use a proper scrubber that supports dragging and accessible adjustment.

**Recording activity lacks an elapsed-time display.**

[PlaudRecorderControls.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/plaud-device/PlaudRecorderControls.tsx:11) distinguishes recording, paused, and idle, but does not show duration.

A recording screen should make “Is it still recording?” immediately answerable. Add elapsed time only from a reliable recording start/session signal.

**Firmware occupies too much attention during setup.**

The full [PlaudFirmwareCard.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/plaud-device/PlaudFirmwareCard.tsx:6) appears before connection feedback and actions.

Keep the requested “Coming soon” message, but move it to a compact maintenance row after setup.

## 7. Accessibility / Readability Concerns

**Confirmed: essential muted text is too faint.**

The shared `inkMuted` color, `#A3ADB8`, measures:

| Background | Contrast |
|---|---:|
| White | **2.28:1** |
| App background `#F5F7F9` | **2.12:1** |

It is used for section labels, inactive navigation labels, placeholders, and meter labels. These are meaningful text, not decoration. Normal text generally needs **4.5:1** under WCAG AA. [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

Change the token rather than correcting individual screens.

**Dashboard text gets unnecessarily small.**

[styles.css](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/admin/src/styles.css:400) uses 10-pixel table headers, 11-pixel metadata, and 9-pixel status badges on mobile.

This is particularly weak for a product used on phones and in working environments. Increase operational labels and status text; reserve very small type for genuinely secondary details.

**Mobile sign-in lacks persistent visible field labels.**

[PilotAccessCard.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/session/PilotAccessCard.tsx:56) supplies accessibility labels, which is positive, but relies on placeholders for sighted users. Those disappear during entry.

Use visible labels and associate help/error text with the relevant field. [W3C labels guidance](https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html).

**Form errors are not field-specific.**

Assignment validation combines person and serial errors into one generic message. Fields do not expose corresponding invalid states or descriptions.

Use field-level errors, retain entered values, and focus the first invalid field after submission.

**Native layout needs a focused accessibility acceptance pass.**

The shared Screen has no explicit keyboard-avoidance strategy. The recording deletion modal has no scrolling body or maximum-height treatment. Fixed horizontal layouts, such as battery/storage meters, also need checking with enlarged text.

These are implementation risks, not confirmed device failures. Verify keyboard access, large text, landscape dialogs, and VoiceOver/TalkBack before production claims.

There are useful foundations already: visible web focus outlines, native button labels, semantic web dialogs, and accessible meter summaries.

## 8. Structural Front-End Issues Affecting UX

**The largest presentation-maintenance risk is the global admin stylesheet.**

[styles.css](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/admin/src/styles.css:1) mixes typography, primitives, authentication layouts, tables, dialogs, installation screens, and responsive overrides.

Its global selectors make unrelated screens depend on each other. The primary-link defect is a concrete example.

**Refactor:** split tokens, primitives, layouts, and feature styles. Do not merely divide the file into arbitrary equal-sized chunks.

**The shared Screen cannot support an efficient growing library.**

[components.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/ui/components.tsx:7) always wraps children in a `ScrollView`. `RecordingsScreen` renders every recording with `.map()`.

**Refactor:** provide separate scroll and list screen containers, allowing a virtualized library with a compact list header.

**Playback repeatedly rerenders transcript content.**

`RecordingPlayer` updates every 250 milliseconds and passes the current time through both transcript implementations. Both map their entire segment arrays during render.

This is a clear scaling risk for long conversations, although I did not measure runtime lag.

**Refactor:** separate playback controls from transcript rendering, derive the active segment, and update only affected rows. Virtualize long transcripts.

**Generated and imported transcripts duplicate the same reader.**

[TranscriptPanel.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/recordings/components/TranscriptPanel.tsx:58) and [GenerationPanel.tsx](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/mobile/src/features/transcription/GenerationPanel.tsx:260) independently render timestamps, speakers, selected segments, and text.

**Refactor:** use one `TranscriptReader` with separate source/status controls.

**State presentation is scattered.**

Recorder status language is assembled across Home notices, Recorder, sync cards, Wi-Fi cards, and controller error strings. That makes contradictory messages increasingly likely.

Preserve the underlying controllers, but introduce shared presentation models for setup, connection, transfer, and recording availability.

## 9. Step-by-Step Improvement Plan

1. **Define the user-facing states and terminology.** Establish exactly what “ready,” “connected,” “saved,” “offline,” and “backed up” mean.
2. **Fix session continuity and registration inconsistencies.** Prevent navigation logout, make returning-account states explicit, and reconcile model/serial validation.
3. **Protect consequential actions.** Standardize unpair, clear-cache, transcript replacement, and deletion confirmations.
4. **Establish accessible UI primitives.** Correct contrast, button/link variants, fields, notices, headers, and typography roles.
5. **Rebuild the setup journey around completion.** Support both same-phone setup and desktop-to-phone QR setup, with a clear recovery path.
6. **Reorder Home and Recordings around daily use.** Prioritize connection status, recent audio, search, and playback.
7. **Clarify retention and export.** Separate keeping audio in the app from exporting it and from cloud backup.
8. **Consolidate transcript and status presentation.** Remove duplicated readers and conflicting status copy.
9. **Add account and support surfaces.** Include account identity, recovery, build information, and actionable troubleshooting.
10. **Perform targeted acceptance when testing resumes.** Cover interrupted setup, app restart, expired invitations, denied permissions, long recordings, enlarged text, and destructive actions before adding cosmetic polish.

## 10. Specific Refactor / Redesign Recommendations

**Proposed front-end organization**

```text
packages/design-tokens/
  colors.ts
  typography.ts
  spacing.ts
  semantics.ts

apps/admin/src/
  app/
    Router.tsx
    SessionProvider.tsx
    WorkspaceLayout.tsx
  ui/
    Button.tsx
    ButtonLink.tsx
    FormField.tsx
    Notice.tsx
    StatusBadge.tsx
    ConfirmDialog.tsx
  features/
    account/
    recorder-setup/
    assignments/
    installation/
  styles/
    tokens.css
    primitives.css
    layouts.css

apps/mobile/src/
  ui/
    Screen.tsx
    ListScreen.tsx
    ScreenHeader.tsx
    FormField.tsx
    Notice.tsx
    ConfirmDialog.tsx
  features/
    account/
    recorder-setup/
    plaud-device/
    recordings/
      RecordingList.tsx
      RecordingAvailability.tsx
      RecordingActions.tsx
      TranscriptReader.tsx
      TranscriptSegmentRow.tsx
```

Share token meaning across platforms; keep platform-appropriate control implementations.

**Redesign the first-time dashboard**

```text
Set up your recorder

1. Recorder details
   Model
   Serial number
   Where to find the serial

2. Phone
   Android
   iPhone — existing installations only during this pilot

3. Continue on your phone
   On this phone: Continue setup
   On another phone: Scan QR

Status
   Invitation accepted
   Phone connection: check in app
```

For a self-service account, remove the Person field and team-management language. Show advanced assignment administration separately.

**Redesign the recordings screen**

```text
Recordings                         Add audio

Recorder connected
Receiving recording 2 of 3 · 64%

Search recordings

Today
  Customer conversation
  12 minutes · Available offline
  Transcript: Not available

Yesterday
  Site visit
  Audio on recorder · Reconnect to listen

Storage: 62 MB temporary              Manage
```

Only show transfer counts when known. Keep storage management accessible without placing its full explanation above every recording.

**Redesign recording actions**

| Current | Proposed |
|---|---|
| Download to phone | Keep offline in app |
| No separate export action | Export audio… |
| Clear temporary audio | Free temporary storage… |
| One combined transcript/audio label | Separate audio and transcript states |
| “Automatic transcription is waiting…” when unconfigured | “Automatic transcripts — coming soon” |
| Sign out inside transcript controls | Account → Sign out |

**Fix the mobile heading at its source.**

The live heading renders **“Great conversations.A simple start.”** at narrow widths. [styles.css](/Users/zacharyzink/AptlyAble/aptly-able-app/apps/admin/src/styles.css:760) hides the `<br>` and attempts to supply spacing through its pseudo-element.

Use two text spans with explicit responsive layout or a real whitespace boundary. Do not rely on generated content on a hidden line break.

## 11. Professional Benchmark Assessment

| Dimension | Current assessment | Expected from a strong production product |
|---|---|---|
| Visual identity | Coherent and credible | Consistent across desktop, phone, and all states |
| First-time setup | Requires explanation | One guided journey with visible completion |
| Returning use | Session resets and misleading empty states | Reliable restoration and clear account context |
| Recording ownership | Explained through scattered copy | Unambiguous availability, retention, export, and backup |
| Interaction quality | Functional, uneven feedback | Predictable loading, recovery, confirmation, and success |
| Accessibility | Useful foundations, confirmed contrast problems | Readable tokens and verified assistive interaction |
| Design system | Partial primitives and local styling | Shared semantic patterns with controlled variation |
| Scale | Suitable for a small pilot | Searchable administration and efficient large libraries |

**The current product is credible enough for Jake’s supported pilot, but it is not yet polished enough for independent professional use at scale.**

The best next investment is a focused UX stabilization pass around **session continuity, guided pairing, recording ownership, and the recordings screen**. Those changes will make it feel substantially more professional without replacing the existing visual identity.
