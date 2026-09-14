import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { migrate } from '../src/infrastructure/migrate.js';
import { createEnrollmentService } from '../src/modules/enrollments/service.js';
import { createAdminEnrollmentQueries } from '../src/modules/enrollments/admin-queries.js';
import { createPilotIdentity } from '../src/modules/identity/pilot-identity.js';
import { buildApp } from '../src/transport/http/app.js';
import { readConfig } from '../src/bootstrap/config.js';

describe('self-service workspace', () => {
  const schema = `workspace_${randomBytes(10).toString('hex')}`;
  const control = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  let pool: pg.Pool;
  let app: ReturnType<typeof buildApp>;
  let first: { credential: string; session: { user: { id: string } } };
  let second: typeof first;
  let assignmentId: string;
  let tokenId: string;
  let rawToken: string;
  const post = (credential: string, url: string, payload: unknown) =>
    app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' },
      payload: JSON.stringify(payload),
    });
  const get = (credential: string, url: string) =>
    app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${credential}` } });
  beforeAll(async () => {
    await control.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      options: `-c search_path=${schema}`,
    });
    await migrate(pool);
    app = buildApp({
      config: readConfig({
        PILOT_AUTH_ENABLED: 'true',
        DATABASE_URL: process.env.TEST_DATABASE_URL,
        ENROLLMENT_BASE_URL: 'https://pilot.example.com/enroll',
      }),
      probeDatabase: async () => {},
      pilotIdentity: createPilotIdentity(pool),
      enrollments: createEnrollmentService(pool),
      adminQueries: createAdminEnrollmentQueries(pool),
    });
    // Body strings above intentionally get an explicit content type for the API.
    const register = async (name: string) => {
      const result = await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        headers: { 'content-type': 'application/json' },
        payload: {
          displayName: name,
          email: `${name}@example.com`,
          password: 'A private pilot password 2026',
        },
      });
      expect(result.statusCode).toBe(201);
      return result.json();
    };
    first = await register('first');
    second = await register('second');
  });
  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await control.end();
  });

  test('lists only self and refuses all administrator routes', async () => {
    expect((await get(first.credential, '/v1/workspace/users')).json()).toEqual({
      users: [{ id: first.session.user.id, displayName: 'first' }],
      hasMore: false,
    });
    expect((await get(first.credential, '/v1/admin/users')).statusCode).toBe(403);
    expect((await post(first.credential, '/v1/admin/recorder-assignments', {})).statusCode).toBe(
      403,
    );
  });
  test('creates only own assignment and hides it from another tester', async () => {
    const request = { userId: second.session.user.id, serial: '882B100005641', model: 'notepins' };
    expect(
      (await post(first.credential, '/v1/workspace/recorder-assignments', request)).statusCode,
    ).toBe(403);
    const created = await post(first.credential, '/v1/workspace/recorder-assignments', {
      ...request,
      userId: first.session.user.id,
    });
    expect(created.statusCode).toBe(201);
    assignmentId = created.json().id;
    expect(
      (await get(second.credential, '/v1/workspace/recorder-assignments')).json().assignments,
    ).toEqual([]);
    expect(
      (await get(second.credential, `/v1/workspace/recorder-assignments/${assignmentId}`))
        .statusCode,
    ).toBe(404);
  });
  test('platform QR preserves fragment and denies cross-account issue/revoke/end', async () => {
    const path = `/v1/workspace/recorder-assignments/${assignmentId}/enrollment-tokens`;
    expect((await post(second.credential, path, { platform: 'android' })).statusCode).toBe(404);
    expect((await post(first.credential, path, { platform: 'windows' })).statusCode).toBe(400);
    const created = await post(first.credential, path, { platform: 'android' });
    expect(created.statusCode).toBe(201);
    tokenId = created.json().id;
    const url = new URL(created.json().enrollmentUrl);
    expect(url.search).toBe('?platform=android');
    rawToken = new URLSearchParams(url.hash.slice(1)).get('token')!;
    expect(rawToken).toHaveLength(43);
    expect(
      (await post(second.credential, `/v1/workspace/enrollment-tokens/${tokenId}/revoke`, {}))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await post(second.credential, `/v1/workspace/recorder-assignments/${assignmentId}/end`, {
          status: 'released',
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await post(second.credential, '/v1/enrollments/claim', {
          token: rawToken,
          idempotencyKey: randomUUID(),
        })
      ).statusCode,
    ).toBe(404);
  });
  test('replacement iOS QR invalidates old invitation; owner can claim and end', async () => {
    const created = await post(
      first.credential,
      `/v1/workspace/recorder-assignments/${assignmentId}/enrollment-tokens`,
      { platform: 'ios' },
    );
    expect(created.statusCode).toBe(201);
    expect(
      (await post(first.credential, '/v1/enrollments/resolve', { token: rawToken })).statusCode,
    ).toBe(404);
    const url = new URL(created.json().enrollmentUrl);
    expect(url.searchParams.get('platform')).toBe('ios');
    const token = new URLSearchParams(url.hash.slice(1)).get('token');
    const claim = await post(first.credential, '/v1/enrollments/claim', {
      token,
      idempotencyKey: randomUUID(),
    });
    expect(claim.statusCode).toBe(200);
    expect(
      (
        await post(first.credential, `/v1/workspace/recorder-assignments/${assignmentId}/end`, {
          status: 'released',
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await get(first.credential, `/v1/enrollments/operations/${claim.json().id}`)).json().status,
    ).toBe('revoked');
  });
});
