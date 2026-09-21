# Apple and Google release readiness

**Current status (September 18):** see [submission gates and SDK intake](2026-09-18-submission-gates.md). The official Plaud repository now resolves and its release labeled 1.0.57 was inspected. Its ARM64 LAME codec still fails 16 KB ELF checks; the candidate also removes types used by our bridge. It was not installed. Use the [updated vendor request](../operations/plaud-sdk-submission-request.md), not the historical 404 request below. New microphone/location/Live Activity work also needs final-build review.

Date: 2026-09-15. Baseline: `eed0214`; implementation branch: `codex/cross-store-readiness`.

Subsequent integration: these reviewed changes were merged to `main` and deployed
as [pilot 0.1.2 (8)](2026-09-15-build8-deployment.md). The initial local-validation
results below are historical; installed iPhones were not updated by deployment.

This record covers the shared app, platform-specific packaging and account-deletion operations. It is not an approval certificate. Nothing in this pass uploads to either store, deploys services, replaces signing keys or updates installed phones.

The subsequent [recovery and temporary-file cleanup pass](cross-store-recovery-cleanup.md)
adds fixes and newer build evidence. Its results supersede the initial candidate below.

## Implemented in this pass

- Android recorder setup explains Nearby devices/Bluetooth and precise + approximate location before SDK initialization/scan. Declining retains local library use. Denied access provides Settings recovery. Consent is scoped to the current enrollment; iOS retains its existing flow.
- App-specific privacy and support pages explain external account deletion without requiring the app. Public email instructions include ownership verification and the owner-approved seven-day deadline. Submission metadata points to these app-specific pages; privacy/vendor review flags remain false.
- Android removes overlay, legacy storage, biometric/fingerprint and install-referrer permissions. It preserves the SDK's current location requirements and `neverForLocation` Bluetooth/Wi-Fi flags. Imports use the system document picker; hardware/older-OS regression checks remain required.
- Android excludes application data from cloud backup and device transfer, including vendor preferences. Audio remains explicitly exportable from the app. This does not erase existing backups or prove vendor-side deletion.
- Android updates Commons IO to 2.22.0, Bouncy Castle to 1.85.2 and Conscrypt to 2.6.3. These are targeted replacements for audited affected/prebuilt dependencies, not a wholesale framework upgrade.
- Native Android scan and adapter exceptions are contained, pending calls settle once, and delayed work is lifecycle-scoped. A process-wide export lease prevents concurrent writes after timeout/reload. Missing callbacks produce a bounded failure without falsely claiming the exporter stopped.
- Enrollment parser rejects untrusted origins/schemes, credentials and ambiguous tokens. Raw invitation tokens and the current production/custom-scheme flow remain available. Loopback links are development-only; verified Android App Links remain future delivery work.
- Deletion operator status reports the full pending backlog, deadlines and failures. Confirmation retries are idempotent and conflicting evidence is rejected. No alert scheduler was deployed.

## Android store commands

Set the explicit store environment described in the Google audit, existing signing variables and:

- `APTLY_BUNDLETOOL_JAR`: downloaded official Google bundletool JAR (not a new signing key).
- `APTLY_ANDROID_CERT_SHA256`: reviewed SHA-256 of the existing release/upload certificate. Do not substitute a debug certificate or assume it is the future Play app-signing certificate.
- `ANDROID_HOME` and `JAVA_HOME` for the installed Android SDK and JDK.

Regenerate the Android project with `pnpm --filter @aptly/mobile exec expo prebuild --platform android --no-install` in that environment after source configuration changes. Review the generated manifest. Then:

```sh
pnpm android:store                      # dry run and outstanding evidence
pnpm android:store --execute --inspect  # local candidate plus inspection; fails if blocked
pnpm android:store --execute            # requires reviewed readiness evidence
pnpm android:store:verify /absolute/path/app-release.aab
```

Commands do not generate signing keys, provision accounts, upload, or bypass vendor/readiness findings. Verification checks identity/version, explicit profile markers, target SDK, permission allowlist, backup resource references and decoded contents (including qualified variants), signature/fingerprint, native bundle alignment and every ELF LOAD segment, production JS origin and accidental key/env packaging. RELRO warnings require toolchain/device investigation; ZIP alignment alone does not prove device compatibility. Review newly resolved Maven dependencies and re-run advisory analysis when upgrading; a JavaScript-only audit is insufficient.

Use existing `pnpm ios:store` and `pnpm ios:store:verify` for Apple. Do not mark Apple privacy/signing evidence complete because an Android bundle builds. Increment `release.json` before the next distributed build; current version remains 0.1.2/build 7 during this local verification.

## Still required before submission

