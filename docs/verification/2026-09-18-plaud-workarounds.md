# Plaud workaround assessment

September 18, 2026. Feasibility investigation only: no app behavior, SDK binary, release flag or installed build was changed. This supplements [the submission gates](2026-09-18-submission-gates.md).

Future direction: the owner wants the option to add other recorder SDKs. Follow the [recorder-provider boundaries](../RECORDER_PROVIDER_DESIGN.md): keep any Plaud codec workaround inside its integration, preserve the shared library/upload flow, and migrate provider identities deliberately when a second provider is selected.

## Engineering options

| Issue                        | Work we can own                                                                                                                                          | Remaining proof                                                                                                                                                                                                                                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android MP3 encoder          | Prototype Plaud WAV/PCM export followed by Android MediaCodec AAC encoding into M4A. Both the local library and backend schemas accept M4A/WAV.          | Remove the incompatible LAME library from the final package only if the applicable SDK terms permit that packaging and every executed path is independent of it. Test final native dependencies, 16 KB runtime, BLE/Wi-Fi, long files and playback. Merely selecting WAV while leaving LAME packaged does not fix native alignment. |
| New SDK public API migration | Replace our internal handshake/state dependencies with documented facade callbacks. We do not need Plaud to write our bridge.                            | Preserve authenticated serial matching and stale-event protection; compile and test real devices. This does not solve the SDK's native codec by itself.                                                                                                                                                                             |
| Logging                      | Investigate application-owned release logging configuration/build rules and verify SDK initialization/reinitialization cannot restore sensitive outputs. | Our JavaScript logger is insufficient. Logback file output, Timber, direct Android logs and fallback paths must all be checked in the final release. Do not claim a fix from a single OFF setting, or patch vendor code without establishing applicable terms.                                                                      |
| Cancellation                 | Keep the existing process-wide export lease until terminal completion; isolate files per operation and discard late results safely.                      | This already reduces corruption risk. A timeout does not stop SDK workers. A separate Android process could provide a stronger termination boundary, but moving BLE/Wi-Fi/session ownership there is a substantial architectural change, not a small workaround.                                                                    |
| Policy/deletion operations   | Finish our own data inventory, support ownership, monitoring, backup procedure and test evidence.                                                        | Actual provider collection/retention and erasure still need contractual and operational evidence. Reducing uploads cannot erase authentication/binding data already processed by Plaud.                                                                                                                                             |

### Why test the AAC route first

Plaud documents `PCM`, `WAV`, `OPUS` and `MP3` export. Android documents platform AAC encoding and MPEG-4/M4A containers. Our source accepts WAV/M4A in `recording-model.ts` and `packages/contracts/src/transcription.ts`. The Plaud adapter, however, currently explicitly requests MP3, validates `.mp3` output and reports `audio/mpeg`; Wi-Fi also hard-codes MP3. All these paths would need coordinated changes, not just a filename rename.

Inspection of the installed 1.0.13 artifact shows `AudioExporter` constructor/static initialization without a LAME load; `LameUtils` loads `lame` when that class initializes and is used by the MP3 conversion path. This supports investigating a non-MP3 path; it does not prove all SDK initialization/export/error paths are safe with LAME absent. SDK Opus decoding and the remaining native libraries also need 16 KB runtime checks, including the existing RELRO findings.

A bounded prototype should first prove WAV export on both transports, then stream PCM into the platform encoder, write a valid M4A, verify duration/playback, atomically save it and delete temporary audio only after success. Account changes, cancellation, crashes and low storage must preserve file ownership. Do not keep large intermediate WAVs indefinitely or read a long recording into JavaScript memory. No server transcription behavior should be represented as working merely because its schema accepts M4A; our Plaud-import server integration is still a stub.

## Published terms narrow—but do not eliminate—the vendor questions

We located Plaud's published [Commercial Terms](https://dev.plaud.ai/commercial-terms-of-service/) (page date May 1, 2026). They include SDK use rights in section 2.1, modification limits in 2.3(a), and a broad competing-product restriction in 2.3(c) that mentions AI recording/transcription applications. Section 2.5 allows applicable additional terms to control conflicts. Aptly Able's actual account agreement/order form has not been reviewed; these public clauses do not establish either that our use is prohibited or that every planned modification/distribution is permitted. The owner should have the applicable agreement reviewed for FieldSense's intended use.

The public [DPA](https://global.plaud.ai/pages/data-processing-addendum) describes processing categories and deletion on contract termination, but does not by itself establish an operational seven-day individual-account erasure process for our integration. Existing account-specific agreements or written vendor documentation may supply this evidence without a new support ticket. A code change cannot supply those facts.

## Next decision

Investigate the documented WAV/PCM-to-M4A path before replacing or patching a proprietary native library. Keep the current working recorder integration in place until the alternative is proven. In parallel, check the applicable Plaud account terms/DPA; narrow the support request to the actual unanswered licensing, processing and deletion questions plus any technical failures reproduced by the prototype. All submission flags remain unconfirmed.

References checked:

- [Plaud export formats](https://docs.plaud.ai/plaud-embedded/android-sdk)
- [Android platform audio formats](https://developer.android.com/media/platform/supported-formats)
- [Android native page-size requirements and runtime testing](https://developer.android.com/guide/practices/page-sizes)

Local inspection notes are in ignored `.local/plaud-workaround-review/`. No hardware or final-package test was performed in this investigation.
