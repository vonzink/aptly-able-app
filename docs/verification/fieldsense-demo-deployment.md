# Field Sense demo deployment

## Release

- Live demo: https://plaud.aptlyable.info/dashboard
- Source commit: `8b05b16deb82ee3c42bad3f515f519f69c16ec06`.
- Amplify app `d3gnng58sv940j` (`aptly-able-pilot`), branch `pilot`, `us-west-2`.
- Job **5**, deployment and verification steps **SUCCEED**.
- Deployment completed September 15, 2026 at 02:31:36 UTC
  (September 14 at 8:31 PM Mountain time).
- ZIP: 35,389,143 bytes; SHA-256
  `6f6c0bd65563077ac54fed2d8b14f5b226c4e8b69364f207c35fa8ca64c7536a`.

The Dashboard link beside Sign out opens a separate tab to preserve the recorder
workspace session and any displayed invitation. The lazy-loaded demo contains
sample data, local interactions and simulated activity only. It does not connect
to accounts, Plaud devices, recordings, transcription, uploads or AI services.

## Preservation

The complete website package retains every file from job 4, replacing its entry
HTML and adding the new bundles and licensed fonts. Existing hashed assets remain
available for already-open pages. Only `/dashboard` and `/dashboard/` rewrites
were added; the two enrollment rewrites and response headers were preserved.
Missing APK requests still return HTTP 404 rather than the application HTML.

The signed Android APK remains version 0.1.0, build 4, 53,578,526 bytes, SHA-256:
`68f33438f08163783c83723cabe6fd85cd8dfe87f8212e3647fb18885d8db0a1`.
No phone reinstall or update is required for this website demo. No EC2, backend,
database, DNS, native app, device assignment or vendor binding was changed.

## Verification

- Production build uses `https://api.plaud.aptlyable.info` and the existing HTTPS
  APK URL; no local development API endpoint is present in the new main bundle.
- Admin TypeScript/build, targeted ESLint, formatting, import boundaries and
  committed-diff whitespace checks passed.
- Live `/`, `/dashboard`, `/dashboard/`, `/enroll` and `/enroll/` returned HTTP 200
  with HTML matching the release. All 20 public files matched the local manifest,
  including the complete APK and its attachment/content-type headers.
  `customHttp.yml` is deployment configuration and is not publicly served.
- Live API readiness returned `{"status":"ok"}`. Auth configuration retained
  `pilotEnabled: true` and `developmentEnabled: false`.
- Browser verification covered direct demo loading, fleet filtering, the correct
  employee profile, sample recording dialog and Revenue Radar navigation. No
  browser warnings/errors were reported. The original account page loaded its
  form successfully. Registration/login and physical pairing were not exercised.
- The preceding local review covered desktop/phone layouts, tablet overflow,
  employee sorting, period switching, report progress and employee report scope.
  Broad automated suites and hardware acceptance were not rerun for this demo.

HTTP verification completed at 02:34:02 UTC on September 15, 2026.

## Evidence and rollback

Ignored local evidence directory:
`.local/web-distribution/20260915T022924Z-fieldsense/`.

It contains `published-website.zip`, `site-manifest.json`, `deployment.json`,
`live-verification.json`, `previous-release.json`, `previous-routing.json` and
`rollback-job-4.zip`. Deployment upload URLs are stored separately in a private
file and must not be committed or shared.

Before release, the rollback ZIP's HTML and APK were matched to the live job 4
site. To roll back this release, deploy that complete ZIP to the same Amplify app
and branch, then restore `previous-routing.json` as its custom rules. Retain the
current headers and domain configuration. Recheck HTML, enrollment routes and APK
hash after rollback. No server or database restoration is needed.
