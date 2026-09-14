import { describe, it, expect, vi } from 'vitest';
import { createAuthClient } from '../src/auth.js';
describe('auth client', () => {
  it('normalizes signup and sends opaque credentials only in logout headers', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            credential: 'x'.repeat(43),
            expiresAt: '2026-10-01T00:00:00.000Z',
            session: {
              user: { id: '4cbda9d7-547d-4675-a2bb-540e5c4555cf', role: 'user' },
              mode: 'pilot',
            },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = createAuthClient({ baseUrl: 'https://api.example.com', fetch });
    await client.register({
      displayName: ' Pilot ',
      email: 'TEST@example.com',
      password: 'long-password-123',
    });
    expect(fetch.mock.calls[0]?.[1]?.body).toContain('test@example.com');
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
    });
    await client.logout('x'.repeat(43));
    expect(fetch.mock.calls[1]?.[1]?.headers).toMatchObject({
      Authorization: `Bearer ${'x'.repeat(43)}`,
    });
    expect(fetch.mock.calls[1]?.[1]?.body).toBeUndefined();
  });
  it('aborts a non-cooperative transport and does not expose server error text', async () => {
    const controller = new AbortController();
    const client = createAuthClient({
      baseUrl: 'https://api.example.com',
      fetch: () => new Promise(() => {}),
    });
    const pending = client.config({ signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
    const failing = createAuthClient({
      baseUrl: 'https://api.example.com',
      fetch: async () => new Response('private backend error', { status: 401 }),
    });
    await expect(failing.config()).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  });
  it('times out even when a transport ignores cancellation', async () => {
    vi.useFakeTimers();
    try {
      const client = createAuthClient({
        baseUrl: 'https://api.example.com',
        fetch: () => new Promise(() => {}),
      });
      const pending = expect(client.config()).rejects.toMatchObject({ code: 'TIMEOUT' });
      await vi.advanceTimersByTimeAsync(30000);
      await pending;
    } finally {
      vi.useRealTimers();
    }
  });
});
