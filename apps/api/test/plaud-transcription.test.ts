import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlaudProvider } from '../src/modules/transcription/plaud/index.js';
import { ProviderError } from '../src/modules/transcription/provider.js';

const base = 'https://platform-us.plaud.ai/developer/api';
const downloadUrl = 'https://storage.example.test/recording?signature=private';
const credentials = {
  clientId: 'client-test',
  clientSecret: 'secret-test',
  apiKey: 'key-test',
  region: 'us' as const,
};
const json = (data: unknown, status = 200) => Response.json(data, { status });
const plan = () => ({
  FileId: 'file-test',
  UploadId: 'upload-test',
  ChunkSize: 3,
  Parts: [
    { PartNumber: 1, PresignedUrl: 'https://storage.example.test/part-1?signature=one' },
    { PartNumber: 2, PresignedUrl: 'https://storage.example.test/part-2?signature=two' },
    { PartNumber: 3, PresignedUrl: 'https://storage.example.test/part-3?signature=three' },
  ],
});
function transport(responses: Array<Response | Error>) {
  return vi.fn<typeof fetch>(async () => {
    const next = responses.shift();
    if (!next) throw new Error('Unexpected request');
    if (next instanceof Error) throw next;
    return next;
  });
}
function uploadResponses(uploadPlan: unknown = plan()) {
  return [
    json({ access_token: 'partner-token' }),
    json({ access_token: 'user-token' }),
    json(uploadPlan),
    new Response(null, { headers: { ETag: '"part-one"' } }),
    new Response(null, { headers: { ETag: '"part-two"' } }),
    new Response(null, { headers: { ETag: '"part-three"' } }),
    json({ FileId: 'file-test', DownloadUrl: downloadUrl }),
  ];
}
function payload(call: unknown[]) {
  return JSON.parse((call[1] as RequestInit).body as string);
}
function headers(call: unknown[]) {
  return new Headers((call[1] as RequestInit).headers);
}

let directory: string;
let path: string;
const audio = Buffer.from([0, 1, 2, 3, 128, 255, 9]);
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'aptly-plaud-'));
  path = join(directory, 'audio.mp3');
  await writeFile(path, audio);
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
const input = () => ({
  userId: 'user-stable-123',
  path,
  fileType: 'mp3' as const,
  sizeBytes: audio.byteLength,
});

async function readyToSubmit(response: Response | Error) {
  const http = transport([...uploadResponses(), response]);
  const provider = createPlaudProvider({ ...credentials, fetch: http });
  await provider.uploadAudio(input());
  return { provider, http };
}

