# Pilot 0.1.2 (8) deployment

September 15, 2026 (America/Denver); backend activated September 16 at 03:38 UTC.
Source: `0d68194e3aebfab8d5eaae352d49ab10bb0e1ce8`, pushed to `main` before deployment.
The reviewed cross-store branch was fast-forwarded into `main`. The original
untracked Google audit was byte-identical to the committed version and preserved.

## Published

- Website: https://plaud.aptlyable.info, Amplify app `d3gnng58sv940j`, branch
  `pilot`, us-west-2, account `116981808374`. Job **8 SUCCEED**.
- Android download: https://plaud.aptlyable.info/downloads/aptly-able-android.apk,
  **0.1.2 (8)**, standalone `com.aptlyable.mobile`, arm64-v8a, production API.
  55,191,463 bytes; SHA-256
  `b190c060b63bf2d3bfd546e68d21876c37a00adedc4c07b9d9c380c7f20dd1d0`.
  APK signatures were verified and its certificate matches the previously live
  build 7, allowing an in-place update without uninstalling.
- Backend: https://api.plaud.aptlyable.info, existing EC2 instance
  `i-066c05c21f8aa2665`, us-east-2, account `816069168722`.
  `current` points to
  `/opt/aptly-able-pilot/releases/20260916T033632Z-0.1.2-build8-0d68194`.
  Image tag `aptly-able-pilot-api:0.1.2-build8`; manifest digest
  `sha256:8a760ef4c4b6a2a928fbef59b044ba83869e40e21ca038924e0ec34a7710c242`;
  image config digest
  `sha256:335f2d6a74203411529c75ec8d3e4726a13e885d59325a5d152cade06e1b5334`.

This publishes the reviewed transfer recovery, native lifecycle, import-copy
cleanup, enrollment-link validation, permission disclosure, backup exclusions,
public deletion instructions and deletion-operator improvements. See
[cross-store changes](cross-store-readiness.md) and
[recovery/cleanup details](cross-store-recovery-cleanup.md).

## Server preservation and recovery

The image was built off-host for Linux/amd64. Uploaded image/source hashes,
revision label, image configuration/layers and effective Compose configuration
were verified before activation. Only the API container was replaced. Postgres
and Vaultwarden retained their container IDs, images, start times and mounts.
The API recording volume, private configuration and Caddy hash were unchanged.
No DNS, routing, signing-key or database-schema change was made.

Fresh custom-format database backup:
`/opt/aptly-able-pilot/backups/pilot-before-activation-20260916T033746Z.dump`.
SHA-256 `2fe0bcbbf73d0e9b1de5d7b8bdda7765f55d2ec6230d2300938d4f931bccc79b`.
A mode-600 off-host copy has the same hash; `pg_restore --list` passed. This is
archive-readability evidence, not a full restore rehearsal. Existing migrations
001–006 matched every release checksum, so no migration was run.

Previous backend release:
`/opt/aptly-able-pilot/releases/20260915T222716Z-0.1.2-build7-f8b5f12`.
The previous website is retained locally as `rollback-job-7.zip`; all 23 previous
public files were verified against live before replacement. Preserve accepted
deletion requests and review compatibility before any backend rollback; never
restore an old database over newer user data as routine application rollback.

Temporary TCP/22 access from `67.190.112.149/32` was removed after deployment.
AWS showed exactly the four original rule IDs; the SSH control connection was
closed. No persistent deployment access was added.

## Verification

- On merged `main`: `pnpm check` passed **524 unit tests**, **17 release-script
  checks**, workspace typechecks, lint/import boundaries and API/admin builds.
- **53 PostgreSQL integration tests** passed using local disposable schemas.
- Signed Android release build and signature, package/version and bundled API
  checks passed. Physical pairing/transfer acceptance was not performed.
- All **25 published file hashes** matched the prepared website, including the
  full APK. All nine entry routes passed (`/`, enrollment, dashboard, privacy and
  support, including trailing slashes). Required headers passed; missing APKs
  remain 404. The display-only demo, enrollment flow and older hashed assets were
  preserved. Existing Amplify rewrites were unchanged.
- Public support/account-deletion content rendered correctly in the browser.
- API HTTPS readiness, pilot-only auth, unauthenticated deletion-route rejection,
  schema reads/checksums and Vaultwarden HTTPS health passed. The updated deletion
  operator reported no pending/overdue requests. No real account, assignment,
  recorder binding or vendor data was changed by verification.

## Limits and evidence

Installed phones do not update automatically. Android users install the new APK
over the existing app. The iPhone installation was **not** updated; it needs a
separate native build/install. No TestFlight or Google Play upload was performed.
This is a pilot release; SDK logging/privacy, codec compatibility, store evidence
and physical-device acceptance gates remain open. No readiness flags were bypassed
or marked verified by this deployment.

Ignored private release artifacts, backups, deployment scripts, signing checks,
container-preservation evidence and live-verification output are in
`.local/releases/0.1.2-build8/`. The earlier worktree is retained because it holds
verification evidence and native artifacts, not deleted as routine branch cleanup.
