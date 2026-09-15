import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import pg from 'pg';
import { beforeAll, afterAll, test, expect, vi } from 'vitest';
import { migrate } from '../src/infrastructure/migrate.js';
import { createPilotIdentity } from '../src/modules/identity/pilot-identity.js';
import { createAccountDeletionService } from '../src/modules/account-deletion/service.js';
import { createAudioStorage } from '../src/modules/recordings/audio-storage.js';
import { createProcessingService } from '../src/modules/recordings/service.js';
import { createTranscriptionWorker } from '../src/modules/transcription/worker.js';
import { createEnrollmentService } from '../src/modules/enrollments/service.js';
import { createPlaudDeviceService } from '../src/modules/plaud-devices/service.js';
const schema = `erasure_${randomBytes(10).toString('hex')}`;
let pool: pg.Pool, control: pg.Pool, directory: string;
const password = 'long-password-123';
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'aptly-erasure-'));
  control = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  await control.query(`CREATE SCHEMA ${schema}`);
  pool = new pg.Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    options: `-c search_path=${schema}`,
    max: 10,
  });
  await migrate(pool);
});
afterAll(async () => {
  await pool?.end();
  await control?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await control?.end();
  await rm(directory, { recursive: true, force: true });
});
async function fixture() {
  const identity = createPilotIdentity(pool);
  const email = `${randomUUID()}@example.com`;
  const account = await identity.register({ email, password, displayName: 'Delete test' });
  const authorization = `Bearer ${account.credential}`;
  const userId = account.session.user.id;
  const storage = createAudioStorage(directory);
  const deletion = createAccountDeletionService(pool, storage);
  const recordings = createProcessingService(pool, storage);
  return { identity, email, account, authorization, userId, storage, deletion, recordings };
}
const input = { password, confirmation: 'DELETE' as const };
test('password reauth, response loss retry, session lockout, pending evidence, completion and isolation', async () => {
  const a = await fixture(),
    b = await fixture();
  await expect(a.deletion.request(undefined, input)).rejects.toMatchObject({ statusCode: 401 });
  await expect(
    a.deletion.request(a.authorization, { ...input, password: 'wrong' }),
  ).rejects.toMatchObject({ statusCode: 401 });
  expect(await a.identity.verify(a.authorization)).toBeDefined();
  const otherRecordingId = randomUUID();
  await b.recordings.register(b.userId, {
    id: otherRecordingId,
    title: 'Keep other account',
    fileName: 'keep.wav',
    sizeBytes: 3,
  });
  const [receipt, simultaneous] = await Promise.all([
    a.deletion.request(a.authorization, input),
    a.deletion.request(a.authorization, input),
  ]);
  expect(simultaneous.requestId).toBe(receipt.requestId);
  expect(receipt.completedAt).toBeNull();
  expect(
    Math.abs(
      Date.parse(receipt.expectedCompletionAt!) - Date.parse(receipt.requestedAt) - 7 * 86400000,
    ),
  ).toBeLessThan(1000);
  expect(simultaneous.expectedCompletionAt).toBe(receipt.expectedCompletionAt);
  expect(receipt.pendingWork).toEqual(['service_data', 'provider_erasure', 'backup_retention']);
  expect(await a.identity.verify(a.authorization)).toBeUndefined();
  await expect(a.identity.login({ email: a.email, password })).rejects.toMatchObject({
    code: 'AUTH_FAILED',
  });
  expect(await a.deletion.request(a.authorization, input)).toEqual(receipt);
  expect(await a.identity.verify(b.authorization)).toBeDefined();
  expect(await b.recordings.get(b.userId, otherRecordingId)).toBeDefined();
  await expect(a.deletion.status(b.authorization)).rejects.toMatchObject({ statusCode: 401 });
  await a.deletion.tick();
  expect(await b.recordings.get(b.userId, otherRecordingId)).toBeDefined();
  expect((await a.deletion.status(a.authorization)).pendingWork).toEqual([
    'provider_erasure',
    'backup_retention',
  ]);
  expect((await pool.query('SELECT 1 FROM users WHERE id=$1', [a.userId])).rowCount).toBe(0);
  expect(await a.deletion.request(a.authorization, input)).toMatchObject({
    requestId: receipt.requestId,
    status: 'pending',
  });
  await expect(
    a.deletion.confirmExternalErasure(receipt.requestId, {
      providerEvidence: '',
      backupEvidence: '',
      confirmedBy: '',
    }),
  ).rejects.toThrow();
  await a.deletion.confirmExternalErasure(receipt.requestId, {
    providerEvidence:
      'Vendor ticket TEST confirms all account data erased including ambiguous uploads.',
    backupEvidence: 'Backup inventory TEST confirms expiry on all backup sets.',
    confirmedBy: 'test-operator',
  });
  await a.deletion.tick();
  expect((await a.deletion.status(a.authorization)).completedAt).toBeTruthy();
  expect((await a.deletion.status(a.authorization)).expectedCompletionAt).toBe(
    receipt.expectedCompletionAt,
  );
  expect(await a.deletion.status(a.authorization)).toMatchObject({
    status: 'complete',
    pendingWork: [],
  });
  expect(
    (
      await pool.query('SELECT provider_scope FROM account_deletions WHERE id=$1', [
        receipt.requestId,
      ])
    ).rows[0].provider_scope,
  ).toEqual({});
});
test('failed file removal preserves references and retries; no worker submissions after request', async () => {
  const a = await fixture();
  const id = randomUUID();
  await a.recordings.register(a.userId, { id, title: 'Audio', fileName: 'test.wav', sizeBytes: 3 });
  await a.recordings.upload(a.userId, id, Readable.from(Buffer.from('abc')));
  const receipt = await a.deletion.request(a.authorization, input);
  const remove = vi
    .fn()
    .mockRejectedValueOnce(new Error('disk unavailable'))
    .mockImplementation(a.storage.remove);
  const deletion = createAccountDeletionService(pool, { ...a.storage, remove });
  await expect(deletion.tick()).rejects.toThrow('disk unavailable');
  expect(
    (await pool.query('SELECT audio_key FROM processing_recordings WHERE id=$1', [id])).rows[0]
      .audio_key,
  ).toBeTruthy();
  const provider = { uploadAudio: vi.fn(), submit: vi.fn(), poll: vi.fn() };
  await createTranscriptionWorker({ pool, storage: a.storage, provider }).tick();
  expect(provider.uploadAudio).not.toHaveBeenCalled();
  await pool.query('UPDATE account_deletions SET next_attempt_at=clock_timestamp() WHERE id=$1', [
    receipt.requestId,
  ]);
  await deletion.tick();
  expect(remove).toHaveBeenCalledTimes(2);
  expect((await pool.query('SELECT 1 FROM processing_recordings WHERE id=$1', [id])).rowCount).toBe(
    0,
  );
  expect((await deletion.status(a.authorization)).status).toBe('pending');
});
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
test('request waits for in-flight upload and blocks future writes', async () => {
  const a = await fixture();
  const started = gate(),
    finish = gate();
  const id = randomUUID();
  const recordings = createProcessingService(pool, {
    ...a.storage,
    save: async (source, size, key) => {
      started.release();
      await finish.promise;
      return a.storage.save(source, size, key);
    },
  });
  await recordings.register(a.userId, { id, title: 'Upload', fileName: 'test.wav', sizeBytes: 3 });
  const upload = recordings.upload(a.userId, id, Readable.from(Buffer.from('abc')));
  await started.promise;
  let accepted = false;
  const deleting = a.deletion.request(a.authorization, input).then((value) => {
    accepted = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(accepted).toBe(false);
  finish.release();
  await upload;
  await deleting;
  await expect(
    recordings.register(a.userId, {
      id: randomUUID(),
      title: 'Late',
      fileName: 'test.wav',
      sizeBytes: 3,
    }),
  ).rejects.toMatchObject({ statusCode: 401 });
  await a.deletion.tick();
});
test('request waits for vendor binding and late binds cannot reach provider', async () => {
  const a = await fixture();
  const admin = { userId: randomUUID(), role: 'admin' as const };
  await pool.query('INSERT INTO users(id) VALUES ($1)', [admin.userId]);
  const actor = { userId: a.userId, role: 'user' as const, selfService: true };
  const enrollments = createEnrollmentService(pool);
  const assignment = await enrollments.createAssignment(admin, {
    userId: a.userId,
    serial: `882${randomBytes(6).toString('hex')}0001`,
    model: 'notepins',
  });
  const token = await enrollments.issueToken(admin, assignment.id, 600);
  const operation = await enrollments.claim(actor, token.rawToken, randomUUID());
  const started = gate(),
    finish = gate();
  const provider = {
    session: vi.fn(),
    bind: vi.fn(async () => {
      started.release();
      await finish.promise;
    }),
    unbind: vi.fn(),
  };
  const devices = createPlaudDeviceService(pool, provider);
  const binding = devices.bind(actor, operation.id);
  await started.promise;
  let accepted = false;
  const deleting = a.deletion.request(a.authorization, input).then((value) => {
    accepted = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(accepted).toBe(false);
  finish.release();
  await binding;
  const receipt = await deleting;
  await expect(devices.bind(actor, operation.id)).rejects.toThrow('Account is unavailable');
  expect(provider.bind).toHaveBeenCalledTimes(1);
  const scope = (
    await pool.query('SELECT provider_scope FROM account_deletions WHERE id=$1', [
      receipt.requestId,
    ])
  ).rows[0].provider_scope;
  expect(scope.recorders).toHaveLength(1);
  await a.deletion.tick();
});
test('crash-left upload reservation removes temporary bytes before declaring service erasure', async () => {
  const a = await fixture();
  const key = `${randomUUID()}.audio`;
  await pool.query('INSERT INTO account_audio_uploads(audio_key,user_id) VALUES ($1,$2)', [
    key,
    a.userId,
  ]);
  const { writeFile, access } = await import('node:fs/promises');
  await writeFile(a.storage.path(key) + '.pending', 'partial private audio');
  await a.deletion.request(a.authorization, input);
  await a.deletion.tick();
  await expect(access(a.storage.path(key) + '.pending')).rejects.toThrow();
  expect(
    (await pool.query('SELECT 1 FROM account_audio_uploads WHERE user_id=$1', [a.userId])).rowCount,
  ).toBe(0);
});
test('in-flight provider failure is captured before deletion and no resubmission follows', async () => {
  const a = await fixture();
  const id = randomUUID();
  await a.recordings.register(a.userId, {
    id,
    title: 'Provider',
    fileName: 'test.wav',
    sizeBytes: 3,
  });
  await a.recordings.upload(a.userId, id, Readable.from(Buffer.from('abc')));
  const started = gate(),
    finish = gate();
  const provider = {
    uploadAudio: vi.fn(async () => {
      started.release();
      await finish.promise;
      throw new Error('uncertain provider upload');
    }),
    submit: vi.fn(),
    poll: vi.fn(),
  };
  const worker = createTranscriptionWorker({ pool, storage: a.storage, provider });
  const tick = worker.tick();
  await started.promise;
  let accepted = false;
  const deleting = a.deletion.request(a.authorization, input).then((value) => {
    accepted = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(accepted).toBe(false);
  finish.release();
  await tick;
  const receipt = await deleting;
  await worker.tick();
  expect(provider.uploadAudio).toHaveBeenCalledTimes(1);
  expect(provider.submit).not.toHaveBeenCalled();
  const scope = (
    await pool.query('SELECT provider_scope FROM account_deletions WHERE id=$1', [
      receipt.requestId,
    ])
  ).rows[0].provider_scope;
  expect(scope.recordings).toEqual([{ id, taskId: null, status: 'failed' }]);
  await a.deletion.tick();
  expect((await a.deletion.status(a.authorization)).pendingWork).toContain('provider_erasure');
});
