import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { migrate } from '../src/infrastructure/migrate.js';
import { createEnrollmentService } from '../src/modules/enrollments/service.js';
import { createPlaudDeviceService } from '../src/modules/plaud-devices/service.js';
import type { PlaudDeviceProvider } from '../src/modules/plaud-devices/provider.js';

describe('Plaud device owned enrollment persistence', () => {
  const schema = `plaud_device_${randomBytes(10).toString('hex')}`;
  const admin = { userId: randomUUID(), role: 'admin' as const };
  const user = { userId: randomUUID(), role: 'user' as const };
  const other = { userId: randomUUID(), role: 'user' as const };
  let control: pg.Pool;
  let pool: pg.Pool;
  beforeAll(async () => {
    control = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL! });
    await control.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({
      connectionString: process.env.TEST_DATABASE_URL!,
      max: 8,
      options: `-c search_path=${schema}`,
    });
    await migrate(pool);
    await pool.query('INSERT INTO users(id) VALUES ($1), ($2), ($3)', [
      admin.userId,
      user.userId,
      other.userId,
    ]);
  });
  afterAll(async () => {
    await pool?.end();
    await control?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await control?.end();
  });
  async function fixture() {
    const enrollments = createEnrollmentService(pool);
    const recorder = {
      serial: `882${randomBytes(6).toString('hex')}0001`,
      model: 'notepins' as const,
    };
    const assignment = await enrollments.createAssignment(admin, {
      userId: user.userId,
      ...recorder,
    });
    const invitation = await enrollments.issueToken(admin, assignment.id, 600);
    const operation = await enrollments.claim(user, invitation.rawToken, randomUUID());
    const provider = {
      session: vi.fn(async () => ({
        userAccessToken: 'transient-token',
        expiresAt: '2026-09-11T13:00:00.000Z',
        customDomain: 'platform-us.plaud.ai' as const,
      })),
      bind: vi.fn(async () => {}),
      unbind: vi.fn(async () => {}),
    } satisfies PlaudDeviceProvider;
    return {
      enrollments,
      recorder,
      assignment,
      invitation,
      operation,
      provider,
      service: createPlaudDeviceService(pool, provider),
    };
  }
  test('session and binding derive the exact recorder and stable owner from an owned pending operation', async () => {
    const { service, provider, recorder, operation } = await fixture();
    expect(await service.session(user, operation.id)).toMatchObject({
      userId: user.userId,
      recorder,
      userAccessToken: 'transient-token',
    });
    expect(provider.session).toHaveBeenCalledWith(user.userId);
    expect(await service.bind(user, operation.id)).toEqual({ status: 'bound' });
    expect(provider.bind).toHaveBeenCalledWith(user.userId, recorder);
    await expect(service.session(other, operation.id)).rejects.toMatchObject({
      code: 'PLAUD_OPERATION_NOT_FOUND',
      statusCode: 404,
    });
    await expect(service.bind(admin, operation.id)).rejects.toMatchObject({
      code: 'PLAUD_OPERATION_NOT_FOUND',
    });
    await expect(service.unbind(other, operation.id)).rejects.toMatchObject({
      code: 'PLAUD_OPERATION_NOT_FOUND',
    });
    expect(provider.session).toHaveBeenCalledTimes(1);
    expect(provider.bind).toHaveBeenCalledTimes(1);
    expect(provider.unbind).not.toHaveBeenCalled();
  });
  test('revoked operation blocks sessions and binds but permits its original owner to unbind', async () => {
    const { service, provider, operation, invitation, enrollments, recorder } = await fixture();
    await enrollments.revokeToken(admin, invitation.id);
    await expect(service.session(user, operation.id)).rejects.toMatchObject({
      code: 'PLAUD_ENROLLMENT_INACTIVE',
    });
    await expect(service.bind(user, operation.id)).rejects.toMatchObject({
      code: 'PLAUD_ENROLLMENT_INACTIVE',
    });
    expect(await service.unbind(user, operation.id)).toEqual({ status: 'unbound' });
    expect(provider.unbind).toHaveBeenCalledWith(user.userId, recorder);
    expect(provider.session).not.toHaveBeenCalled();
    expect(provider.bind).not.toHaveBeenCalled();
  });
  test('ended assignment can be unbound until reassigned to another owner', async () => {
    const { service, provider, operation, assignment, enrollments, recorder } = await fixture();
    await enrollments.endAssignment(admin, assignment.id, 'released');
    await expect(service.session(user, operation.id)).rejects.toMatchObject({
      code: 'PLAUD_ENROLLMENT_INACTIVE',
    });
    await expect(service.bind(user, operation.id)).rejects.toMatchObject({
      code: 'PLAUD_ENROLLMENT_INACTIVE',
    });
    await service.unbind(user, operation.id);
    await enrollments.createAssignment(admin, { userId: other.userId, ...recorder });
    await expect(service.unbind(user, operation.id)).rejects.toMatchObject({
      code: 'PLAUD_RECORDER_REASSIGNED',
      statusCode: 409,
    });
    expect(provider.unbind).toHaveBeenCalledTimes(1);
  });
  test('bind holds the recorder lock until cloud completion, so revocation cannot overtake it', async () => {
    const { service, provider, operation, assignment, enrollments } = await fixture();
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    provider.bind.mockImplementationOnce(async () => {
      entered();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const binding = service.bind(user, operation.id);
    await started;
    let ended = false;
    const revoke = enrollments.endAssignment(admin, assignment.id, 'revoked').then(() => {
      ended = true;
    });
    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(ended).toBe(false);
    } finally {
      release();
    }
    await binding;
    await revoke;
    await expect(service.bind(user, operation.id)).rejects.toMatchObject({
      code: 'PLAUD_ENROLLMENT_INACTIVE',
    });
  });
  test('cloud unbind and reassignment cannot run against the same recorder at the same time', async () => {
    const { service, provider, operation, assignment, enrollments, recorder } = await fixture();
    await enrollments.endAssignment(admin, assignment.id, 'released');
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    provider.unbind.mockImplementationOnce(async () => {
      entered();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const unbinding = service.unbind(user, operation.id);
    await started;
    let assigned = false;
    const reassign = enrollments
      .createAssignment(admin, { userId: other.userId, ...recorder })
      .then(() => {
        assigned = true;
      });
    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(assigned).toBe(false);
    } finally {
      release();
    }
    await unbinding;
    await reassign;
    await expect(service.unbind(user, operation.id)).rejects.toMatchObject({
      code: 'PLAUD_RECORDER_REASSIGNED',
    });
    expect(provider.unbind).toHaveBeenCalledTimes(1);
  });
  test('records successful changes without persisting user tokens and sanitizes provider errors', async () => {
    const { service, provider, operation } = await fixture();
    await service.session(user, operation.id);
    await service.bind(user, operation.id);
    await service.unbind(user, operation.id);
    const audit = await pool.query('SELECT * FROM audit_events WHERE resource_id = $1', [
      operation.id,
    ]);
    expect(audit.rows.map((row: { action: string }) => row.action)).toEqual(
      expect.arrayContaining(['plaud.device_bound', 'plaud.device_unbound']),
    );
    expect(JSON.stringify(audit.rows)).not.toContain('transient-token');
    provider.bind.mockRejectedValueOnce(new Error('private-upstream-token'));
    await expect(service.bind(user, operation.id)).rejects.toMatchObject({
      code: 'PLAUD_PROVIDER_UNAVAILABLE',
    });
    const after = await pool.query('SELECT * FROM audit_events WHERE resource_id = $1', [
      operation.id,
    ]);
    expect(after.rowCount).toBe(audit.rowCount);
  });
  test('completes unpair for the assigned user and revokes all setup links without deleting history', async () => {
    const { service, provider, operation, assignment, enrollments } = await fixture();
    await service.unbind(user, operation.id);
    expect(
      (await pool.query('SELECT status FROM recorder_assignments WHERE id = $1', [assignment.id]))
        .rows[0].status,
    ).toBe('active');
    expect((await enrollments.getOperation(user, operation.id)).status).toBe('pending');
    expect(await service.completeUnpair(user, operation.id)).toEqual({ status: 'released' });
    expect(
      (
        await pool.query('SELECT status, ended_at FROM recorder_assignments WHERE id = $1', [
          assignment.id,
        ])
      ).rows[0],
    ).toMatchObject({ status: 'released', ended_at: expect.any(Date) });
    expect((await enrollments.getOperation(user, operation.id)).status).toBe('revoked');
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS remaining FROM enrollment_tokens WHERE assignment_id = $1 AND revoked_at IS NULL',
          [assignment.id],
        )
      ).rows[0].remaining,
    ).toBe(0);
    await expect(service.session(user, operation.id)).rejects.toMatchObject({
      code: 'PLAUD_ENROLLMENT_INACTIVE',
    });
    expect(provider.unbind).toHaveBeenCalledTimes(2);
  });

  test('retries completion safely after reassignment without unbinding the new owner', async () => {
    const { service, provider, operation, enrollments, recorder } = await fixture();
    await service.completeUnpair(user, operation.id);
    const next = await enrollments.createAssignment(admin, { userId: other.userId, ...recorder });
    expect(await service.completeUnpair(user, operation.id)).toEqual({ status: 'released' });
    expect(provider.unbind).toHaveBeenCalledTimes(1);
    expect(
      (await pool.query('SELECT status FROM recorder_assignments WHERE id = $1', [next.id])).rows[0]
        .status,
    ).toBe('active');
    await expect(service.completeUnpair(other, operation.id)).rejects.toMatchObject({
      code: 'PLAUD_OPERATION_NOT_FOUND',
    });
    await expect(service.completeUnpair(admin, operation.id)).rejects.toMatchObject({
      code: 'PLAUD_OPERATION_NOT_FOUND',
    });
  });

  test('keeps enrollment usable when final cloud release fails', async () => {
    const { service, provider, operation, assignment, enrollments } = await fixture();
    provider.unbind.mockRejectedValueOnce(new Error('Provider unavailable'));
    await expect(service.completeUnpair(user, operation.id)).rejects.toMatchObject({
      code: 'PLAUD_PROVIDER_UNAVAILABLE',
    });
    expect((await enrollments.getOperation(user, operation.id)).status).toBe('pending');
    expect(
      (await pool.query('SELECT status FROM recorder_assignments WHERE id = $1', [assignment.id]))
        .rows[0].status,
    ).toBe('active');
    expect(await service.completeUnpair(user, operation.id)).toEqual({ status: 'released' });
  });
});
