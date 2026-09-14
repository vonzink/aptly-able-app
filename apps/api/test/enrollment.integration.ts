import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { migrate } from '../src/infrastructure/migrate.js';
import { createEnrollmentService, EnrollmentError } from '../src/modules/enrollments/service.js';

const databaseUrl = process.env.TEST_DATABASE_URL!;

describe('enrollment persistence', () => {
  const schema = `enrollment_${randomBytes(10).toString('hex')}`;
  const admin = { userId: randomUUID(), role: 'admin' as const };
  const user = { userId: randomUUID(), role: 'user' as const };
  const otherUser = { userId: randomUUID(), role: 'user' as const };
  let control: pg.Pool;
  let pool: pg.Pool;

  beforeAll(async () => {
    control = new pg.Pool({ connectionString: databaseUrl });
    await control.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({
      connectionString: databaseUrl,
      max: 12,
      options: `-c search_path=${schema}`,
    });
    await migrate(pool);
    await pool.query('INSERT INTO users(id) VALUES ($1), ($2), ($3)', [
      admin.userId,
      user.userId,
      otherUser.userId,
    ]);
  });

  afterAll(async () => {
    await pool?.end();
    await control?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await control?.end();
  });

  test('migrations repeat safely and reject edited history without applying later work', async () => {
    await migrate(pool);
    const applied = await pool.query<{ version: string; checksum: string }>(
      'SELECT version, checksum FROM schema_migrations ORDER BY version',
    );
    expect(applied.rows).toHaveLength(4);
    await pool.query('UPDATE schema_migrations SET checksum = $1 WHERE version = $2', [
      '0'.repeat(64),
      applied.rows[0]?.version,
    ]);
    await expect(migrate(pool)).rejects.toThrow(/checksum/i);
    const stillOne = await pool.query<{ count: string }>('SELECT count(*) FROM schema_migrations');
    expect(stillOne.rows[0]?.count).toBe('4');
    await pool.query('UPDATE schema_migrations SET checksum = $1 WHERE version = $2', [
      applied.rows[0]?.checksum,
      applied.rows[0]?.version,
    ]);
    await pool.query('INSERT INTO schema_migrations(version, checksum) VALUES ($1, $2)', [
      '999_removed.sql',
      '1'.repeat(64),
    ]);
    await expect(migrate(pool)).rejects.toThrow(/absent/i);
    await pool.query('DELETE FROM schema_migrations WHERE version = $1', ['999_removed.sql']);
  });

  test('creates immutable assignments and enforces recorder conflicts and known users', async () => {
    const service = createEnrollmentService(pool);
    const serial = `NP-${randomBytes(5).toString('hex')}-1234`;
    const assignment = await service.createAssignment(admin, {
      userId: user.userId,
      serial,
      model: 'notepro',
    });
    expect(assignment).toMatchObject({ userId: user.userId, status: 'active' });
    await expect(
      service.createAssignment(admin, { userId: otherUser.userId, serial, model: 'notepro' }),
    ).rejects.toMatchObject({ code: 'ASSIGNMENT_CONFLICT', statusCode: 409 });
    await expect(
      service.createAssignment(admin, { userId: user.userId, serial, model: 'notepins' }),
    ).rejects.toMatchObject({ code: 'ASSIGNMENT_CONFLICT', statusCode: 409 });
    await expect(
      service.createAssignment(admin, {
        userId: randomUUID(),
        serial: `NP-${randomBytes(5).toString('hex')}-5678`,
        model: 'notepro',
      }),
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND', statusCode: 404 });
    await expect(
      pool.query('UPDATE recorder_assignments SET user_id = $1 WHERE id = $2', [
        otherUser.userId,
        assignment.id,
      ]),
    ).rejects.toThrow();
  });

  test('stores only token hashes, returns suffix-only previews, and hides unavailable reasons', async () => {
    const service = createEnrollmentService(pool);
    const serial = `NP-${randomBytes(5).toString('hex')}-4812`;
    const assignment = await service.createAssignment(admin, {
      userId: user.userId,
      serial,
      model: 'notepro',
    });
    const invitation = await service.issueToken(admin, assignment.id, 600);
    expect(invitation.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = await pool.query<{ token_hash: string }>(
      'SELECT token_hash FROM enrollment_tokens WHERE id = $1',
      [invitation.id],
    );
    expect(stored.rows[0]?.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.rows[0]?.token_hash).not.toContain(invitation.rawToken);
    expect(JSON.stringify(await service.resolve(user, invitation.rawToken))).not.toContain(serial);
    expect(await service.resolve(user, invitation.rawToken)).toMatchObject({
      assignmentId: assignment.id,
      recorder: { model: 'notepro', serialSuffix: '4812' },
    });
    for (const attempt of [
      service.resolve(otherUser, invitation.rawToken),
      service.resolve(user, randomBytes(32).toString('base64url')),
    ]) {
      await expect(attempt).rejects.toMatchObject({
        code: 'ENROLLMENT_UNAVAILABLE',
        statusCode: 404,
      });
    }
  });

  test('same-key concurrent claims converge and a different key cannot consume the token', async () => {
    const service = createEnrollmentService(pool);
    const assignment = await service.createAssignment(admin, {
      userId: user.userId,
      serial: `NP-${randomBytes(5).toString('hex')}-2201`,
      model: 'notepro',
    });
    const invitation = await service.issueToken(admin, assignment.id, 600);
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => service.claim(user, invitation.rawToken, key)),
    );
    expect(new Set(results.map(({ id }) => id)).size).toBe(1);
    await pool.query(
      `UPDATE enrollment_tokens
       SET created_at = clock_timestamp() - interval '2 seconds',
           expires_at = clock_timestamp() - interval '1 second'
       WHERE id = $1`,
      [invitation.id],
    );
    expect(await service.claim(user, invitation.rawToken, key)).toEqual(results[0]);
    await expect(service.claim(user, invitation.rawToken, randomUUID())).rejects.toMatchObject({
      code: 'ENROLLMENT_UNAVAILABLE',
      statusCode: 404,
    });
    expect(await service.getOperation(user, results[0]!.id)).toEqual(results[0]);
    await expect(service.getOperation(otherUser, results[0]!.id)).rejects.toMatchObject({
      code: 'ENROLLMENT_UNAVAILABLE',
      statusCode: 404,
    });
  });

  test('different-key concurrent claims have one winner', async () => {
    const service = createEnrollmentService(pool);
    const assignment = await service.createAssignment(admin, {
      userId: user.userId,
      serial: `NP-${randomBytes(5).toString('hex')}-2202`,
      model: 'notepro',
    });
    const invitation = await service.issueToken(admin, assignment.id, 600);
    const settled = await Promise.allSettled([
      service.claim(user, invitation.rawToken, randomUUID()),
      service.claim(user, invitation.rawToken, randomUUID()),
    ]);
    expect(settled.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(settled.filter(({ status }) => status === 'rejected')).toHaveLength(1);
  });

  test('same idempotency key raced across assignments rolls the loser back', async () => {
    const service = createEnrollmentService(pool);
    const assignments = await Promise.all([
      service.createAssignment(admin, {
        userId: user.userId,
        serial: `NP-${randomBytes(5).toString('hex')}-2251`,
        model: 'notepro',
      }),
      service.createAssignment(admin, {
        userId: user.userId,
        serial: `NP-${randomBytes(5).toString('hex')}-2252`,
        model: 'notepro',
      }),
    ]);
    const tokens = await Promise.all(
      assignments.map(({ id }) => service.issueToken(admin, id, 600)),
    );
    const key = randomUUID();
    const settled = await Promise.allSettled(
      tokens.map(({ rawToken }) => service.claim(user, rawToken, key)),
    );
    expect(settled.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(settled.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    const stored = await pool.query<{ used: string }>(
      `SELECT count(*) FILTER (WHERE used_at IS NOT NULL)::text AS used
       FROM enrollment_tokens WHERE id = ANY($1::uuid[])`,
      [tokens.map(({ id }) => id)],
    );
    expect(stored.rows[0]?.used).toBe('1');
  });

  test('assignment ending raced with claim leaves no pending operation', async () => {
    const service = createEnrollmentService(pool);
    const assignment = await service.createAssignment(admin, {
      userId: user.userId,
      serial: `NP-${randomBytes(5).toString('hex')}-2261`,
      model: 'notepro',
    });
    const token = await service.issueToken(admin, assignment.id, 600);
    await Promise.allSettled([
      service.claim(user, token.rawToken, randomUUID()),
      service.endAssignment(admin, assignment.id, 'revoked'),
    ]);
    const state = await pool.query<{ pending: string; status: string }>(
      `SELECT a.status,
              count(o.id) FILTER (WHERE o.status = 'pending')::text AS pending
       FROM recorder_assignments a
       LEFT JOIN setup_operations o ON o.assignment_id = a.id
       WHERE a.id = $1 GROUP BY a.status`,
      [assignment.id],
    );
    expect(state.rows[0]).toEqual({ status: 'revoked', pending: '0' });
  });

  test('an idempotency key reused for another token conflicts and leaves it unconsumed', async () => {
    const service = createEnrollmentService(pool);
    const first = await service.createAssignment(admin, {
      userId: user.userId,
      serial: `NP-${randomBytes(5).toString('hex')}-3301`,
      model: 'notepro',
    });
    const second = await service.createAssignment(admin, {
      userId: user.userId,
      serial: `NP-${randomBytes(5).toString('hex')}-3302`,
      model: 'notepro',
    });
    const tokenOne = await service.issueToken(admin, first.id, 600);
    const tokenTwo = await service.issueToken(admin, second.id, 600);
    const key = randomUUID();
    await service.claim(user, tokenOne.rawToken, key);
    await expect(
      service.claim(user, randomBytes(32).toString('base64url'), key),
    ).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
      statusCode: 409,
    });
    await expect(service.claim(user, tokenTwo.rawToken, key)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
      statusCode: 409,
    });
    const row = await pool.query<{ used_at: Date | null }>(
      'SELECT used_at FROM enrollment_tokens WHERE id = $1',
      [tokenTwo.id],
    );
    expect(row.rows[0]?.used_at).toBeNull();
  });

  test('database rejects a second active assignment for one recorder', async () => {
    const service = createEnrollmentService(pool);
    const assignment = await service.createAssignment(admin, {
      userId: user.userId,
      serial: `NP-${randomBytes(5).toString('hex')}-3355`,
      model: 'notepro',
    });
    await expect(
      pool.query(
        `INSERT INTO recorder_assignments(id, user_id, recorder_id, status)
         VALUES ($1, $2, $3, 'active')`,
        [randomUUID(), otherUser.userId, assignment.recorderId],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  test('replacement, explicit revocation, and expiry are uniformly unavailable', async () => {
    const service = createEnrollmentService(pool);
    const assignment = await service.createAssignment(admin, {
      userId: user.userId,
      serial: `NP-${randomBytes(5).toString('hex')}-4401`,
      model: 'notepro',
    });
    const oldToken = await service.issueToken(admin, assignment.id, 600);
    const replacement = await service.issueToken(admin, assignment.id, 600);
    await expect(service.resolve(user, oldToken.rawToken)).rejects.toBeInstanceOf(EnrollmentError);
    await service.revokeToken(admin, replacement.id);
    await expect(service.claim(user, replacement.rawToken, randomUUID())).rejects.toMatchObject({
      code: 'ENROLLMENT_UNAVAILABLE',
    });
    const expiring = await service.issueToken(admin, assignment.id, 600);
    await pool.query(
      `UPDATE enrollment_tokens
       SET created_at = clock_timestamp() - interval '2 seconds',
           expires_at = clock_timestamp() - interval '1 second'
       WHERE id = $1`,
      [expiring.id],
    );
    await expect(service.resolve(user, expiring.rawToken)).rejects.toMatchObject({
      code: 'ENROLLMENT_UNAVAILABLE',
    });
  });

  test('revoking a consumed token cancels its operation and blocks idempotent replay', async () => {
    const service = createEnrollmentService(pool);
    const assignment = await service.createAssignment(admin, {
      userId: user.userId,
      serial: `NP-${randomBytes(5).toString('hex')}-5501`,
      model: 'notepro',
    });
    const invitation = await service.issueToken(admin, assignment.id, 600);
    const key = randomUUID();
    const operation = await service.claim(user, invitation.rawToken, key);
    await service.revokeToken(admin, invitation.id);
    await expect(service.claim(user, invitation.rawToken, key)).rejects.toMatchObject({
      code: 'ENROLLMENT_UNAVAILABLE',
    });
    expect(await service.getOperation(user, operation.id)).toMatchObject({ status: 'revoked' });
  });

  test('ending an assignment revokes tokens and operations and permits explicit reassignment', async () => {
    const service = createEnrollmentService(pool);
    const serial = `NP-${randomBytes(5).toString('hex')}-6601`;
    const assignment = await service.createAssignment(admin, {
      userId: user.userId,
      serial,
      model: 'notepro',
    });
    const invitation = await service.issueToken(admin, assignment.id, 600);
    const operation = await service.claim(user, invitation.rawToken, randomUUID());
    expect(await service.endAssignment(admin, assignment.id, 'released')).toMatchObject({
      status: 'released',
    });
    expect(await service.endAssignment(admin, assignment.id, 'released')).toMatchObject({
      status: 'released',
    });
    expect(await service.getOperation(user, operation.id)).toMatchObject({ status: 'revoked' });
    await expect(service.endAssignment(admin, assignment.id, 'revoked')).rejects.toMatchObject({
      code: 'ASSIGNMENT_CONFLICT',
      statusCode: 409,
    });
    const reassigned = await service.createAssignment(admin, {
      userId: otherUser.userId,
      serial,
      model: 'notepro',
    });
    expect(reassigned.userId).toBe(otherUser.userId);
    await expect(service.resolve(user, invitation.rawToken)).rejects.toMatchObject({
      code: 'ENROLLMENT_UNAVAILABLE',
    });
  });

  test('admin authorization and missing admin resources are safe', async () => {
    const service = createEnrollmentService(pool);
    await expect(
      service.createAssignment(user, {
        userId: user.userId,
        serial: `NP-${randomBytes(5).toString('hex')}-7701`,
        model: 'notepro',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    await expect(service.issueToken(admin, randomUUID(), 600)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
    await expect(service.revokeToken(admin, randomUUID())).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
    await expect(service.issueToken(admin, randomUUID(), 59)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      statusCode: 400,
    });
  });

  test('every successful mutation writes a secret-free audit event', async () => {
    const rows = await pool.query<{ action: string; resource_id: string }>(
      'SELECT action, resource_id FROM audit_events',
    );
    expect(rows.rowCount).toBeGreaterThan(15);
    expect(rows.rows.map(({ action }) => action)).toEqual(
      expect.arrayContaining([
        'assignment.created',
        'token.issued',
        'token.revoked',
        'enrollment.claimed',
        'assignment.ended',
      ]),
    );
    const allAudit = JSON.stringify(rows.rows);
    const allTokens = await pool.query<{ token_hash: string }>(
      'SELECT token_hash FROM enrollment_tokens',
    );
    for (const { token_hash } of allTokens.rows) expect(allAudit).not.toContain(token_hash);
  });
});