| Gate                           | Required evidence / owner action                                                                                                                                                                                                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plaud-supported Android binary | Supported AAR/license/checksum, native codec 16 KB support, release logging controls, safe cancellation contract. Public `Plaud-AI/plaud-sdk-public` still returned 404 during this pass.                                                                                                       |
| Third-party privacy            | Document exact iOS/Android SDK endpoints, sent data, local files/preferences, retention, required-reason APIs/manifests/signatures as applicable, and processor/erasure terms. Observe final-build traffic/logs; do not infer vendor behavior from first-party UI.                              |
| Privacy policy / forms         | Owner approval of the public app notice and accurate Google Data Safety / Apple App Privacy answers. Publish this updated notice when deploying. Do not claim no data collected.                                                                                                                |
| Deletion fulfillment           | Staff the support mailbox, identity verification, operator monitoring, Plaud erasure and backup cleanup. Prove a disposable account completes within seven days. Decide receipt retention before adding automated receipt purging. See the deletion runbook.                                    |
| Devices                        | Physical iPhone and Android NotePin S/Note Pro pairing, transfer, playback, permission denial/revocation, Bluetooth toggle, foreground/background, reload/process death, account switching and low storage. Android 16 KB device/emulator packaging checks do not replace physical Plaud tests. |
| Console / signing              | Apple distribution validation, Play upload/app-signing identities, next build number, access credentials/hardware-review instructions, screenshots/ratings/content declarations, testing-track eligibility and pre-launch reports. These are not established by local checks.                   |

## Vendor request to send

We are integrating Plaud Embedded in Aptly Able on iOS and Android. Our Android AAR is identified as 1.0.13, SHA-256 `d342c8ca58a7326fb4f11e73ce23e00ae21a83c4bc399d869835e14013c6ab02`. Your documented public repository returns 404. Please supply the supported SDK, license, dependency list and checksum, and confirm:

1. 16 KB-compatible Android native codecs (including `liblame.so`).
2. A supported way to disable all sensitive HTTP/body/header logging in release builds and remove old SDK logs/preferences safely.
3. A cancel-and-wait/terminal contract for Bluetooth/Wi-Fi export, including callback loss and decoder workers.
4. Whether Android 12+ pairing can avoid precise/approximate location and which SDK version supports it.
5. Exact data inventory, endpoints, retention and user erasure process for both SDKs; Apple SDK privacy/required-reason/signing evidence where applicable.

This text is a draft request; no message has been sent.

## Primary references checked

- [Plaud Android SDK and permission contract](https://docs.plaud.ai/plaud-embedded/android-sdk)
- [Google native page-size compatibility](https://developer.android.com/guide/practices/page-sizes)
- [Google backup and device-transfer exclusions](https://developer.android.com/identity/data/autobackup)
- [Apache Commons IO security](https://commons.apache.org/proper/commons-io/security.html)
- [Bouncy Castle release source](https://github.com/bcgit/bc-java)
- [Google Conscrypt](https://github.com/google/conscrypt)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

## Initial verification results (before the follow-up)

- Shared unit tests: **513 passed**; typechecking and ESLint/import boundaries passed.
- PostgreSQL integration tests: **53 passed** across 9 files using isolated schemas, including operator CLI and evidence retry behavior.
- Android native tests: **13 passed**, including deterministic teardown/completion interleaving. Final Kotlin release compilation and signed AAB build passed. Two earlier compile attempts caught a type-inference issue and a source-edit/build timing mismatch; both were resolved before the final successful run.
- Release-script regression tests: **14 passed**, including invalid origins/profiles, unexpected/missing/capped permissions, absent or malformed target SDK, signing errors, and bad ELF alignment.
- iOS production JavaScript export and API/admin production builds passed. No fresh signed iOS archive, installation, TestFlight upload or physical-device test was performed in this pass.
- Resolved Maven graph: **242 components**, expected Commons IO 2.22.0 / Bouncy Castle 1.85.2 / Conscrypt 2.6.3 present; OSV batch returned **zero advisory matches** at query time. This does not establish absence of all vulnerabilities or vendor binary safety.
- Final AAB: `apps/mobile/android/app/build/outputs/bundle/release/app-release.aab`, SHA-256 `6d54d63ea2e6fa1db74f2aa17ba2fc4fd934ea2fa40398649e94b72ed498a5fc`. Identity/profile, target SDK, allowed permissions, signature/certificate and native ZIP alignment checks passed. Its 28 native libraries were inspected; **Conscrypt alignment is fixed, Plaud liblame remains 4 KB aligned**. 23 RELRO warnings still require toolchain/16 KB runtime evidence.
- Actual packaged backup XML was decoded from the AAB using Google's protobuf schema. Each root/file/database/sharedpref/external exclusion occurs in the legacy, cloud-backup and device-transfer sections. This was a manual artifact check; the automated verifier checks the resource references, not their decoded contents.
- The submission verifier intentionally **fails** on the remaining vendor codec alignment and unverified readiness flags. No flags were fabricated or silently bypassed.

Ignored evidence lives in this worktree's `.local/cross-store/`. All changes are local; live notices, services and installed apps have not changed.

## Review disposition

Task-scoped review and independent whole-branch review approved the implementation. The native teardown race and release-verifier gaps identified during review were fixed and re-reviewed. This approval covers code quality and the stated scope, not store acceptance. Branch `codex/cross-store-readiness` is retained locally for integration; `main`, the server and installed apps remain unchanged.
