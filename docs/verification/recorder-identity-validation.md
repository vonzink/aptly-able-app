# Stabilization step 2: recorder model and serial validation

Implemented locally September 15, 2026, on `main` based on `f968a4a`, alongside
the previously uncommitted Settings diagnostics step. No commit, push,
deployment, native app installation or live account/device change in this pass.

## Behavior

- The shared contract in `packages/contracts/src/recorder-identity.ts` validates
  the supported model together with the complete serial. Note Pro requires the
  `881` prefix; NotePin S requires `882`. Other prefixes and mismatched models
  are rejected for new assignments.
- `createAssignmentRequestSchema` retains strict fields and trims surrounding
  whitespace. It retains the previous 6–64 character alphanumeric/hyphen format
  ending in four digits. It does not uppercase, strip letters, or match suffixes.
- Both `/v1/admin/recorder-assignments` and
  `/v1/workspace/recorder-assignments`, and the enrollment service itself, use
  the same schema. Invalid combinations fail before persistence.
- The dashboard identifies the invalid field, associates its message and help
  with the control, and focuses the first invalid control after submission.
  Errors update as fields change without moving focus while typing. The serial
  input disables autocorrection/capitalization and explains where to find the SN.
- The phone checks the identity before SDK initialization, scanning or cloud
  binding. An incompatible saved assignment gets a dashboard/administrator
  recovery message instead of a misleading recorder-not-found timeout.
- Discovery still requires a nonempty native UUID and an exact, case-sensitive
  match of the full assigned serial. Token handling, ownership, connection
  handshake evidence, unpair and recordings are unchanged.

## Evidence for the compatibility rule

- [Plaud SDK device security](https://docs.plaud.ai/plaud-embedded/advanced-android-sdk#device-security)
  explicitly maps `881` to `notepro` and `882` to `notepins` when signing the SN.
  The installed Android bridge already uses this mapping; no native mapping was
  changed in this step.
- [Supported Embedded devices](https://docs.plaud.ai/plaud-embedded/devices)
  lists Note Pro and NotePin S; the original Note and NotePin are unsupported.
- [Plaud serial-number locations](https://support.plaud.ai/hc/en-us/articles/61623977783449-How-do-I-find-the-serial-number-SN-of-my-Plaud-device)
  confirms box labels for both models and the back of the NotePin S.
- [Earlier recording sync verification](RECORDING_SYNC.md) records the real
  alphanumeric-serial regression. A support article describes a 16-digit SN,
  but that wording is not used to reintroduce a digits-only or fixed-length
  constraint. The prefix rule is verified independently of the retained format.

## Verification

| Check                                      | Result                                                                                                                                                                                                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New regression tests before implementation | Nine expected failures: four contract mismatches, two HTTP boundaries, three phone preflight cases.                                                                                                                                                         |
| `pnpm exec vitest run`                     | 403 tests passed across 39 files, including existing pairing/unpair and account-isolation checks.                                                                                                                                                           |
| Targeted local Postgres suites             | 29 tests passed across enrollment, workspace, Plaud device, and database capacity suites. Random temporary schemas were used and cleaned up.                                                                                                                |
| Compiled API runtime smoke                 | Passed migrations/seed, authentication/roles, assignment, QR, resolve, concurrent claim/recovery, revocation and release in an isolated local schema.                                                                                                       |
| `pnpm typecheck` and `pnpm lint`           | Passed throughout the workspace, including import-boundary checks.                                                                                                                                                                                          |
| `pnpm build`                               | Contracts, API client, backend and dashboard production builds passed.                                                                                                                                                                                      |
| Expo production export for all platforms   | iOS and Android Hermes bundles and web bundle exported successfully into `.local/recorder-identity-export`; this is not an IPA/APK build or hardware test.                                                                                                  |
| Local browser form check                   | Blank submission focused Person; model mismatch focused Serial and did not save; changing to the matching model cleared errors and saved the complete alphanumeric serial unchanged. Error IDs and `aria-describedby` associations were checked in the DOM. |

Integration and smoke fixtures previously prefixed `NP-`, `CAP`, or `SMOKE-`
were changed to use compatible synthetic prefixes. The wrong-model service
test now expects validation failure (400) before the former conflict check
(409); the separate real assignment-conflict assertions are retained.

The browser check used a temporary isolated form harness in
`.local/recorder-identity-ui` with synthetic people and a local save callback.
It did not create real assignments or contact Plaud. API and persistence paths
were covered separately by the HTTP, integration and compiled smoke checks.

## Remaining scope and release

- No saved recorder, assignment, enrollment token or binding is migrated,
  silently corrected, or released. A deliberate correction workflow for older
  incompatible assignments still needs to be designed around immutable identity
  and Plaud binding; changing the dropdown only corrects a new unsaved form.
- Publish the API and dashboard together for server enforcement and matching
  field guidance. Rebuild/distribute the phone apps for the early mismatch
  message. The live website and currently installed builds are unchanged.
- Real iOS/Android pairing remains a physical-device acceptance task. Step 1's
  native build/install limitations are recorded in [Settings diagnostics](settings-diagnostics.md).
- Next stabilization step: session persistence/restoration, with expiry and
  explicit sign-out cleanup while preserving account isolation.
