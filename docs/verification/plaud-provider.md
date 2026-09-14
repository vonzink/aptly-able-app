# Plaud provider adapter verification

Verified locally on 2026-09-11. This report concerns the server-side provider adapter, not the entire recording workflow or production readiness.

## Implemented boundary

- `apps/api/src/modules/transcription/provider.ts` exports `TranscriptionProvider` and `ProviderError`.
- `apps/api/src/modules/transcription/plaud/index.ts` exports `createPlaudProvider({clientId, clientSecret, apiKey, region, fetch?, timeoutMs?})`.
- `plaud/http.ts` owns bounded network requests and sanitized errors.
- `plaud/validation.ts` owns provider response validation and generated transcript normalization.
- `apps/api/test/plaud-transcription.test.ts` exercises real temporary files and explicit HTTP response fixtures through an injected `fetch`. Production defaults to the platform's actual `fetch`; there is no production mock mode.

The port is:

```ts
uploadAudio({ userId, path, fileType, sizeBytes }): Promise<{ downloadUrl: string }>;
submit(downloadUrl): Promise<string>; // Provider transcription task identifier
poll(taskId): Promise<
  | { status: 'pending' }
  | { status: 'failed' }
  | { status: 'complete'; transcript: GeneratedTranscript }
>;
```

`ProviderError` has `code: string` and `ambiguous: boolean`; its message is always `Transcription provider request failed.` No raw provider body, signed URL, header, transcript, filesystem error or underlying error cause is exposed in this error. The adapter does not log data.

## Protocol behavior

The configured region selects `https://platform-us.plaud.ai/developer/api` or its `platform-jp` equivalent.

1. Before network access, open the staged file once and validate that it is a regular file with the declared, positive size, capped at 250 MiB.
2. Obtain a partner access token using HTTP Basic authentication from the client ID and client secret. Obtain a user access token with that partner token and the stable application user ID; user IDs must be 6–120 characters.
3. Request multipart URLs using the actual file size and extension. Require `FileId`, `UploadId`, `ChunkSize`, and the exact ordered `Parts` array. Reject missing, duplicate, unordered, excessive or inconsistent part numbers before uploading bytes.
4. Read each chunk fully using bounded reads, upload sequential raw binary parts, and retain each exact response `ETag`. Signed PUT requests receive only the binary content type, without Plaud credentials. Update the full-file MD5 from the bytes uploaded.
5. Check size and modification metadata again before completing the upload. Submit all `PartNumber`/`ETag` pairs with `file_id`, `upload_id`, `filetype` and `file_md5`. Validate optional echoed file metadata when supplied and require `DownloadUrl`.
6. Accept HTTPS upload/download URLs only from provider responses; reject credentials and fragments in URLs, and disable redirects on every request. Keep a bounded internal allowlist of successfully issued download URLs. The worker must use the same provider instance for upload and immediate submission. A URL becomes ineligible after its first submission attempt or after 23 hours; recovery must follow the durable worker's checkpoint policy and never reconstruct an arbitrary download URL.
7. Submit transcription using `X-Client-Id` and `X-Client-Api-Key`, with automatic language identification and speaker diarization enabled. The API key is distinct from the client secret. The returned `transcription_id` is the polling identifier.
8. Poll with the API-key headers and an encoded identifier. `PENDING`, `RECEIVED`, `STARTED`, and `PROGRESS` remain pending; `FAILURE` and `REVOKED` end processing. `SUCCESS` normalizes `data.results`, with `data.segments` supported as an alternate field name. An echoed task identifier must match the requested task.

Submission is never automatically retried by this adapter. Timeout, transport failure, HTTP 5xx or 408, redirected submission, oversized response, and invalid success data are treated as possibly accepted submissions (`ambiguous: true`). Explicit authentication/rejection responses do not receive that flag. The URL is consumed after either outcome, providing an additional guard against accidental repeated POST calls.

