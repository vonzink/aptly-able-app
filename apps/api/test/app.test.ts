import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/transport/http/app.js';
import { readConfig } from '../src/bootstrap/config.js';
const token = 'local-test-credential-'.repeat(3);
const userId = '6c541871-348c-479a-8aac-ff7dfe1ea8b1';
const apps: FastifyInstance[] = [];
function makeApp({ enabled = true, ready = true } = {}) {
  const config = readConfig(enabled ? { DEV_SESSION_TOKEN: token, DEV_USER_ID: userId } : {});
  const app = buildApp({
    config,
    probeDatabase: async () => {
      if (!ready) throw new Error('postgres://private-password@host');
    },
  });
  apps.push(app);
  return app;
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
describe('local API boundaries', () => {
  it('is live but not ready when the database is unavailable', async () => {
    const app = makeApp({ ready: false });
    expect((await app.inject({ url: '/health/live' })).statusCode).toBe(200);
    const response = await app.inject({ url: '/health/ready' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'unavailable' });
    expect(response.body).not.toContain('private-password');
  });
  it('reports ready only after a successful database probe', async () => {
    expect((await makeApp().inject({ url: '/health/ready' })).json()).toEqual({ status: 'ok' });
  });
  it('denies missing, incorrect and query-string credentials', async () => {
    const app = makeApp();
    for (const request of [
      { url: '/v1/session' },
      { url: '/v1/session', headers: { authorization: 'Bearer wrong' } },
      { url: `/v1/session?token=${token}` },
    ]) {
      expect((await app.inject(request)).statusCode).toBe(401);
    }
  });
  it('does not accept client-supplied identity or expose the bearer token', async () => {
    const response = await makeApp().inject({
      url: '/v1/session',
      headers: { authorization: `Bearer ${token}`, 'x-user-id': 'other-user' },
    });
    expect(response.json()).toEqual({ user: { id: userId, role: 'user' }, mode: 'development' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).not.toContain(token);
  });
  it('denies all development sessions when identity is disabled', async () => {
    expect(
      (
        await makeApp({ enabled: false }).inject({
          url: '/v1/session',
          headers: { authorization: `Bearer ${token}` },
        })
      ).statusCode,
    ).toBe(401);
  });
  it('returns sanitized errors with a request ID', async () => {
    const app = makeApp();
    app.get('/test-error', () => {
      throw new Error('super-secret-transcript');
    });
    const response = await app.inject({ url: '/test-error' });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
    expect(response.json().error.requestId).toBeTypeOf('string');
    expect(response.body).not.toContain('super-secret-transcript');
  });
});
