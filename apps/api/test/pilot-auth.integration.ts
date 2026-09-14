import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { beforeAll, afterAll, describe, test, expect } from 'vitest';
import { migrate } from '../src/infrastructure/migrate.js';
import { createPilotIdentity } from '../src/modules/identity/pilot-identity.js';

describe('pilot account persistence', () => {
  const schema = `pilot_${randomBytes(10).toString('hex')}`;
  let pool: pg.Pool;
  let control: pg.Pool;
  beforeAll(async () => {
    control = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await control.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      options: `-c search_path=${schema}`,
    });
    await migrate(pool);
  });
  afterAll(async () => {
    await pool?.end();
    await control?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await control?.end();
  });
  test('register, normalized login, duplicate rollback, secret hashing, expiry and revocation', async () => {
    const identity = createPilotIdentity(pool);
    const input = {
      displayName: 'Pilot',
      email: 'pilot@example.com',
      password: 'long-password-123',
    };
    const registered = await identity.register(input);
    expect(registered.session).toMatchObject({ mode: 'pilot', user: { role: 'user' } });
    expect(Date.parse(registered.expiresAt) - Date.now()).toBeGreaterThan(6.99 * 86400000);
    expect(await identity.verify(`Bearer ${registered.credential}`)).toEqual({
      userId: registered.session.user.id,
      role: 'user',
      selfService: true,
    });
    const stored = await pool.query('SELECT * FROM pilot_sessions');
    expect(JSON.stringify(stored.rows)).not.toContain(registered.credential);
    await expect(identity.register({ ...input, email: 'PILOT@example.com' })).rejects.toMatchObject(
      { code: 'AUTH_FAILED' },
    );
    expect((await pool.query('SELECT count(*)::int AS count FROM users')).rows[0].count).toBe(1);
    const logged = await identity.login({ password: input.password, email: ' PILOT@example.com ' });
    expect(logged.credential).not.toBe(registered.credential);
    for (const patch of [{ password: 'wrong-password-123' }, { email: 'missing@example.com' }])
      await expect(
        identity.login({ email: input.email, password: input.password, ...patch }),
      ).rejects.toMatchObject({
        code: 'AUTH_FAILED',
      });
    await identity.logout(`Bearer ${registered.credential}`);
    expect(await identity.verify(`Bearer ${registered.credential}`)).toBeUndefined();
    expect(await identity.verify(`Bearer ${logged.credential}`)).toBeDefined();
    await pool.query(
      "UPDATE pilot_sessions SET created_at=clock_timestamp()-interval '8 days', expires_at=clock_timestamp()-interval '1 day'",
    );
    expect(await identity.verify(`Bearer ${logged.credential}`)).toBeUndefined();
    expect(await identity.verify(`Bearer ${'x'.repeat(43)}`)).toBeUndefined();
    expect(await identity.verify(undefined)).toBeUndefined();
  });
});