Transcript normalization preserves real second-based start/end values. It rejects negative or reversed timestamps, decreasing segment start times, segments exceeding the reported duration, missing segment arrays and malformed text. Overlapping segments are allowed when their start times remain ordered. String `speaker_id` or `speaker` values are retained; nonnegative integer speaker identifiers become strings. Missing language becomes `null`; valid silent transcripts remain valid. No invented transcript, speaker or timing data is generated.

## Bounds and cancellation

- Audio: 250 MiB maximum; exactly one open file descriptor per upload.
- Multipart chunk: 16 MiB maximum, uploaded sequentially; multipart metadata: at most 10,000 parts, additionally constrained by file size and the response cap.
- Auth, upload metadata and submit JSON: 1 MiB maximum per response; polling JSON: 8 MiB maximum. Both declared length and actual streamed bytes are checked.
- Generated transcript public contract: 2 MiB text and 100,000 segments.
- Network deadline: 30 seconds per request by default; `timeoutMs` accepts 1–300,000 milliseconds. The deadline covers both dispatch and response-body reading. Timeout aborts the transport and cancels any active reader.
- Issued download URL eligibility: at most 1,000 unconsumed entries, each expiring after 23 hours; expired entries are pruned on upload completion.

A caller can start another upload after recovery. Interrupted multipart uploads may leave an incomplete provider-side upload; no multipart-abort endpoint is documented in the referenced File API, and this slice does not implement remote orphan cleanup. There is no automatic HTTP retry in the provider; durable scheduling/retry policy belongs to the worker.

## Verification evidence

The test suite was written first. The initial adapter stub produced 49 failed tests. After implementation, those 49 passed. Two additional status-shape/echoed-ID tests failed before their validation changes and then passed; a submission-timeout regression test also passes. Current result: **52 tests passed**.

Commands run successfully:

```sh
pnpm exec vitest run apps/api/test/plaud-transcription.test.ts
pnpm --filter @aptly/api typecheck
pnpm exec eslint apps/api/src/modules/transcription/provider.ts apps/api/src/modules/transcription/plaud apps/api/test/plaud-transcription.test.ts
```

Coverage includes exact bytes at multipart boundaries, ETag preservation, full-file MD5, size mismatch and mid-upload truncation, malformed part plans, URL validation, auth header isolation, MP3/WAV/M4A extension preservation, both regions, no blind submission retry, ambiguous submission errors/timeouts, all documented task statuses, success normalization, malformed timings/results, response byte caps, stalled response-body deadlines, redirect refusal and task identifier encoding.

Only provider-owned source/test files were formatted. No dependency installation, credential lookup, live provider operation, commit, deployment or cloud-resource change was performed for this adapter work.

## Official references and unverified compatibility

The repository skills and the following official references were read on 2026-09-11:

- [Partner token](https://docs.plaud.ai/api-reference/authentication-api/get-partner-token.md)
- [User token](https://docs.plaud.ai/api-reference/authentication-api/get-user-token.md)
- [Generate multipart URLs](https://docs.plaud.ai/api-reference/file-upload-api/generate-presigned-upload-urls.md)
- [Complete multipart upload](https://docs.plaud.ai/api-reference/file-upload-api/complete-multipart-upload.md)
- [Submit transcription](https://docs.plaud.ai/api-reference/transcription-api/submit-audio-for-transcription.md)
- [Poll transcription](https://docs.plaud.ai/api-reference/transcription-api/get-transcription-task.md)

The File API describes its extension field as a string and names MP3/Opus, while the transcription reference explicitly lists M4A/MP3/WAV. The adapter sends the actual supported application extension without conversion. **Live WAV/M4A File API acceptance remains unverified**, as does live MP3 acceptance for the configured account.

The skill recommends splitting recordings exceeding five hours. The current submit endpoint reference instead advertises a 24-hour maximum recording and six-hour maximum diarization. This adapter does not split recordings or infer duration from arbitrary audio containers. Long-recording acceptance therefore remains unverified and is not covered by fixture success.

All network verification here uses explicitly labeled protocol fixtures. Credentials, account permissions, real signed storage URLs, actual audio decoding, speaker quality, full live end-to-end acceptance, physical devices and production operation remain unverified.
