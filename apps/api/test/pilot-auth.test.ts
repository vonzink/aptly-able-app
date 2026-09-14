import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  PasswordBusyError,
} from '../src/modules/identity/password.js';
import { readConfig } from '../src/bootstrap/config.js';
import { buildApp } from '../src/transport/http/app.js';
import { registerAccountSchema } from '@aptly/contracts';
import type { PilotIdentity } from '../src/modules/identity/pilot-identity.js';

describe('pilot authentication', () => {
  it('normalizes email and rejects excessive, short and unknown input fields', () => {
    const valid = {
      displayName: ' Pilot ',
      email: ' TEST@example.com ',
      password: 'long-password-123',
    };
    expect(registerAccountSchema.parse(valid)).toMatchObject({
      displayName: 'Pilot',
      email: 'test@example.com',
    });
    for (const patch of [
      { password: 'short' },
      { password: 'x'.repeat(129) },
      { role: 'admin' },
      { displayName: '' },
    ])
      expect(registerAccountSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
  it('salts hashes, compares passwords, and does work for unknown accounts', async () => {
    const hash = await hashPassword('long-password-123');
    expect(hash).not.toContain('long-password-123');
    expect(await hashPassword('long-password-123')).not.toBe(hash);
    expect(await verifyPassword('long-password-123', hash)).toBe(true);
    expect(await verifyPassword('wrong-password-123', hash)).toBe(false);
    expect(await verifyPassword('wrong-password-123', undefined)).toBe(false);
  });
  it('bounds concurrent password derivations without a growing queue', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => hashPassword('long-password-123')),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    for (const r of results)
      if (r.status === 'rejected') expect(r.reason).toBeInstanceOf(PasswordBusyError);
  });
  it('requires a database for pilot mode and preserves production dev credential prohibition', () => {
    expect(() => readConfig({ PILOT_AUTH_ENABLED: 'true' })).toThrow();
    expect(() =>
      readConfig({
        NODE_ENV: 'production',
        DEV_SESSION_TOKEN: 'a'.repeat(48),
        DEV_USER_ID: '4cbda9d7-547d-4675-a2bb-540e5c4555cf',
      }),
    ).toThrow();
  });
  it('advertises mode, awaits hosted identity, retains admin restrictions and throttles malformed attempts', async () => {
    const pilot: PilotIdentity = {
      register: async () => {
        throw Error('unexpected');
      },
      login: async () => {
        throw Error('unexpected');
      },
      logout: async () => {},
      verify: async () => ({
        userId: '4cbda9d7-547d-4675-a2bb-540e5c4555cf',
        role: 'user',
        selfService: true,
      }),
    };
    const app = buildApp({
      config: readConfig({ PILOT_AUTH_ENABLED: 'true', DATABASE_URL: 'postgres://localhost/test' }),
      probeDatabase: async () => {},
      pilotIdentity: pilot,
    });
    try {
      expect((await app.inject('/v1/auth/config')).json()).toEqual({
        pilotEnabled: true,
        developmentEnabled: false,
      });
      expect((await app.inject('/v1/session')).json()).toMatchObject({
        mode: 'pilot',
        user: { role: 'user' },
      });
      expect((await app.inject('/v1/admin/recorder-assignments')).statusCode).toBe(403);
      for (let i = 0; i < 10; i++)
        expect(
          (await app.inject({ method: 'POST', url: '/v1/auth/login', payload: {} })).statusCode,
        ).toBe(401);
      expect(
        (await app.inject({ method: 'POST', url: '/v1/auth/login', payload: {} })).statusCode,
      ).toBe(429);
      expect((await app.inject({ method: 'POST', url: '/v1/auth/logout' })).statusCode).toBe(204);
    } finally {
      await app.close();
    }
  });
});
