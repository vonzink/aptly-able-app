import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/transport/http/app.js';
import { readConfig } from '../src/bootstrap/config.js';
import type { PlaudDeviceService } from '../src/modules/plaud-devices/service.js';
import { PlaudDeviceError } from '../src/modules/plaud-devices/errors.js';
const userId = '6c541871-348c-479a-8aac-ff7dfe1ea8b1';
const operationId = 'a48abcc4-4a79-40d8-8184-8ea53f76db72';
const session = {
  userId,
  userAccessToken: 'transient-user-token',
  expiresAt: '2026-09-11T13:00:00.000Z',
  customDomain: 'platform-us.plaud.ai' as const,
  recorder: { serial: '8820000000000001', model: 'notepins' as const },
};
const apps: FastifyInstance[] = [];
function fixture(configured = true, storage = true, healthy = true) {
  const service = {
    session: vi.fn(async () => session),
    bind: vi.fn(async () => ({ status: 'bound' as const })),
    unbind: vi.fn(async () => ({ status: 'unbound' as const })),
    completeUnpair: vi.fn(async () => ({ status: 'released' as const })),
  } satisfies PlaudDeviceService;
  const config = readConfig({
    DEV_SESSION_TOKEN: 'u'.repeat(48),
    DEV_USER_ID: userId,
    ...(configured ? { PLAUD_CLIENT_ID: 'client', PLAUD_CLIENT_SECRET: 'secret' } : {}),
  });
  const app = buildApp({
    config,
    probeDatabase: async () => {
      if (!healthy) throw new Error('private-database-error');
    },
    ...(storage ? { plaudDevices: service } : {}),
  });
  apps.push(app);
  return { app, service };
}
const headers = { authorization: `Bearer ${'u'.repeat(48)}` };
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
describe('Plaud device HTTP boundaries', () => {
  it.each([
    [false, true, 'not_configured'],
    [true, false, 'storage_unavailable'],
    [true, true, 'ready'],
  ] as const)(
    'reports SDK capability for configuration %s and storage %s',
    async (configured, storage, reason) => {
      const { app } = fixture(configured, storage);
      const response = await app.inject('/v1/plaud/capabilities');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ available: reason === 'ready', reason });
      expect(response.headers['cache-control']).toBe('no-store');
    },
  );
  it('reports unavailable storage when the configured database probe fails', async () => {
    const { app } = fixture(true, true, false);
    const response = await app.inject('/v1/plaud/capabilities');
    expect(response.json()).toEqual({ available: false, reason: 'storage_unavailable' });
    expect(response.body).not.toContain('private-database-error');
  });
  it.each([
    ['session', 'session'],
    ['bind', 'bind'],
    ['unbind', 'unbind'],
    ['completeUnpair', 'complete-unpair'],
  ] as const)(
    'authenticates and validates the %s request before calling the service',
    async (method, path) => {
      const { app, service } = fixture();
      const url = `/v1/plaud/device-${path}`;
      expect((await app.inject({ method: 'POST', url, payload: { operationId } })).statusCode).toBe(
        401,
      );
      for (const payload of [
        { operationId: 'bad' },
        { operationId, userId },
        { operationId, serial: '8820000000000002' },
        { operationId, customDomain: 'elsewhere.test' },
      ]) {
        expect((await app.inject({ method: 'POST', url, headers, payload })).statusCode).toBe(400);
      }
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `${url}?token=secret`,
            headers,
            payload: { operationId },
          })
        ).statusCode,
      ).toBe(400);
      expect(service[method]).not.toHaveBeenCalled();
      const response = await app.inject({
        method: 'POST',
        url,
        headers: { ...headers, 'x-user-id': 'attacker' },
        payload: { operationId },
      });
      expect(response.statusCode).toBe(200);
      expect(service[method]).toHaveBeenCalledWith({ userId, role: 'user' }, operationId);
      expect(response.json()).toEqual(
        method === 'session'
          ? session
          : { status: method === 'bind' ? 'bound' : method === 'unbind' ? 'unbound' : 'released' },
      );
      expect(response.headers['cache-control']).toBe('no-store');
    },
  );
  it('returns predictable unavailable and ownership errors without raw exceptions', async () => {
    const disabled = fixture(false);
    expect(
      (
        await disabled.app.inject({
          method: 'POST',
          url: '/v1/plaud/device-session',
          headers,
          payload: { operationId },
        })
      ).statusCode,
    ).toBe(503);
    expect(disabled.service.session).not.toHaveBeenCalled();
    const { app, service } = fixture();
    service.bind.mockRejectedValueOnce(
      new PlaudDeviceError(
        'PLAUD_ENROLLMENT_INACTIVE',
        409,
        'This recorder enrollment is no longer active.',
      ),
    );
    const response = await app.inject({
      method: 'POST',
      url: '/v1/plaud/device-bind',
      headers,
      payload: { operationId },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('PLAUD_ENROLLMENT_INACTIVE');
    service.session.mockRejectedValueOnce(new Error('private-upstream-token'));
    const failure = await app.inject({
      method: 'POST',
      url: '/v1/plaud/device-session',
      headers,
      payload: { operationId },
    });
    expect(failure.statusCode).toBe(500);
    expect(failure.body).not.toContain('private-upstream-token');
  });
});