describe('Plaud multipart protocol', () => {
  it('uploads exact bounded raw parts, preserves ETags and hashes the complete original audio', async () => {
    const http = transport(uploadResponses());
    const provider = createPlaudProvider({ ...credentials, fetch: http });
    await expect(provider.uploadAudio(input())).resolves.toEqual({ downloadUrl });
    expect(http).toHaveBeenCalledTimes(7);
    const calls = http.mock.calls;
    expect(calls[0]![0]).toBe(`${base}/oauth/partner/access-token`);
    expect(headers(calls[0]!).get('authorization')).toBe(
      `Basic ${Buffer.from('client-test:secret-test').toString('base64')}`,
    );
    expect(headers(calls[0]!).get('content-type')).toBe('application/x-www-form-urlencoded');
    expect(payload(calls[1]!)).toEqual({ user_id: 'user-stable-123', expires_in: 86400 });
    expect(headers(calls[1]!).get('authorization')).toBe('Bearer partner-token');
    expect(payload(calls[2]!)).toEqual({ filesize: 7, filetype: 'mp3' });
    expect(headers(calls[2]!).get('authorization')).toBe('Bearer user-token');
    for (let i = 0; i < 3; i++) {
      const call = calls[i + 3]!;
      expect(call[0]).toBe(plan().Parts[i]!.PresignedUrl);
      expect(call[1]!.method).toBe('PUT');
      expect(Buffer.from(call[1]!.body as Uint8Array)).toEqual(
        audio.subarray(i * 3, Math.min((i + 1) * 3, 7)),
      );
      expect([...headers(call).keys()]).toEqual(['content-type']);
      expect(call[1]!.redirect).toBe('error');
    }
    expect(payload(calls[6]!)).toEqual({
      file_id: 'file-test',
      upload_id: 'upload-test',
      filetype: 'mp3',
      file_md5: createHash('md5').update(audio).digest('hex'),
      part_list: [
        { PartNumber: 1, ETag: '"part-one"' },
        { PartNumber: 2, ETag: '"part-two"' },
        { PartNumber: 3, ETag: '"part-three"' },
      ],
    });
    expect(headers(calls[6]!).get('authorization')).toBe('Bearer user-token');
    expect(calls.every((call) => call[1]!.redirect === 'error')).toBe(true);
  });

  it.each(['wav', 'm4a'] as const)(
    'preserves the %s extension without disguising audio as MP3',
    async (fileType) => {
      const http = transport(uploadResponses());
      await createPlaudProvider({ ...credentials, fetch: http }).uploadAudio({
        ...input(),
        fileType,
      });
      expect(payload(http.mock.calls[2]!).filetype).toBe(fileType);
      expect(payload(http.mock.calls[6]!).filetype).toBe(fileType);
    },
  );

  it('uses the Japan endpoint when configured', async () => {
    const http = transport([json({ status: 'PENDING' })]);
    await createPlaudProvider({ ...credentials, region: 'jp', fetch: http }).poll('task-123');
    expect(http.mock.calls[0]![0]).toBe(
      'https://platform-jp.plaud.ai/developer/api/open/partner/ai/transcriptions/task-123',
    );
  });

  it.each([6, 8, 0, 250 * 1024 * 1024 + 1])(
    'rejects declared size %i before network requests',
    async (sizeBytes) => {
      const http = transport([]);
      await expect(
        createPlaudProvider({ ...credentials, fetch: http }).uploadAudio({ ...input(), sizeBytes }),
      ).rejects.toBeInstanceOf(ProviderError);
      expect(http).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['wrong case', { file_id: 'wrong', ...{ ...plan(), FileId: undefined } }],
    ['no parts', { ...plan(), Parts: [] }],
    ['out of order', { ...plan(), Parts: [...plan().Parts].reverse() }],
    ['duplicate part', { ...plan(), Parts: [plan().Parts[0], plan().Parts[0], plan().Parts[2]] }],
    ['wrong count', { ...plan(), Parts: plan().Parts.slice(0, 2) }],
    ['invalid chunk size', { ...plan(), ChunkSize: 0 }],
    ['unbounded chunk size', { ...plan(), ChunkSize: 251 * 1024 * 1024 }],
    [
      'insecure URL',
      {
        ...plan(),
        Parts: plan().Parts.map((p) => ({
          ...p,
          PresignedUrl: 'http://storage.example.test/audio',
        })),
      },
    ],
    [
      'URL credentials',
      {
        ...plan(),
        Parts: plan().Parts.map((p) => ({
          ...p,
          PresignedUrl: 'https://private:secret@storage.example.test/audio',
        })),
      },
    ],
    [
      'URL fragment',
      {
        ...plan(),
        Parts: plan().Parts.map((p) => ({
          ...p,
          PresignedUrl: 'https://storage.example.test/audio#secret',
        })),
      },
    ],
  ])('rejects %s before uploading any bytes', async (_label, uploadPlan) => {
    const http = transport(uploadResponses(uploadPlan));
    await expect(
      createPlaudProvider({ ...credentials, fetch: http }).uploadAudio(input()),
    ).rejects.toMatchObject({ code: 'provider_invalid_response', ambiguous: false });
    expect(http).toHaveBeenCalledTimes(3);
  });

  it('never completes an upload when any part has no ETag', async () => {
    const responses = uploadResponses();
    responses[4] = new Response(null);
    const http = transport(responses);
    await expect(
      createPlaudProvider({ ...credentials, fetch: http }).uploadAudio(input()),
    ).rejects.toMatchObject({ code: 'provider_invalid_response' });
    expect(http).toHaveBeenCalledTimes(5);
  });

  it('detects files truncated after the upload plan before completing', async () => {
    const responses = uploadResponses();
    const http = vi.fn<typeof fetch>(async () => {
      if (responses.length === 4) await writeFile(path, Buffer.from([1]));
      return responses.shift()!;
    });
    await expect(
      createPlaudProvider({ ...credentials, fetch: http }).uploadAudio(input()),
    ).rejects.toMatchObject({ code: 'provider_audio_changed' });
    expect(http.mock.calls.some((call) => String(call[0]).endsWith('complete-upload'))).toBe(false);
  });

  it('rejects untrusted completion download URLs', async () => {
    const responses = uploadResponses();
    responses[6] = json({ DownloadUrl: 'https://secret:credential@storage.example.test/audio' });
    await expect(
      createPlaudProvider({ ...credentials, fetch: transport(responses) }).uploadAudio(input()),
    ).rejects.toMatchObject({ code: 'provider_invalid_response' });
  });
});

