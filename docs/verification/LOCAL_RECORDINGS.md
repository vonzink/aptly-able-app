# Local recordings functional verification

Date: September 10, 2026 (America/Denver).

## Result and scope

The local recordings milestone is implemented and passes browser acceptance, source review and workspace checks. This makes imported audio usable in the app: persist, search, listen, seek, rename, attach an exported transcript and remove the app's copy. Production security work is deferred per the user's instruction. Existing enrollment safeguards are preserved.

This is local development work. Direct Plaud pairing/transfer, automatic transcription, cloud upload/backup, signed native builds and physical phone acceptance are not completed by this milestone.

## Automated and build verification

Final source checks after the web slider correction:

| Command                                                 | Result                                                                                                                     |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                            | PASS: all workspace TypeScript checks, ESLint, import boundaries, 113 tests in 17 files, contracts/client/API/admin builds |
| `pnpm format:check`                                     | PASS                                                                                                                       |
| `pnpm --filter @aptly/mobile exec expo install --check` | PASS: dependencies up to date                                                                                              |
| `pnpm --filter @aptly/mobile export`                    | PASS: web, iOS and Android bundles/assets                                                                                  |

Expo exports validate platform module resolution and bundling. They do not compile/sign standalone applications or prove native filesystem, picker or playback behavior on phones. Expo's generated `expo-env.d.ts` is excluded from Git and formatting instead of modifying a generated file each time Metro starts.

The 37 recording-specific tests cover controller actions and failure recovery, actual temporary filesystem persistence, metadata merge across stale controllers, parser formats and limits, plus web unavailability/invalid byte boundaries. Actual IndexedDB execution is covered by the browser checks below, not the Node web-boundary tests. See [storage verification](local-recordings-storage.md) and [source review](local-recordings-review.md).

## Actual browser acceptance

Executed against Metro at `http://localhost:8088`, using the isolated Playwright session `aptly-recordings` and real file chooser uploads. Audio was a generated 45-second, 16 kHz mono WAV (1,440,044 bytes) with synthetic tones; transcript text was artificial test data. No real customer recording or cloud service was used.

| Behavior               | Observed result                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Import WAV             | Detail opens; copied audio is stored in IndexedDB; duration resolves to 45 seconds                                            |
| Play/pause             | Playback time advances and pause stops it                                                                                     |
| Skip and seek          | Back 15 seconds, forward 30 seconds and progress-bar click change the actual position                                         |
| End and replay         | Seeking to 43 seconds reaches 45/end; Play restarts at the beginning and advances                                             |
| Speed                  | Playback speed control changes from 1 to 1.5                                                                                  |
| Rename and reload      | Updated name, duration and saved audio survive page reload                                                                    |
| Attach SRT             | Two supplied cues and speaker names display; tapping 0:10 seeks and starts audio                                              |
| Transcript persistence | SRT filename, text and timing survive reload                                                                                  |
| Replace with TXT       | Plain text replaces timed transcript without invented timestamps                                                              |
| Stale browser tab edit | Tab A replaces transcript; previously loaded tab B renames; both new name and replacement transcript survive B reload         |
| Search                 | Transcript phrase returns the recording; unmatched query shows the empty result; clearing restores library                    |
| Remove/cancel          | Keep recording closes confirmation and preserves detail; Remove local copy returns to empty library, still empty after reload |
| Source preservation    | Original WAV fixture remains on disk at its original byte size after removal                                                  |
| Narrow layout          | Library checked at 393 × 852 and 320 × 740; no page horizontal overflow at 320; screenshots visually reviewed                 |

The initial progress-bar click failed on web because React Native Web supplies a MouseEvent to `onPress`, without native `locationX`. A separate HTML range component now handles web coordinates and keyboard input; native retains its touch/accessibility control. The actual browser failure was reproduced before this correction, and seek/replay passed afterward. No Expo Audio dependency patch was needed.

Local screenshots/fixtures are ignored under `output/playwright/`:

- `local-recording-detail-top.png`
- `local-recordings-library.png`
- `local-recordings-library-320.png`
- `local-recordings-empty-after-remove.png`
- `local-recordings-smoke.wav`, `local-recordings-smoke.srt`, `local-recordings-replacement.txt`

Only the synthetic test recording in the isolated browser profile was removed. Browser storage belongs to its origin/profile; this test does not populate the user's in-app browser library.

## Native runtime limit

Attempted iPhone 17 Pro simulator `199B5FFE-5E58-4E28-B62A-2A81BAB55F58` with the installed iOS 26.5 runtime. Expo reported installing/opening Expo Go. Screenshot capture failed with “Timeout waiting for screen surfaces.” A later explicit simulator boot reported completion, but opening the Expo URL returned state “Shutdown.” No native UI interaction or successful screenshot was obtained. Cause remains unverified; further retries were stopped.

Next native acceptance should run on a stable simulator or physical iOS/Android phone: choose a real exported audio file, reload/relaunch, listen/seek, attach a transcript and remove only the app copy. The native storage protocol has filesystem tests, but those use Node's filesystem rather than Expo's native adapter.

## Handoff

Mobile preview remains at `http://localhost:8088/recordings`; admin remains at `http://localhost:8089`. Local recording import/playback works independently of the enrollment API. See [usage and boundaries](../LOCAL_RECORDINGS.md).

All source changes are under `aptly-able-app`; the parent Git repository still reports the app as untracked. No staging, commits, branch changes, deployment or sibling project edits were performed.
