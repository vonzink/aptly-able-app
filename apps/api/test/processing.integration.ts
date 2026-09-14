import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import pg from 'pg';
import { beforeAll, afterAll, expect, test } from 'vitest';
import { migrate } from '../src/infrastructure/migrate.js';
import { createAudioStorage } from '../src/modules/recordings/audio-storage.js';
import { createProcessingService } from '../src/modules/recordings/service.js';
import { createTranscriptionWorker } from '../src/modules/transcription/worker.js';
import {
  ProviderError,
  type TranscriptionProvider,
} from '../src/modules/transcription/provider.js';
const schema = `processing_${randomBytes(8).toString('hex')}`;
const owner = randomUUID(),
  other = randomUUID();
let pool: pg.Pool, control: pg.Pool, root: string;
let service: ReturnType<typeof createProcessingService>;
let storage: ReturnType<typeof createAudioStorage>;
beforeAll(async () => {
  control = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  await control.query(`CREATE SCHEMA ${schema}`);
  pool = new pg.Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    options: `-c search_path=${schema}`,
  });
  await migrate(pool);
  await pool.query('INSERT INTO users(id) VALUES ($1),($2)', [owner, other]);
  root = await mkdtemp(join(tmpdir(), 'aptly-processing-'));
  storage = createAudioStorage(root);
  service = createProcessingService(pool, storage);
});
afterAll(async () => {
  await pool?.end();
  await control?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await control?.end();
  if (root) await rm(root, { recursive: true, force: true });
});
const input = () => ({
  id: randomUUID(),
  title: 'Actual uploaded file',
  fileName: 'call.mp3',
  sizeBytes: 5,
});
async function uploaded() {
  const value = input();
  await service.register(owner, value);
  await service.upload(owner, value.id, Readable.from([Buffer.from('hello')]));
  return value;
}
const transcript = {
  text: 'Hello.',
  segments: [{ startSeconds: 0, endSeconds: 1, text: 'Hello.' }],
  durationSeconds: 1,
  language: 'en',
};
const provider: TranscriptionProvider = {
  uploadAudio: async () => ({ downloadUrl: 'https://storage.example/audio' }),
  submit: async () => 'task-1',
  poll: async () => ({ status: 'complete', transcript }),
};
test('registration and verified upload are idempotent, owned and recoverable', async () => {
  const value = input();
  expect(await service.register(owner, value)).toMatchObject({ status: 'awaiting_upload' });
  expect(await service.register(owner, { ...value, title: 'Changed locally' })).toMatchObject({
    id: value.id,
  });
  await expect(service.register(owner, { ...value, sizeBytes: 6 })).rejects.toMatchObject({
    code: 'RECORDING_CONFLICT',
  });
  await expect(service.get(other, value.id)).rejects.toMatchObject({ code: 'RECORDING_NOT_FOUND' });
  await expect(
    service.upload(owner, value.id, Readable.from([Buffer.from('bad')])),
  ).rejects.toMatchObject({ code: 'INVALID_AUDIO' });
  expect((await service.get(owner, value.id)).status).toBe('awaiting_upload');
  await service.upload(owner, value.id, Readable.from([Buffer.from('hello')]));
  await service.upload(owner, value.id, Readable.from([Buffer.from('hello')]));
  await expect(
    service.upload(owner, value.id, Readable.from([Buffer.from('other')])),
  ).rejects.toMatchObject({ code: 'RECORDING_CONFLICT' });
  expect((await service.get(owner, value.id)).status).toBe('queued');
  // Isolate later worker assertions from this queued record.
  await pool.query("UPDATE processing_recordings SET status='failed' WHERE id=$1", [value.id]);
});
test('worker saves task identity before polling and persists normalized results', async () => {
  const value = await uploaded();
  let submissions = 0;
  const worker = createTranscriptionWorker({
    pool,
    storage,
    provider: {
      ...provider,
      submit: async () => {
        submissions++;
        return 'task-1';
      },
    },
    pollIntervalMs: 0,
  });
  await worker.tick();
  expect(await service.get(owner, value.id)).toMatchObject({ status: 'transcribing', attempt: 1 });
  await worker.tick();
  expect(await service.get(owner, value.id)).toMatchObject({ status: 'complete', transcript });
  expect(submissions).toBe(1);
  expect((await createProcessingService(pool, storage).get(owner, value.id)).transcript?.text).toBe(
    'Hello.',
  );
});
test('ambiguous submit and crash checkpoint never resubmit without explicit confirmation', async () => {
  const value = await uploaded();
  let submissions = 0;
  const worker = createTranscriptionWorker({
    pool,
    storage,
    provider: {
      ...provider,
      submit: async () => {
        submissions++;
        throw new ProviderError('SUBMIT_UNCERTAIN', true);
      },
    },
    pollIntervalMs: 0,
  });
  await worker.tick();
  expect((await service.get(owner, value.id)).status).toBe('submission_uncertain');
  await worker.tick();
  expect(submissions).toBe(1);
  await expect(service.retry(owner, value.id, false)).rejects.toMatchObject({
    code: 'RETRY_CONFIRMATION_REQUIRED',
  });
  await service.retry(owner, value.id, true);
  await pool.query("UPDATE processing_recordings SET status='submitting' WHERE id=$1", [value.id]);
  await worker.tick();
  expect((await service.get(owner, value.id)).status).toBe('submission_uncertain');
  expect(submissions).toBe(1);
});
test('polling failure retains task identity for manual retry; terminal failure can start new attempt', async () => {
  const value = await uploaded();
  const worker = createTranscriptionWorker({ pool, storage, provider, pollIntervalMs: 0 });
  await worker.tick();
  await pool.query('UPDATE processing_recordings SET poll_errors=9 WHERE id=$1', [value.id]);
  const failing = createTranscriptionWorker({
    pool,
    storage,
    provider: {
      ...provider,
      poll: async () => {
        throw new Error('network');
      },
    },
    pollIntervalMs: 0,
  });
  await failing.tick();
  expect(await service.get(owner, value.id)).toMatchObject({
    status: 'failed',
    errorCode: 'POLL_UNAVAILABLE',
  });
  await service.retry(owner, value.id, false);
  await worker.tick();
  expect((await service.get(owner, value.id)).status).toBe('complete');
});