describe('Plaud submission safety', () => {
  it('submits with API-key headers and returns the provider task identifier', async () => {
    const { provider, http } = await readyToSubmit(
      json({ transcription_id: 'task_123', status: 'PENDING', data: {} }),
    );
    await expect(provider.submit(downloadUrl)).resolves.toBe('task_123');
    const call = http.mock.calls[7]!;
    expect(call[0]).toBe(`${base}/open/partner/ai/transcriptions/`);
    expect(headers(call).get('X-Client-Id')).toBe('client-test');
    expect(headers(call).get('X-Client-Api-Key')).toBe('key-test');
    expect(headers(call).has('authorization')).toBe(false);
    expect(payload(call)).toEqual({
      file_url: downloadUrl,
      params: {
        transcribe: { language: 'auto' },
        diarization: { enabled: true, return_embedding: false },
      },
    });
  });

  it('rejects arbitrary URLs without dispatching a transcription request', async () => {
    const http = transport([]);
    await expect(
      createPlaudProvider({ ...credentials, fetch: http }).submit(
        'https://untrusted.example.test/audio',
      ),
    ).rejects.toMatchObject({ code: 'provider_untrusted_url', ambiguous: false });
    expect(http).not.toHaveBeenCalled();
  });

  it.each([
    ['network', new Error('private upstream credentials')],
    ['server error', json({ detail: 'secret-provider-error' }, 503)],
    ['invalid success JSON', new Response('secret-not-json')],
    ['missing task ID', json({ status: 'PENDING' })],
    [
      'response too large',
      new Response('x', { headers: { 'content-length': String(20 * 1024 * 1024) } }),
    ],
  ])('does not retry a possibly accepted %s submission', async (_label, response) => {
    const { provider, http } = await readyToSubmit(response);
    await expect(provider.submit(downloadUrl)).rejects.toMatchObject({ ambiguous: true });
    expect(http).toHaveBeenCalledTimes(8);
    await expect(provider.submit(downloadUrl)).rejects.toMatchObject({
      code: 'provider_untrusted_url',
      ambiguous: false,
    });
    expect(http).toHaveBeenCalledTimes(8);
  });

  it('marks submission dispatch timeouts as ambiguous and aborts the transport', async () => {
    const responses = uploadResponses();
    let aborted = false;
    const http = vi.fn<typeof fetch>(async (_url, init) => {
      if (responses.length) return responses.shift()!;
      return new Promise((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('private timeout details'));
        });
      });
    });
    const provider = createPlaudProvider({ ...credentials, timeoutMs: 15, fetch: http });
    await provider.uploadAudio(input());
    await expect(provider.submit(downloadUrl)).rejects.toMatchObject({
      code: 'provider_timeout',
      ambiguous: true,
    });
    expect(aborted).toBe(true);
    expect(http).toHaveBeenCalledTimes(8);
  });

  it('classifies an explicit auth rejection without exposing response contents', async () => {
    const { provider, http } = await readyToSubmit(
      json({ detail: 'private-secret-credential' }, 401),
    );
    await expect(provider.submit(downloadUrl)).rejects.toMatchObject({
      code: 'provider_auth_failed',
      ambiguous: false,
      message: 'Transcription provider request failed.',
    });
    expect(http).toHaveBeenCalledTimes(8);
  });
});

