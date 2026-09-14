# UX cleanup — first pass

Status: implemented locally on `codex/aptly-reliability-cleanup`. Not deployed or
included in a new phone build. Jake's published Android build and the live website
were not changed during this pass.

## Completed

- Fixed missing whitespace in the account-page heading at phone widths. Reduced
  the mobile hero and grouped form labels with their inputs.
- Applied the primary button appearance to primary links, including installation
  and invitation recovery. Unavailable downloads use a neutral notice.
- Made the current dashboard navigation item non-navigating so it cannot reload
  the page and discard the in-memory session.
- Re-selecting the current assignment now returns without clearing its QR.
- Added self-service dashboard wording and model-specific serial examples. This
  does not implement model/serial validation or a correction workflow.
- Darkened muted mobile text in light and dark themes. Added persistent visible
  labels to mobile sign-in fields and vertical padding for wrapped button labels.
- Removed the LOCAL badge from ordinary mobile screens. Simulation screens still
  explicitly display SIMULATED.
- Replaced Download to phone with Keep offline in app throughout the mobile UI
  and relevant errors. Storage and enrollment copy now describes the user action
  directly. Retention, deletion, transfer, and pairing behavior were not changed.

## Verification

- Admin TypeScript check: passed.
- Mobile TypeScript check: passed.
- ESLint on all changed TypeScript/TSX files: passed.
- `git diff --check`: passed.
- Local visual review of signup at 390 × 844 and 1440 × 900: heading spacing is
  correct and no horizontal overflow was observed. The first mobile input moved
  from 625 px in the audit to 422 px; the create-account action is now visible
  within the initial phone viewport.
- Local invitation-recovery page: the primary link visibly uses navy/white.
- Muted text contrast calculated from the theme tokens: light backgrounds range
  from 4.74:1 to 5.44:1; dark backgrounds range from 5.04:1 to 7.52:1.
- Local account configuration was a read-only fixture. No real account was
  created or modified. Preview servers were stopped and temporary tabs closed.
- Automated suites, authenticated QR interaction, native rendering, and physical
  pairing/transfer checks were not run. QR retention was reviewed in source.

## Next changes, one at a time

Follow-up: items 1–3 below and initial shared UI/signed-out improvements were
implemented in [the second pass](2026-09-14-ux-cleanup-pass-2.md). Session
restoration, model validation, guided setup, and audio export remain open.

1. Confirmations for Unpair recorder and Clear temporary audio.
2. Separate audio availability and transcript status in recording rows.
3. Move the recording library above secondary storage/import explanations.
4. Session restoration and explicit signed-out library/account states.
5. Reconcile model/serial validation and provide a safe correction workflow.
6. Guided setup progress, true audio export, and shared UI primitives.

Prior native/signing/distribution changes in the working tree were preserved.
No backend, database, SDK, signing, version, deployment, or distribution changes
were made for this cleanup. A reviewed release is needed before testers receive
these UI updates.