test('HTTP streams authenticated audio, exposes capability and preserves ownership', async () => {
  const { buildApp } = await import('../src/transport/http/app.js');
  const { readConfig } = await import('../src/bootstrap/config.js');
  const token = 't'.repeat(40);
  const app = buildApp({
    config: readConfig({ DEV_SESSION_TOKEN: token, DEV_USER_ID: owner }),
    probeDatabase: async () => {},
    recordings: service,
    transcriptionAvailable: true,
  });
  try {
    const value = input();
    const headers = { authorization: `Bearer ${token}` };
    expect(
      (await app.inject({ method: 'GET', url: '/v1/transcription/capabilities' })).json(),
    ).toMatchObject({ available: true });
    expect(
      (await app.inject({ method: 'POST', url: '/v1/recordings', headers, payload: value }))
        .statusCode,
    ).toBe(201);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/v1/recordings/${value.id}/audio`,
          headers: { 'content-type': 'application/octet-stream' },
          payload: Buffer.from('hello'),
        })
      ).statusCode,
    ).toBe(401);
    const result = await app.inject({
      method: 'POST',
      url: `/v1/recordings/${value.id}/audio`,
      headers: { ...headers, 'content-type': 'application/octet-stream' },
      payload: Buffer.from('hello'),
    });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({ status: 'queued', attempt: 1 });
    expect(JSON.stringify(result.json())).not.toMatch(/audio_key|sha256|provider_task_id/);
    await pool.query("UPDATE processing_recordings SET status='failed' WHERE id=$1", [value.id]);
  } finally {
    await app.close();
  }
});

test('worker exclusion prevents simultaneous provider submissions and recovers interrupted upload', async () => {
  const value = await uploaded();
  await pool.query("UPDATE processing_recordings SET status='uploading' WHERE id=$1", [value.id]);
  let finishUpload!: (value: { downloadUrl: string }) => void;
  let entered!: () => void;
  const enteredPromise = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let submits = 0;
  const waiting = {
    ...provider,
    uploadAudio: async () => {
      entered();
      return new Promise<{ downloadUrl: string }>((resolve) => {
        finishUpload = resolve;
      });
    },
    submit: async () => {
      submits++;
      return 'single-task';
    },
  };
  const first = createTranscriptionWorker({ pool, storage, provider: waiting, pollIntervalMs: 0 });
  const second = createTranscriptionWorker({ pool, storage, provider: waiting, pollIntervalMs: 0 });
  const firstTick = first.tick();
  await enteredPromise;
  await second.tick();
  finishUpload({ downloadUrl: 'https://storage.example/audio' });
  await firstTick;
  expect(submits).toBe(1);
  expect((await service.get(owner, value.id)).status).toBe('transcribing');
  await createTranscriptionWorker({ pool, storage, provider, pollIntervalMs: 0 }).tick();
  expect((await service.get(owner, value.id)).status).toBe('complete');
});
