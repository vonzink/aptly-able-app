import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTranscriptionClient } from '../src/transcription.js';

const id = '11111111-1111-4111-8111-111111111111';
const input = { id, title: 'Meeting', fileName: 'meeting.m4a', sizeBytes: 4 };
const recording = {
  ...input,
  status: 'awaiting_upload',
  attempt: 0,
  createdAt: '2026-09-11T12:00:00.000Z',
  updatedAt: '2026-09-11T12:00:00.000Z',
  transcript: null,
  errorCode: null,
};
const base = { baseUrl: 'http://localhost:4100', getCredential: () => 'local-code' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

afterEach(() => vi.useRealTimers());
describe('transcription API boundary', () => {
  it('checks provider availability without a credential or authorization header', async () => {
    const seen: RequestInit[] = [];
    const client = createTranscriptionClient({
      ...base,
      getCredential: () => undefined,
      fetch: async (url, init) => {
        expect(url).toBe('http://localhost:4100/v1/transcription/capabilities');
        seen.push(init!);
        return json({ available: false, provider: 'plaud', reason: 'not_configured' });
      },
    });
    expect((await client.capabilities()).available).toBe(false);
    expect(new Headers(seen[0]?.headers).has('authorization')).toBe(false);
    await expect(client.get(id)).rejects.toMatchObject({ status: 401 });
    expect(seen).toHaveLength(1);
  });

  it('sends JSON metadata and raw saved bytes to their distinct authenticated routes', async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    const client = createTranscriptionClient({
      ...base,
      fetch: async (url, init) => {
        requests.push({ url: String(url), init: init! });
        return json(recording);
      },
    });
    await client.register(input);
    await client.get(id);
    const bytes = new Uint8Array([0, 255, 13, 10]);
    await client.upload(id, bytes);
    await client.retry(id, true);
    expect(requests.map((r) => [r.url, r.init.method])).toEqual([
      ['http://localhost:4100/v1/recordings', 'POST'],
      [`http://localhost:4100/v1/recordings/${id}`, 'GET'],
      [`http://localhost:4100/v1/recordings/${id}/audio`, 'POST'],
      [`http://localhost:4100/v1/recordings/${id}/retry`, 'POST'],
    ]);
    expect(JSON.parse(String(requests[0]!.init.body))).toEqual(input);
    expect(requests[2]!.init.body).toBe(bytes);
    expect(new Headers(requests[2]!.init.headers).get('content-type')).toBe(
      'application/octet-stream',
    );
    expect(JSON.parse(String(requests[3]!.init.body))).toEqual({ acknowledgeDuplicateRisk: true });
    for (const { init } of requests) {
      expect(new Headers(init.headers).get('authorization')).toBe('Bearer local-code');
      expect(init.redirect).toBe('error');
      expect(init.credentials).toBe('omit');
    }
  });

  it('uses the platform upload transport without changing the raw body', async () => {
    const client = createTranscriptionClient({
      ...base,
      fetch: async () => {
        throw Error('wrong transport');
      },
    });
    const bytes = new Blob(['audio']);
    const record = await client.upload(id, bytes, {
      fetch: async (_url, init) => {
        expect(init?.body).toBe(bytes);
        return json(recording);
      },
    });
    expect(record.id).toBe(id);
  });

  it.each([
    'RECORDING_NOT_FOUND',
    'RECORDING_CONFLICT',
    'TRANSCRIPTION_NOT_CONFIGURED',
    'RETRY_CONFIRMATION_REQUIRED',
    'INVALID_AUDIO',
    'TRANSCRIPTION_UNAVAILABLE',
  ])('keeps %s actionable without exposing upstream text', async (code) => {
    const client = createTranscriptionClient({
      ...base,
      fetch: async () => json({ error: { code, message: 'private-provider-secret' } }, 409),
    });
    await expect(client.get(id)).rejects.toMatchObject({ code });
    await expect(client.get(id)).rejects.not.toThrow('private-provider-secret');
  });

  it('rejects invalid metadata before contacting the server and validates successful JSON', async () => {
    let calls = 0;
    const client = createTranscriptionClient({
      ...base,
      fetch: async () => {
        calls++;
        return json({ ...recording, status: 'complete' });
      },
    });
    await expect(client.register({ ...input, sizeBytes: 0 })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(calls).toBe(0);
    await expect(client.get(id)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('allows longer uploads but cancels them on caller abort or the upload deadline', async () => {
    vi.useFakeTimers();
    const client = createTranscriptionClient({
      ...base,
      fetch: async (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(Error('aborted')), { once: true });
        }),
    });
    const abort = new AbortController();
    const uploading = client.upload(id, new Blob(['audio']), { signal: abort.signal });
    const cancelled = expect(uploading).rejects.toMatchObject({ code: 'CANCELLED' });
    await vi.advanceTimersByTimeAsync(11000);
    abort.abort();
    await cancelled;
    const timedOut = expect(client.upload(id, new Blob(['audio']))).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(120000);
    await timedOut;
  });
});
