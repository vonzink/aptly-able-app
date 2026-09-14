# Enrollment dashboard and mobile verification

Date: 2026-09-10. Status: this local UI/API integration phase is complete. All source remains in the app workspace, uncommitted within the parent AptlyAble repository. No deployment, push, branch switch or sibling application changes were performed.

## Delivered

- A separate React administrator dashboard with local access, paginated recorder assignments, known-user selection, QR issuance/replacement, status inspection and explicit revocation/release confirmation.
- Mobile enrollment with fragment/manual invitation entry, local user verification, server-side assignee validation, stable idempotent claims, saved-operation recovery and revocation handling. Hardware setup remains pending; the recorder simulation is isolated.
- A shared, platform-neutral HTTP client with strict response validation, cancellation, timeout and safe error handling. Client/server/UI import boundaries are executable checks.
- Role-checked admin read models and an authenticated claim-key recovery endpoint. Migration 002 adds user display names/read indexes; migration 001 is unchanged.
- Exact browser-origin allowlisting, separate local administrator/user credentials and reproducible local setup with ignored credential files.
- Recovery regression fixes covering delayed native storage, stale responses, initial link delivery, reopening the original QR, initial offline recovery, missing claims, immediate sign-out, replacement after revocation and router history preservation.

## Executed final checks

| Check                                                                          | Result                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check`                                                                   | Pass: TypeScript in all five packages/apps, ESLint, dependency boundaries, 76 tests in 13 files, contracts/client/API/admin builds                                                                                                   |
| `TEST_DATABASE_URL=... pnpm test:integration`                                  | Pass: 16 real Postgres integration tests in two files; isolated temporary schemas                                                                                                                                                    |
| `TEST_DATABASE_URL=... node apps/api/test/runtime-smoke.mjs` after fresh build | Pass: compiled migrations twice, seed twice, live HTTP readiness, session roles, denied admin reads, user/assignment read models, QR issuance, ownership denial, concurrent claim, token-free claim recovery, revocation and release |
| Runtime smoke log inspection                                                   | Generated credentials, invitation token and full test serial absent from API/CLI logs                                                                                                                                                |
| `pnpm format:check`                                                            | Pass                                                                                                                                                                                                                                 |
| `pnpm --filter @aptly/mobile exec expo install --check`                        | Dependencies up to date                                                                                                                                                                                                              |
| `pnpm --filter @aptly/mobile export`                                           | Pass: iOS, Android and web JavaScript/assets; 68 assets                                                                                                                                                                              |
| `pnpm peers check`                                                             | No peer dependency issues                                                                                                                                                                                                            |
| `pnpm install --frozen-lockfile --offline`                                     | Pass; lockfile/dependencies already up to date                                                                                                                                                                                       |
| Build artifact scan                                                            | Local admin/user credentials absent from admin and all mobile export artifacts                                                                                                                                                       |
| Independent scoped source review                                               | All original findings and follow-up regressions addressed; reviewer independently passed 26 focused tests and checked missing-claim recovery without a retained invitation                                                           |

Expo export is not an Xcode/Gradle compilation, signed IPA/APK, physical-device test or Bluetooth proof. The export printed terminal color-environment warnings; bundling completed successfully.

## Browser verification

Used a dedicated headed Chromium session against the real local API/Postgres and development servers. Only generated local users and a synthetic serial `LOCAL-8810004812` were used.

1. Administrator sign-in → select Zach (local test) → assign recorder → issue locally generated QR.
2. Open setup link → invitation fragment removed from address bar → user sign-in → correct suffix 4812 → Continue setup → Enrollment saved, hardware pending.
3. Same-tab reload → sign-in again → saved operation restored without reopening the invitation or issuing a new claim.
4. Dashboard refresh → Claimed/Enrollment saved and QR controls removed.
5. Explicit administrator invitation revocation → mobile Refresh status → Enrollment no longer available.
6. Mobile Enter a new invitation → manual replacement link → correct recorder preview.
7. Fault injection: successful revoke POST followed by aborted detail GET → error with no QR/copy/open controls or stale selected detail; Refresh recovered authoritative state.
8. Repeated the same fault injection for assignment release; refresh showed released state. All test QR invitations are now revoked.
9. Checked browser ordinary storage for access codes/invitation tokens; only enrollment recovery identifiers persisted. Checked fragment absence after sign-in, claim and reload.
10. Dashboard at 1440px and 393px, mobile enrollment at 393px: no horizontal overflow; screenshots visually inspected. Admin reload after favicon correction reported no browser console errors; fault-injected requests produced expected network errors during those checks.

Ignored local artifacts:

- `output/playwright/admin-enrollment-desktop.png`
- `output/playwright/admin-enrollment-phone.png`
- `output/playwright/mobile-enrollment-saved.png`
- `output/playwright/admin-revocation-recovered.png`

The QR in captured dashboard images is a revoked local test invitation. Initial exploratory browser runs were interrupted by development Fast Refresh and included selector mistakes; the successful sequences above were rerun after the controller/link fixes. Browser automation did not install or pair a physical recorder.

## Retained local state

Postgres is running on `127.0.0.1:55432`. Public application data now contains two local users, one released synthetic assignment, three revoked invitation tokens and one revoked setup operation. Integration/runtime-smoke schemas were removed. This supersedes the earlier backend phase's empty/stopped local database snapshot.

The local API is running at `127.0.0.1:4100`, the administrator app at `http://localhost:8089`, and Expo web at `http://localhost:8088`. Development credentials are in ignored `apps/api/.env` and `.local/development-access.txt`, each mode 0600; the `.local` directory is mode 0700. These local services are intentionally left running for review. Restart commands are in the README.

Applied checksums match current SQL:

```text
001_enrollment.sql
c9e1fe5afe880d5f791613c53015e461c091c7d53784eff5f9a23422480a9db8
002_user_display_names.sql
b04f2202cc6777cf1156ff12812373788cd647e82f635fd347a571f6601582d3
```

Add a new migration for future schema changes. Do not edit either applied file.

## Remaining scope

Production authentication/provider selection, account provisioning, hosted API/storage, verified HTTPS Universal/App Links, installation continuation and store distribution are not implemented. The native custom scheme and SecureStore/link adapters are bundled but have not been exercised on devices. A physical phone cannot use this computer's loopback URLs.

Plaud cloud binding, real Bluetooth discovery/connection, recording transfer and transcription/AI processing remain future work. The original Plaud Note is not supported by the selected Embedded integration; verified SDK access and supported hardware are prerequisites. No enrollment operation can be marked hardware-complete in this phase.

Web recovery survives same-tab reload through session storage; closing the tab may remove it. Native recovery uses SecureStore but still requires sign-in after restart. Explicit sign-out clears the current journal. The server supports multiple recorder assignments, while this first mobile enrollment feature journals one selected enrollment at a time.

## References

- [Setup and organization](../../README.md)
- [API contracts and retry rules](../ENROLLMENT_API.md)
- [Implementation plan](../superpowers/plans/2026-09-10-enrollment-ui.md)
- [Independent source review](enrollment-ui-review.md)
- [Mobile implementation evidence](mobile-enrollment-report.md)
