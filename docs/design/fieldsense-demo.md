# Field Sense dashboard demo

## Scope

Display-only React demo at `/dashboard`, reached from a subtle Dashboard link beside
Sign out. The link opens a new tab to preserve the in-memory recorder workspace
session and any displayed enrollment QR. The demo has no authentication, API client,
device access, upload, microphone, AI request, or persistent data storage.

The supplied `design_handoff_fieldsense_dashboard` HTML and README are design and
sample-content references. Their runtime is not shipped or executed by this app.

## Design direction

- Palette: page `#050b16`, content `#07142a`, card `#0c1e39`, action `#1565c0`,
  accent `#4da3ff`, primary text `#e8f0fb`. Green, amber and red indicate sample status.
- Typography: locally hosted Plus Jakarta Sans for UI, JetBrains Mono for quantities
  and timers. Use the supplied compact scale and left alignment.
- Layout: the 212px CallSense sidebar and blue topbar frame three distinct views.

```text
Sidebar       Topbar: demo label, simulated clock, sample company
              Mission: KPIs / 8-device fleet / feed + actionable flags
              Employee: roster / profile, schedule, device health + moments
              Revenue: trend + departments / opportunities + sample reports
```

The design follows the supplied CallSense branding and blue operational-console
style. Preserve the requested content and hierarchy, rather than inventing a new
landing-page aesthetic. Adjust the prototype's fixed minimum width and clipped
height to a responsive, scrollable layout. Keep small text readable, controls
keyboard accessible, and motion pausable with reduced-motion support.

## Demo interactions

Three views, fleet filters, employee sorting and selection, period switching,
simulated feed/recording timers, a pause control, report-generation animation and
sample report/recording dialogs. Every apparent upload/playback/report action is
explicitly a preview. No real files are selected, uploaded or played. A persistent
demo banner distinguishes sample telemetry and financial figures from live data.

## Structure

`apps/admin/src/features/fieldsense-demo/`: typed fixture data, presentation helpers,
small shared components, simulation state, three view components, and CSS modules.
The route is lazy-loaded so the recorder workspace does not load demo code or fonts.

## Delivery

Published through the existing Amplify website after local implementation and
browser review. This change does not replace the native phone builds or change
the pairing/backend workflow. The `/dashboard` and `/dashboard/` rewrites support
direct links and refreshes without changing missing-download handling.

## Verification

- Admin TypeScript, production build, targeted ESLint and repository import-boundary
  checks pass. No backend or native test suite was run for this display-only change.
- Browser review at 1560px and 390px covered all three views, device filters,
  employee sorting, period changes, simulated report progress and preview dialogs.
- Employee reports retain the selected person's coaching; switching employees
  offers a new report. Escape closes previews and returns focus to the trigger.
- Mobile navigation closes on selection. Views and dialogs fit the phone viewport;
  wide tables and schedules scroll within their own containers.
- Source inspection confirms no network client, device, upload, audio or storage
  integration in the demo feature. Existing enrollment routing remains separate.

Fonts are hosted locally with their SIL Open Font License files in
`apps/admin/public/fonts/fieldsense/`. No design-handoff JavaScript is included.

Deployment status and release evidence are recorded separately in
`docs/verification/fieldsense-demo-deployment.md`. No phone app update is required
for this website demo.
