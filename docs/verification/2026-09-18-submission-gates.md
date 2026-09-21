# Submission gates: current evidence and next actions

Checked September 18, 2026. This supersedes the current-status portions of the September 15 checklist, not its historical test results. Work is on `codex/phone-recording`; no SDK replacement, deployment, store upload, legal acceptance or account deletion was performed in this pass.

## Decision

Follow-up: [workaround feasibility and newly located public terms](2026-09-18-plaud-workarounds.md) identifies a possible Android WAV/PCM-to-M4A path and which vendor questions may already be answered by the applicable account agreement. No workaround has been installed or verified on hardware.

Resolve vendor distribution, native codec and privacy issues before preparing a submission candidate. Keep hardware pilot testing separate from store acceptance. None of the six submission gates is fully closed yet.

The official repository is now accessible. Its September 16 commit is labeled **“Official release: Plaud SDK v1.0.57 with iOS and Android template apps.”** This resolves the old download/404 problem. It does **not** resolve the Android native codec or licensing problems.

## 1. Android SDK intake — blocked

| Evidence                       | Installed integration                                              | Official candidate, not installed                                  |
| ------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Source                         | `JinpeiHan/plaud-sdk`                                              | `Plaud-AI/plaud-sdk-public`                                        |
| Commit                         | `c5111a44938b8739313dcb5f105f696c6af8ad8d`                         | `8d7541e503cb96043e8629624aa6cee0241daa03`                         |
| Release label                  | 1.0.13                                                             | 1.0.57 (commit label, not inferred from manifest)                  |
| AAR bytes                      | 2,836,768                                                          | 2,752,467                                                          |
| AAR SHA-256                    | `d342c8ca58a7326fb4f11e73ce23e00ae21a83c4bc399d869835e14013c6ab02` | `041a6f8814d350dbc8bcd4a515487136529bb8bb4368fc88c9b36c9a386aedce` |
| ARM64 native failure           | `liblame.so`: 4 KB LOAD alignment                                  | Same failure                                                       |
| Other included 64-bit failures | x86_64 `liblame.so`, `libopus.so`                                  | Same failures                                                      |
| Current bridge types           | Present in `classes.jar`                                           | `TntAgent`, `Constants.DeviceStatus` absent                        |
| Binary license                 | Not established by fork download                                   | README explicitly reserves a separate proprietary binary license   |

Our current store build ships ARM64 only. The x86_64 findings describe additional files in the AAR; they are not additional libraries in the ARM64 store bundle. All 20 native files are inventoried; 10 ARM64/x86_64 libraries receive ELF inspection. RELRO warnings remain warnings requiring toolchain/runtime review. Neither ZIP alignment nor a successful checksum clears an ELF failure.

Machine-readable results, containing no credentials or customer data:

- [Installed 1.0.13 intake](evidence/plaud-android-1.0.13-intake.json)
- [Official candidate intake](evidence/plaud-android-1.0.57-intake.json)

Reproduce with a quarantined candidate. Download only from the pinned public source; do not overwrite `android/libs/plaud-sdk.aar`:

```sh
pnpm native:inspect:android .local/plaud-official-1.0.57/plaud-sdk.aar 041a6f8814d350dbc8bcd4a515487136529bb8bb4368fc88c9b36c9a386aedce
```

Exit 1 is expected for this candidate. The checker verifies the supplied checksum before inspecting archive/class inventory and ELF LOAD segments, rejects unsafe/duplicate archive entries, and never executes or installs vendor code. It does not validate all method signatures, runtime behavior or vendor support. The existing final AAB verifier remains necessary.

### Integration work after an acceptable SDK arrives

`PlaudSdkModule.kt` currently uses `NiceBuildSdk` for region/key/signature preparation and `TntAgent`/`Constants.DeviceStatus` for recording state and handshake status. The new README restricts integration to the public facade and callback/data types. Do not mechanically delete handshake or recording-state checks to make compilation pass.