describe('Plaud polling and normalization', () => {
  it.each(['PENDING', 'RECEIVED', 'STARTED', 'PROGRESS'])('keeps %s in flight', async (status) => {
    const http = transport([json({ status })]);
    await expect(
      createPlaudProvider({ ...credentials, fetch: http }).poll('task-123'),
    ).resolves.toEqual({ status: 'pending' });
    expect(headers(http.mock.calls[0]!).get('X-Client-Api-Key')).toBe('key-test');
  });

  it.each(['FAILURE', 'REVOKED'])('ends %s without exposing upstream errors', async (status) => {
    await expect(
      createPlaudProvider({
        ...credentials,
        fetch: transport([json({ status, error: 'private error' })]),
      }).poll('task-123'),
    ).resolves.toEqual({ status: 'failed' });
  });

  it.each(['results', 'segments'])(
    'normalizes %s, speakers and real seconds without invented timings',
    async (field) => {
      const response = json({
        status: 'SUCCESS',
        data: {
          text: 'First. Second.',
          language: 'en',
          duration: 8.25,
          [field]: [
            { start: 1.25, end: 2.5, text: 'First.', speaker_id: 'Speaker 1', language: 'en-US' },
            { start: 6, end: 8.25, text: 'Second.', speaker: 0 },
          ],
        },
      });
      await expect(
        createPlaudProvider({ ...credentials, fetch: transport([response]) }).poll('task-123'),
      ).resolves.toEqual({
        status: 'complete',
        transcript: {
          text: 'First. Second.',
          language: 'en',
          durationSeconds: 8.25,
          segments: [
            {
              startSeconds: 1.25,
              endSeconds: 2.5,
              text: 'First.',
              speakerId: 'Speaker 1',
              language: 'en-US',
            },
            { startSeconds: 6, endSeconds: 8.25, text: 'Second.', speakerId: '0' },
          ],
        },
      });
    },
  );

  it('preserves a valid silent transcript and missing language as null', async () => {
    await expect(
      createPlaudProvider({
        ...credentials,
        fetch: transport([
          json({ status: 'SUCCESS', data: { text: '', duration: 3, results: [] } }),
        ]),
      }).poll('task-123'),
    ).resolves.toEqual({
      status: 'complete',
      transcript: { text: '', durationSeconds: 3, language: null, segments: [] },
    });
  });

  it.each([
    { status: 'UNKNOWN' },
    { status: ['PENDING'] },
    { status: 'PENDING', transcription_id: 'a-different-task' },
    { status: 'SUCCESS', data: { text: 'hello', duration: 3 } },
    {
      status: 'SUCCESS',
      data: { text: 'hello', duration: 3, results: [{ text: 'hello', start: 2, end: 1 }] },
    },
    {
      status: 'SUCCESS',
      data: { text: 'hello', duration: 3, results: [{ text: 'hello', start: -1, end: 1 }] },
    },
    {
      status: 'SUCCESS',
      data: { text: 'hello', duration: 3, results: [{ text: 'hello', start: '0', end: 1 }] },
    },
    {
      status: 'SUCCESS',
      data: { text: 'hello', duration: 3, results: [{ text: 'hello', start: 0, end: 4 }] },
    },
    {
      status: 'SUCCESS',
      data: {
        text: 'hello',
        duration: 3,
        results: [
          { text: 'later', start: 2, end: 3 },
          { text: 'earlier', start: 0, end: 1 },
        ],
      },
    },
  ])('rejects malformed status/results %#', async (response) => {
    await expect(
      createPlaudProvider({ ...credentials, fetch: transport([json(response)]) }).poll('task-123'),
    ).rejects.toMatchObject({ code: 'provider_invalid_response', ambiguous: false });
  });

  it('rejects oversized streamed JSON without returning raw content', async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(9 * 1024 * 1024));
          controller.close();
        },
      }),
    );
    await expect(
      createPlaudProvider({ ...credentials, fetch: transport([response]) }).poll('task-123'),
    ).rejects.toMatchObject({ code: 'provider_response_too_large', ambiguous: false });
  });

  it('bounds response-body stalls as well as fetch dispatch', async () => {
    const response = new Response(new ReadableStream({ start() {} }));
    await expect(
      createPlaudProvider({ ...credentials, timeoutMs: 15, fetch: transport([response]) }).poll(
        'task-123',
      ),
    ).rejects.toMatchObject({ code: 'provider_timeout', ambiguous: false });
  });

  it('does not follow redirects', async () => {
    const http = transport([
      new Response(null, {
        status: 302,
        headers: { location: 'https://untrusted.example.test/secret' },
      }),
    ]);
    await expect(
      createPlaudProvider({ ...credentials, fetch: http }).poll('task-123'),
    ).rejects.toMatchObject({ code: 'provider_redirect', ambiguous: false });
    expect(http).toHaveBeenCalledTimes(1);
    expect(http.mock.calls[0]![1]!.redirect).toBe('error');
  });

  it('encodes task identifiers into one path component', async () => {
    const http = transport([json({ status: 'PENDING' })]);
    await createPlaudProvider({ ...credentials, fetch: http }).poll('task/id?token=secret');
    expect(http.mock.calls[0]![0]).toBe(
      `${base}/open/partner/ai/transcriptions/task%2Fid%3Ftoken%3Dsecret`,
    );
  });
});
