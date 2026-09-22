import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from '../src/index.js';
const userId = '8cd7c040-9c09-4629-b1a1-9e8dfecf4e10';

describe('shared API boundary', () => {
  it('sets up an account-owned recorder without carrying an invitation or user ID', async () => {
    const recorder = {
      assignmentId: userId,
      recorder: { id: userId, model: 'notepins', serialSuffix: '1234' },
      operation: null,
      setupBlocked: false,
    };
    const operation = {
      id: userId,
      assignmentId: userId,
      status: 'pending',
      createdAt: '2026-09-22T12:00:00Z',
    };
    const responses = [{ recorders: [recorder], canAdd: true }, recorder, operation];
    const calls: { url: string; body: unknown; authorization: string | null }[] = [];
    const client = createApiClient({
      baseUrl: 'http://localhost:4100',
      getCredential: () => 'test-session',
      fetch: async (url, init) => {
        calls.push({
          url: String(url),
          body: init?.body ? JSON.parse(String(init.body)) : null,
          authorization: new Headers(init?.headers).get('authorization'),
        });
        return new Response(JSON.stringify(responses.shift()));
      },
    });
    expect((await client.myRecorders()).recorders).toEqual([recorder]);
    await client.addMyRecorder({ model: 'notepins', serial: '882B900001234' });
    expect(await client.beginRecorderSetup(userId)).toEqual(operation);
    expect(calls.map((c) => c.url)).toEqual([
      'http://localhost:4100/v1/me/recorders',
      'http://localhost:4100/v1/me/recorders',
      `http://localhost:4100/v1/me/recorders/${userId}/setup`,
    ]);
    expect(calls.map((c) => c.body)).toEqual([
      null,
      { model: 'notepins', serial: '882B900001234' },
      {},
    ]);
    expect(calls.every((c) => c.authorization === 'Bearer test-session')).toBe(true);
  });
  it('keeps credentials and invitation secrets out of URLs and validates responses', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: userId,
            assignmentId: userId,
            status: 'pending',
            createdAt: '2026-09-10T12:00:00Z',
          }),
        ),
    );
    const client = createApiClient({
      baseUrl: 'http://localhost:4100',
      getCredential: () => 'local-code',
      fetch: fetcher,
    });
    await client.claimEnrollment('t'.repeat(43), userId);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('http://localhost:4100/v1/enrollments/claim');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer local-code');
    expect(JSON.parse(String(init?.body))).toEqual({
      token: 't'.repeat(43),
      idempotencyKey: userId,
    });
    expect(init?.credentials).toBe('omit');
    expect(init?.redirect).toBe('error');
  });
  it('maps failures without returning vendor content or credentials', async () => {
    const client = createApiClient({
      baseUrl: 'http://localhost:4100',
      getCredential: () => 'local-code',
      fetch: async () => new Response('private-password', { status: 500 }),
    });
    await expect(client.session()).rejects.toMatchObject({ status: 500, code: 'REQUEST_FAILED' });
    await expect(client.session()).rejects.not.toThrow('private-password');
  });
  it('validates successful responses instead of trusting server JSON', async () => {
    const client = createApiClient({
      baseUrl: 'http://localhost:4100',
      getCredential: () => 'local-code',
      fetch: async () =>
        new Response(JSON.stringify({ user: { id: userId }, secret: 'server-only' })),
    });
    await expect(client.session()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('requires a safe explicit API target and blocks redirects', () => {
    for (const baseUrl of [
      'http://evil.example',
      'https://user:password@example.test',
      'https://example.test?token=secret',
      'https://example.test#secret',
    ]) {
      expect(() => createApiClient({ baseUrl, getCredential: () => undefined })).toThrow(ApiError);
    }
  });
  it('fails before network work without a credential', async () => {
    const fetcher = vi.fn();
    const client = createApiClient({
      baseUrl: 'http://localhost:4100',
      getCredential: () => undefined,
      fetch: fetcher,
    });
    await expect(client.session()).rejects.toMatchObject({ status: 401 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('cancels requests on caller abort and distinguishes a timeout', async () => {
    const fetcher: typeof fetch = async (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    const client = createApiClient({
      baseUrl: 'http://localhost:4100',
      getCredential: () => 'code',
      fetch: fetcher,
      timeoutMs: 10,
    });
    await expect(client.session()).rejects.toMatchObject({ code: 'TIMEOUT' });
    const abort = new AbortController();
    const request = client.session({ signal: abort.signal });
    abort.abort();
    await expect(request).rejects.toMatchObject({ code: 'CANCELLED' });
  });
});