1. Verify vendor checksum, license, supported models and native codecs in quarantine.
2. Map handshake preparation to the supported `PlaudDeviceAgent` flow and `bleConnectStage`/bind/handshake callbacks. Preserve serial validation, timeout, cancellation and account boundaries.
3. Replace internal recording reads with `refreshRecordState`/`bleRecordStateRefreshed`; prove delayed start/resume events cannot restart location after stop/disconnect.
4. Review Wi-Fi callbacks, export callbacks and error semantics; preserve export ownership until a documented terminal event. `stopSyncFile` and `endWiFiTransfer` are not evidence of decoder-worker termination.
5. Configure the vendor-supported release logging controls. `setBleLogLevel(Log.INFO)` is documented as BLE verbosity, not a full network/file-log disable switch.
6. Review the resolved Maven graph. Do not copy the sample's older Conscrypt, crypto and networking versions over our audited dependency pins.
7. Compile, run focused native regressions, inspect the final signed bundle and test a 16 KB Android environment. Then perform physical Plaud acceptance before changing the production dependency pin.

## 2. Third-party privacy — partial static evidence, runtime/vendor evidence pending

### Android candidate evidence

Static inspection of the exact candidate above establishes:

- `sdk.network.PartnerApiService` contains `/open/partner/sdk/gen-key`, `/sn-sign`, `/sn-verify` and `/metadata` paths (all under `/open/partner/sdk`).
- `sdk.util.SharedPreferenceManager` contains `sdk_prefs` storage for `sdk_token`, `api_token` and SDK permission data. This is a code-path inventory, not proof of which fields a real pairing writes or when they are erased.
- `sdk.util.Logger` configures `filesDir/plaud_sdk_logs`, Logback and Timber trees. `res/raw/logback.xml` declares INFO file output, 20 MB rollover, 168 hourly history periods and a 100 MB cap. That configuration is not proof of actual retention or secure deletion on phones.
- The candidate's `com.plaud.sdk.internalimpl.WezenValidationService` contains request and response header/body logging. Authorization and device-signature header handling retains portions of long values rather than fully redacting them. No real production token or customer payload was captured in this pass.
- Embedded strings include China, Japan, beta and development hosts. Their presence does **not** establish that our US-configured app contacts them. Capture actual destinations before answering regional-processing or store privacy questions.
- The public facade includes BLE logging control but no observed cancel-and-await audio-export API. Neither this static observation nor the absence of a privacy file proves compliance/noncompliance for all vendor processing.

Local inspection output is in ignored `.local/plaud-official-1.0.57/`. The SDK was not initialized and no provider requests, bind/unbind operations or customer-data transfers were performed by this inspection.

### iOS installed SDK evidence

The existing frameworks are from the integration pinned in `modules/plaud-sdk/UPSTREAM.md`. Their plist version/build strings are all `1.0`/`1`; those generic values cannot uniquely identify a Plaud release. Use binary hashes and source commit when requesting support:

| Framework           | Local executable SHA-256                                           |
| ------------------- | ------------------------------------------------------------------ |
| PlaudBleSDK         | `55487f135ef2c33a1cc6433017ca5c4c7df42f1140b82aa860cdace5bb8f3154` |
| PlaudWiFiSDK        | `b468530d7904b358e805da2a2ddfc31cc21a001622a45a61aac6d838086d4698` |
| PlaudDeviceBasicSDK | `7574af368aee4c22cf92b1747c01e90a2c8ecd2a15e38e22b5d89a0916e0a2f8` |

No `PrivacyInfo.xcprivacy` is present within these three local framework folders. Obtain the applicable vendor required-reason API, privacy-manifest and signature guidance. Absence alone is not a conclusion that Apple mandates a standalone manifest for each of these binaries. Validate the final application's aggregate manifest and Apple's actual distribution result.

All three executable hashes were independently compared with fresh downloads from the pinned official React Native commit and matched. They are now pinned in `sdk-artifacts.json` and checked by `pnpm native:check:ios` and the iOS store archive command. This prevents unnoticed executable replacement; it does not verify a complete framework resource tree, a vendor signature, distribution rights or final archived bytes.

### Capture required on the shipping build

Use disposable accounts and synthetic audio. Record the exact app/build hash, SDK hashes, OS/device, region, permissions, account state and enabled features. Exercise initialization, pairing, BLE/Wi-Fi transfer, optional upload, sign-out/account switch and deletion. Record actual hosts, data categories/purposes, storage paths, cleanup behavior and diagnostic output; keep raw captures private and redact tokens, serials and payloads from review artifacts. Do not disable production TLS checks to obtain a capture. Reconcile static findings, observed behavior and Plaud's written processing/erasure terms; unexplained traffic keeps the gate open.

