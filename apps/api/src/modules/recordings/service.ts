import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { Readable } from 'node:stream';
import { registerRecordingSchema, type RegisterRecordingInput } from '@aptly/contracts';
import type { AudioStorage } from './audio-storage.js';
import { RecordingError } from './errors.js';
import { ownedRecording, presentRecording } from './repository.js';

function processingService(pool: pg.Pool, storage: AudioStorage) {
  return {
    async register(userId: string, input: RegisterRecordingInput) {
      const value = registerRecordingSchema.parse(input);
      await pool.query(
        `INSERT INTO processing_recordings(id,user_id,title,file_name,file_type,size_bytes) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING`,
        [
          value.id,
          userId,
          value.title,
          value.fileName,
          value.fileName.split('.').at(-1)!.toLowerCase(),
          value.sizeBytes,
        ],
      );
      const row = await ownedRecording(pool, userId, value.id);
      if (row.file_name !== value.fileName || Number(row.size_bytes) !== value.sizeBytes)
        throw new RecordingError(
          409,
          'RECORDING_CONFLICT',
          'This recording was already registered with different audio details.',
        );
      return presentRecording(row);
    },
    async get(userId: string, id: string) {
      return presentRecording(await ownedRecording(pool, userId, id));
    },
    async upload(userId: string, id: string, source: Readable) {
      const initial = await ownedRecording(pool, userId, id);
      const reservedKey = `${randomUUID()}.audio`;
      await pool.query('INSERT INTO account_audio_uploads(audio_key,user_id) VALUES ($1,$2)', [
        reservedKey,
        userId,
      ]);
      const saved = await storage.save(source, Number(initial.size_bytes), reservedKey);
      let retained = false;
      let commitStarted = false;
      let client: pg.PoolClient | undefined;
      try {
        client = await pool.connect();
        await client.query('BEGIN');
        const row = await ownedRecording(client, userId, id, true);
        if (row.sha256) {
          if (row.sha256 !== saved.sha256)
            throw new RecordingError(
              409,
              'RECORDING_CONFLICT',
              'Different audio cannot replace this recording.',
            );
        } else {
          await client.query(
            `UPDATE processing_recordings SET audio_key=$2,sha256=$3,status='queued',attempt=1,attempt_started_at=clock_timestamp(),updated_at=clock_timestamp(),next_poll_at=clock_timestamp() WHERE id=$1`,
            [id, saved.key, saved.sha256],
          );
        }
        const result = presentRecording(await ownedRecording(client, userId, id));
        commitStarted = true;
        await client.query('COMMIT');
        retained = !row.sha256;
        return result;
      } catch (error) {
        await client?.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client?.release();
        if (!retained && !commitStarted) await storage.remove(saved.key);
        else if (!retained && commitStarted) {
          // Confirmed duplicate commits do not retain the redundant copy. Unknown commits may own it.
          const current = await ownedRecording(pool, userId, id).catch(() => undefined);
          if (current && current.audio_key !== saved.key) await storage.remove(saved.key);
        }
      }
    },
    async retry(userId: string, id: string, acknowledgeDuplicateRisk: boolean) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const row = await ownedRecording(client, userId, id, true);
        if (!['failed', 'submission_uncertain'].includes(row.status)) {
          await client.query('COMMIT');
          return presentRecording(row);
        }
        if (row.status === 'submission_uncertain' && !acknowledgeDuplicateRisk)
          throw new RecordingError(
            409,
            'RETRY_CONFIRMATION_REQUIRED',
            'The prior request may still be processing. Confirm before starting another.',
          );
        if (!row.audio_key)
          throw new RecordingError(
            409,
            'INVALID_AUDIO',
            'Upload the audio before requesting transcription.',
          );
        const resume =
          !!row.provider_task_id &&
          ['POLL_UNAVAILABLE', 'TRANSCRIPTION_TIMEOUT'].includes(row.error_code ?? '');
        await client.query(
          `UPDATE processing_recordings SET status=$2,provider_task_id=$3,error_code=NULL,poll_errors=0,attempt=attempt+$4,attempt_started_at=clock_timestamp(),next_poll_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1`,
          [
            id,
            resume ? 'transcribing' : 'queued',
            resume ? row.provider_task_id : null,
            resume ? 0 : 1,
          ],
        );
        const result = presentRecording(await ownedRecording(client, userId, id));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
export type ProcessingService = ReturnType<typeof createProcessingService>;

export function createProcessingService(
  pool: pg.Pool,
  storage: AudioStorage,
  uploadPool: pg.Pool = pool,
) {
  async function run<T>(
    userId: string,
    work: (service: ReturnType<typeof processingService>) => Promise<T>,
    connectionPool = pool,
  ): Promise<T> {
    const client = await connectionPool.connect();
    let locked = false;
    try {
      await client.query('SELECT pg_advisory_lock_shared(hashtextextended($1,418))', [userId]);
      locked = true;
      if (
        (await client.query('SELECT 1 FROM account_deletions WHERE user_id=$1', [userId])).rowCount
      )
        throw new RecordingError(401, 'UNAUTHORIZED', 'This account is unavailable.');
      // Reuse this connection for all inner transactions; no pool starvation during uploads.
      const scoped = {
        query: client.query.bind(client),
        connect: async () => ({ query: client.query.bind(client), release() {} }),
      } as unknown as pg.Pool;
      return await work(processingService(scoped, storage));
    } finally {
      try {
        if (locked)
          await client.query('SELECT pg_advisory_unlock_shared(hashtextextended($1,418))', [
            userId,
          ]);
      } finally {
        client.release();
      }
    }
  }
  return {
    register: (userId: string, input: RegisterRecordingInput) =>
      run(userId, (service) => service.register(userId, input)),
    get: (userId: string, id: string) => run(userId, (service) => service.get(userId, id)),
    upload: (userId: string, id: string, source: Readable) =>
      run(userId, (service) => service.upload(userId, id, source), uploadPool),
    retry: (userId: string, id: string, acknowledgeDuplicateRisk: boolean) =>
      run(userId, (service) => service.retry(userId, id, acknowledgeDuplicateRisk)),
  };
}
