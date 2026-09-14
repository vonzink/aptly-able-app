import { afterEach, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/transport/http/app.js';
import { readConfig } from '../src/bootstrap/config.js';
const apps: FastifyInstance[] = [];
const credential = 'a'.repeat(48);
function fixture() {
  const app = buildApp({
    config: readConfig({
      BROWSER_ORIGINS: 'http://localhost:8088,http://localhost:8089',
      DEV_ADMIN_USER_ID: '8cd7c040-9c09-4629-b1a1-9e8dfecf4e10',
      DEV_ADMIN_SESSION_TOKEN: credential,
    }),
    probeDatabase: async () => undefined,
  });
  apps.push(app);
  return app;
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
it('returns the verified role and narrowly allows configured browser origins', async () => {
  const response = await fixture().inject({
    url: '/v1/session',
    headers: { origin: 'http://localhost:8089', authorization: `Bearer ${credential}` },
  });
  expect(response.statusCode).toBe(200);
  expect(response.json().user.role).toBe('admin');
  expect(response.headers['access-control-allow-origin']).toBe('http://localhost:8089');
  expect(response.headers['access-control-allow-credentials']).toBeUndefined();
});
it('answers allowlisted preflight without granting a session', async () => {
  const response = await fixture().inject({
    method: 'OPTIONS',
    url: '/v1/enrollments/claim',
    headers: {
      origin: 'http://localhost:8088',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization,content-type',
    },
  });
  expect(response.statusCode).toBe(204);
  expect(response.headers['access-control-allow-headers']).toBe('Authorization, Content-Type');
});
it('denies unapproved and null origins, even with valid credentials', async () => {
  const app = fixture();
  for (const origin of ['https://evil.example', 'http://localhost:9999', 'null']) {
    expect(
      (
        await app.inject({
          url: '/v1/session',
          headers: { origin, authorization: `Bearer ${credential}` },
        })
      ).statusCode,
    ).toBe(403);
  }
});
it('rejects broad or malformed browser-origin configuration', () => {
  for (const BROWSER_ORIGINS of [
    '*',
    'http://evil.example',
    'https://example.test/path',
    'https://example.test?x=1',
  ])
    expect(() => readConfig({ BROWSER_ORIGINS })).toThrow();
});
