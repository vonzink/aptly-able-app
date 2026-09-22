import { createRecorderSetupService } from '../src/modules/recorder-setup/service.js';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { migrate } from '../src/infrastructure/migrate.js';
import { createEnrollmentService } from '../src/modules/enrollments/service.js';
import { createPilotIdentity } from '../src/modules/identity/pilot-identity.js';
import { buildApp } from '../src/transport/http/app.js';
import { readConfig } from '../src/bootstrap/config.js';

const schema = `recorder_setup_${randomBytes(8).toString('hex')}`;
const control = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
let pool: pg.Pool;
let app: ReturnType<typeof buildApp>;
let accounts: { credential: string; session: { user: { id: string } } }[];
let enrollments: ReturnType<typeof createEnrollmentService>;
const post = (credential: string, url: string, payload: unknown = {}) =>
  app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${credential}` }, payload });
const get = (credential: string) =>
  app.inject({ url: '/v1/me/recorders', headers: { authorization: `Bearer ${credential}` } });
const actor = (index: number) => ({
  userId: accounts[index]!.session.user.id,
  role: 'user' as const,
  selfService: true,
});
let serialSequence = 0;
const assign = (index: number) =>
  enrollments.createAssignment(actor(index), {
    userId: actor(index).userId,
    serial: `882B${(++serialSequence).toString().padStart(12, '0')}`,
    model: 'notepins',
  });
beforeAll(async () => {
  await control.query(`CREATE SCHEMA ${schema}`);
  pool = new pg.Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    options: `-c search_path=${schema}`,
  });
  await migrate(pool);
  enrollments = createEnrollmentService(pool);
  app = buildApp({
    config: readConfig({ PILOT_AUTH_ENABLED: 'true', DATABASE_URL: process.env.TEST_DATABASE_URL }),
    probeDatabase: async () => {},
    pilotIdentity: createPilotIdentity(pool),
    recorderSetup: createRecorderSetupService(pool),
    enrollments,
  });
  accounts = [];
  for (const name of ['first', 'second']) {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        displayName: name,
        email: `${name}@example.test`,
        password: 'A long test-only password',
      },
    });
    expect(response.statusCode).toBe(201);
    accounts.push(response.json());
  }
});
afterAll(async () => {
  await app?.close();
  await pool?.end();
  await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await control.end();
});

test('a fresh phone discovers only its account active assignments, without an invitation', async () => {
  const first = await assign(0);
  const second = await assign(1);
  const ended = await assign(0);
  await enrollments.endAssignment(actor(0), ended.id, 'released');
  const response = await get(accounts[0]!.credential);
  expect(response.statusCode).toBe(200);
  expect(response.headers['cache-control']).toContain('no-store');
  const list = response.json();
  expect(list.canAdd).toBe(true);
  expect(list.recorders.map((r: { assignmentId: string }) => r.assignmentId)).toContain(first.id);
  expect(list.recorders.map((r: { assignmentId: string }) => r.assignmentId)).not.toContain(
    second.id,
  );
  expect(list.recorders.map((r: { assignmentId: string }) => r.assignmentId)).not.toContain(
    ended.id,
  );
  expect(
    list.recorders.find((r: { assignmentId: string }) => r.assignmentId === first.id),
  ).toMatchObject({ operation: null, setupBlocked: false, recorder: { model: 'notepins' } });
  expect(JSON.stringify(list)).not.toContain('token');
});
test('adding from the app is retry-safe and refuses an existing assignment owned by another account', async () => {
  const body = { model: 'notepins', serial: '882B900001234' };
  const responses = await Promise.all([
    post(accounts[0]!.credential, '/v1/me/recorders', body),
    post(accounts[0]!.credential, '/v1/me/recorders', body),
  ]);
  expect(responses.map((r) => r.statusCode)).toEqual([200, 200]);
  expect(responses[0]!.json().assignmentId).toBe(responses[1]!.json().assignmentId);
  expect((await post(accounts[1]!.credential, '/v1/me/recorders', body)).statusCode).toBe(409);
  expect(
    (await post(accounts[0]!.credential, '/v1/me/recorders', { ...body, userId: actor(1).userId }))
      .statusCode,
  ).toBe(400);
});
test('setup resumes the same operation after a lost response and rejects another account', async () => {
  const assignment = await assign(0);
  const url = `/v1/me/recorders/${assignment.id}/setup`;
  expect((await post(accounts[1]!.credential, url)).statusCode).toBe(404);
  const responses = await Promise.all([
    post(accounts[0]!.credential, url),
    post(accounts[0]!.credential, url),
  ]);
  expect(responses.map((r) => r.statusCode)).toEqual([200, 200]);
  const operation = responses[0]!.json();
  expect(operation.status).toBe('pending');
  expect(responses[1]!.json()).toEqual(operation);
  expect((await enrollments.getOperation(actor(0), operation.id)).id).toBe(operation.id);
  const stored = await pool.query('SELECT enrollment_token_id FROM setup_operations WHERE id=$1', [
    operation.id,
  ]);
  expect(stored.rows[0].enrollment_token_id).toBeNull();
  await enrollments.endAssignment(actor(0), assignment.id, 'released');
  expect((await post(accounts[0]!.credential, url)).statusCode).toBe(404);
});
test('a revoked invitation setup cannot be silently recreated through account recovery', async () => {
  const assignment = await assign(0);
  const token = await enrollments.issueToken(actor(0), assignment.id, 86400);
  const operation = await enrollments.claim(actor(0), token.rawToken, randomUUID());
  expect(
    (await post(accounts[0]!.credential, `/v1/me/recorders/${assignment.id}/setup`)).json().id,
  ).toBe(operation.id);
  await enrollments.revokeToken(actor(0), token.id);
  expect(
    (await post(accounts[0]!.credential, `/v1/me/recorders/${assignment.id}/setup`)).statusCode,
  ).toBe(409);
  const list = (await get(accounts[0]!.credential)).json();
  expect(
    list.recorders.find((r: { assignmentId: string }) => r.assignmentId === assignment.id)
      .setupBlocked,
  ).toBe(true);
});
test('requires authentication and validates recorder identity', async () => {
  expect((await app.inject({ url: '/v1/me/recorders' })).statusCode).toBe(401);
  expect(
    (
      await post(accounts[0]!.credential, '/v1/me/recorders', {
        model: 'notepro',
        serial: '882B900001234',
      })
    ).statusCode,
  ).toBe(400);
});

test('employees can resume their assigned recorder but cannot add, and admins cannot claim another account recorder through me', async () => {
  const setup = createRecorderSetupService(pool);
  const employee = { userId: actor(0).userId, role: 'user' as const };
  const own = await assign(0);
  const other = await assign(1);
  expect((await setup.list(employee)).canAdd).toBe(false);
  await expect(
    setup.add(employee, { model: 'notepro', serial: '881B900009999' }),
  ).rejects.toMatchObject({ statusCode: 403 });
  expect((await setup.begin(employee, own.id)).assignmentId).toBe(own.id);
  const admin = { ...employee, role: 'admin' as const };
  expect((await setup.list(admin)).recorders.some((r) => r.assignmentId === other.id)).toBe(false);
  await expect(setup.begin(admin, other.id)).rejects.toMatchObject({ statusCode: 404 });
});

test('a new invitation can explicitly restore revoked access and direct setup is revoked with its assignment', async () => {
  const assignment = await assign(0);
  const first = await enrollments.issueToken(actor(0), assignment.id, 86400);
  await enrollments.claim(actor(0), first.rawToken, randomUUID());
  await enrollments.revokeToken(actor(0), first.id);
  const replacement = await enrollments.issueToken(actor(0), assignment.id, 86400);
  const restored = await enrollments.claim(actor(0), replacement.rawToken, randomUUID());
  expect((await createRecorderSetupService(pool).begin(actor(0), assignment.id)).id).toBe(
    restored.id,
  );
  const direct = await assign(1);
  const operation = await createRecorderSetupService(pool).begin(actor(1), direct.id);
  await enrollments.endAssignment(actor(1), direct.id, 'revoked');
  expect((await enrollments.getOperation(actor(1), operation.id)).status).toBe('revoked');
});
