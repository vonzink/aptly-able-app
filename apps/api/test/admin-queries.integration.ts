import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { beforeAll, afterAll, expect, test } from 'vitest';
import { migrate } from '../src/infrastructure/migrate.js';
import { createEnrollmentService } from '../src/modules/enrollments/service.js';
import { createAdminEnrollmentQueries } from '../src/modules/enrollments/admin-queries.js';
const schema = `admin_${randomBytes(10).toString('hex')}`;
const control = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  options: `-c search_path=${schema}`,
});
const admin = { userId: randomUUID(), role: 'admin' as const };
const user = { userId: randomUUID(), role: 'user' as const };
beforeAll(async () => {
  await control.query(`CREATE SCHEMA ${schema}`);
  await migrate(pool);
  await pool.query('INSERT INTO users(id, display_name) VALUES ($1,$2),($3,$4)', [
    admin.userId,
    'Administrator',
    user.userId,
    'Zach (test)',
  ]);
});
afterAll(async () => {
  await pool.end();
  await control.query(`DROP SCHEMA ${schema} CASCADE`);
  await control.end();
});
test('admin reads combine persisted assignment, invitation and setup without secrets', async () => {
  const service = createEnrollmentService(pool);
  const reads = createAdminEnrollmentQueries(pool);
  const assignment = await service.createAssignment(admin, {
    userId: user.userId,
    serial: '8810004812',
    model: 'notepro',
  });
  const invitation = await service.issueToken(admin, assignment.id, 600);
  const key = randomUUID();
  const operation = await service.claim(user, invitation.rawToken, key);
  const row = await reads.assignment(admin, assignment.id);
  expect(row.user.displayName).toBe('Zach (test)');
  expect(row.recorder.serialSuffix).toBe('4812');
  expect(row.latestInvitation?.usedAt).not.toBeNull();
  expect(row.latestOperation).toEqual(operation);
  expect(JSON.stringify(row)).not.toContain(invitation.rawToken);
  expect(JSON.stringify(row)).not.toContain('8810004812');
  expect((await reads.assignments(admin, 1)).assignments).toHaveLength(1);
  expect((await reads.users(admin, 1)).users).toHaveLength(2);
  await expect(reads.assignment(user, assignment.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(reads.users(user, 1)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(reads.assignments(user, 1)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(await service.getClaimOperation(user, key)).toEqual(operation);
  await expect(service.getClaimOperation(admin, key)).rejects.toMatchObject({
    code: 'ENROLLMENT_UNAVAILABLE',
  });
});
test('pagination is bounded and does not silently hide additional users', async () => {
  const reads = createAdminEnrollmentQueries(pool);
  for (let index = 0; index < 26; index++)
    await pool.query('INSERT INTO users(id, display_name) VALUES($1,$2)', [
      randomUUID(),
      `Person ${index}`,
    ]);
  const first = await reads.users(admin, 1);
  const second = await reads.users(admin, 2);
  expect(first.users).toHaveLength(25);
  expect(first.hasMore).toBe(true);
  expect(second.users).toHaveLength(3);
  expect(second.hasMore).toBe(false);
  await expect(reads.users(admin, 0)).rejects.toMatchObject({ statusCode: 400 });
});