## 3–6. Remaining gates and completion evidence

| Gate                   | Work already prepared                                                                                              | What closes it / accountable party                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Policy and store forms | Shared app notice in `packages/product-content/src/index.ts`, `/privacy`, `/support`, owner-review document        | Aptly Able owner approves the final notice and processor inventory; publish and verify anonymous public pages; reconcile Google Data Safety and Apple App Privacy against the exact build. Forms have not been submitted.                                                                                                                                                                                                      |
| Deletion operations    | Seven-day deadline, durable service cleanup, operator CLI and [runbook](../operations/account-deletion-runbook.md) | Owner names primary/backup operators, confirms monitored support mailbox and actual backup/receipt retention. Run one authorized disposable-account case through service, Plaud and backup erasure with dated completion/restore-protection evidence within its original seven days. No real account was deleted in this pass.                                                                                                 |
| Physical devices       | Existing hardware scenarios and native build checks                                                                | Tester records iPhone/Android model and OS, NotePin S/Note Pro firmware, build/hash and results for pairing, transfer, playback, denied/revoked permissions, Bluetooth toggles, lock/background, process death, account switching, unpair, low storage and recovery. Add phone microphone interruptions and lock-screen controls; location must stop on pause/stop/disconnect. Emulator/compile checks do not close this gate. |
| Store/signing          | Separate pilot/store commands and verification scripts                                                             | Owner/engineer confirms distribution identities, next unused build number, iOS Live Activity extension/App Group profiles, Play app-signing/upload identity, reviewer access and hardware instructions. Capture Apple validation and Play pre-launch/testing-track results, screenshots, ratings and content declarations for the final candidate.                                                                             |

Microphone recording, background audio, local-only location and the Live Activity added after the original audit must be included in the next policy, permission, hardware and signing review. No readiness flag has been set true. `providerDistributionReviewed` now blocks **both** store release paths until the exact SDK distribution rights/support are documented, separately from privacy review.

## Order of work

1. Send the prepared [Plaud support request](../operations/plaud-sdk-submission-request.md). This is the external technical dependency; no message has been sent.
2. While waiting, assign deletion operations and complete the first-party privacy inventory/reviewer checklist. Keep vendor-dependent form answers pending.
3. Integrate a supported, compatible SDK using the sequence above. Re-run final-artifact and dependency checks.
4. Produce new installable candidates and perform the physical test matrix and disposable deletion proof.
5. Approve/publish the final notice, complete store declarations and validate/upload the matching signed candidates. Do not reuse an old build's evidence for materially changed SDKs or capabilities.

## References and local validation

- [Official pinned release](https://github.com/Plaud-AI/plaud-sdk-public/commit/8d7541e503cb96043e8629624aa6cee0241daa03)
- [Pinned AAR download](https://raw.githubusercontent.com/Plaud-AI/plaud-sdk-public/8d7541e503cb96043e8629624aa6cee0241daa03/sdk/android/plaud-sdk.aar)
- [Pinned README, public API and license](https://github.com/Plaud-AI/plaud-sdk-public/blob/8d7541e503cb96043e8629624aa6cee0241daa03/README.md)
- [Google 16 KB guidance](https://developer.android.com/guide/practices/page-sizes)
- [Plaud Android guide](https://docs.plaud.ai/plaud-embedded/android-sdk)

Scoped validation completed:

- `pnpm test:release`: **25 passed**, including six new SDK intake, hash and distribution-gate checks.
- `node scripts/check-plaud-sdk.mjs all`: passed for the unchanged Android AAR and all three pinned iOS executables/resources checked by the setup script.
- `pnpm lint`: passed, including import boundaries. `git diff --check`: passed.
- Both real AARs were run through the new intake function; the checked-in JSON records their expected codec failures and the new candidate's missing bridge types.
- Fresh public downloads of the three iOS executables matched the pinned original source; no framework was replaced.

No fresh app build, installation, traffic capture, hardware test, live deletion, policy deployment or store submission was performed. The phone-recording work already in progress was preserved. These checks do not establish hardware behavior, live deletion fulfillment or store acceptance.
