import type pg from 'pg';
import type { AudioStorage } from '../recordings/audio-storage.js';
import type { RecordingRow } from '../recordings/repository.js';
import { ProviderError, type TranscriptionProvider } from './provider.js';

const WORKER_LOCK = 1907461340;
export function createTranscriptionWorker({
  pool,
  storage,
  provider,
  pollIntervalMs = 5000,
}: {
  pool: pg.Pool;
  storage: AudioStorage;
  provider: TranscriptionProvider;
  pollIntervalMs?: number;
}) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | undefined;
  let stopped = true;
  async function runTick() {
    const client = await pool.connect();
    let locked = false;
    let accountLocked: string | undefined;
    try {
      locked = (
        await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [
          WORKER_LOCK,
        ])
      ).rows[0]!.locked;
      if (!locked) return;
      const row = (
        await client.query<RecordingRow>(
          `SELECT * FROM processing_recordings WHERE NOT EXISTS (SELECT 1 FROM account_deletions d WHERE d.user_id=processing_recordings.user_id) AND status IN ('queued','uploading','submitting','transcribing') AND next_poll_at<=clock_timestamp() ORDER BY next_poll_at,created_at LIMIT 1`,
        )
      ).rows[0];
      if (!row) return;
      await client.query('SELECT pg_advisory_lock_shared(hashtextextended($1,418))', [row.user_id]);
      accountLocked = row.user_id;
      if (
        (await client.query('SELECT 1 FROM account_deletions WHERE user_id=$1', [row.user_id]))
          .rowCount
      )
        return;
      const fail = async (code: string, status = 'failed') => {
        await client.query(
          'UPDATE processing_recordings SET status=$2,error_code=$3,updated_at=clock_timestamp() WHERE id=$1',
          [row.id, status, code],
        );
      };
      if (row.status === 'submitting') {
        await fail('SUBMIT_UNCERTAIN', 'submission_uncertain');
        return;
      }
      if (row.status === 'queued' || row.status === 'uploading') {
        await client.query(
          "UPDATE processing_recordings SET status='uploading',updated_at=clock_timestamp() WHERE id=$1",
          [row.id],
        );
        let downloadUrl: string;
        try {
          if (!row.audio_key) throw new Error('Missing audio.');
          ({ downloadUrl } = await provider.uploadAudio({
            userId: row.user_id,
            path: storage.path(row.audio_key),
            fileType: row.file_type,
            sizeBytes: Number(row.size_bytes),
          }));
        } catch {
          await fail('UPLOAD_FAILED');
          return;
        }
        // This checkpoint precedes the non-idempotent provider POST. A crash here is ambiguous.
        await client.query(
          "UPDATE processing_recordings SET status='submitting',updated_at=clock_timestamp() WHERE id=$1",
          [row.id],
        );
        let taskId: string;
        try {
          taskId = await provider.submit(downloadUrl);
        } catch (error) {
          await fail(
            error instanceof ProviderError && !error.ambiguous
              ? 'SUBMIT_REJECTED'
              : 'SUBMIT_UNCERTAIN',
            error instanceof ProviderError && !error.ambiguous ? 'failed' : 'submission_uncertain',
          );
          return;
        }
        // A DB failure here deliberately leaves submitting; never repeat a possibly accepted POST.
        await client.query(
          "UPDATE processing_recordings SET status='transcribing',provider_task_id=$2,next_poll_at=clock_timestamp()+$3*interval '1 millisecond',updated_at=clock_timestamp() WHERE id=$1",
          [row.id, taskId, pollIntervalMs],
        );
        return;
      }
      if (!row.provider_task_id) {
        await fail('SUBMIT_UNCERTAIN', 'submission_uncertain');
        return;
      }
      if (
        row.attempt_started_at &&
        Date.now() - row.attempt_started_at.getTime() > 24 * 60 * 60 * 1000
      ) {
        await fail('TRANSCRIPTION_TIMEOUT');
        return;
      }
      let result: Awaited<ReturnType<TranscriptionProvider['poll']>>;
      try {
        result = await provider.poll(row.provider_task_id);
      } catch {
        const errors = row.poll_errors + 1;
        await client.query(
          `UPDATE processing_recordings SET poll_errors=$2,status=$3,error_code=$4,next_poll_at=clock_timestamp()+$5*interval '1 millisecond',updated_at=clock_timestamp() WHERE id=$1`,
          [
            row.id,
            errors,
            errors >= 10 ? 'failed' : 'transcribing',
            errors >= 10 ? 'POLL_UNAVAILABLE' : null,
            Math.min(60000, Math.max(pollIntervalMs, 1000) * 2 ** Math.min(errors, 6)),
          ],
        );
        return;
      }
      if (result.status === 'failed') {
        await fail('TRANSCRIPTION_FAILED');
        return;
      }
      if (result.status === 'complete') {
        await client.query(
          "UPDATE processing_recordings SET status='complete',transcript=$2::jsonb,error_code=NULL,poll_errors=0,updated_at=clock_timestamp() WHERE id=$1",
          [row.id, JSON.stringify(result.transcript)],
        );
        return;
      }
      await client.query(
        "UPDATE processing_recordings SET poll_errors=0,next_poll_at=clock_timestamp()+$2*interval '1 millisecond',updated_at=clock_timestamp() WHERE id=$1",
        [row.id, pollIntervalMs],
      );
    } finally {
      try {
        if (accountLocked)
          await client.query('SELECT pg_advisory_unlock_shared(hashtextextended($1,418))', [
            accountLocked,
          ]);
        if (locked) await client.query('SELECT pg_advisory_unlock($1)', [WORKER_LOCK]);
      } finally {
        client.release();
      }
    }
  }
  function tick() {
    if (!running)
      running = runTick().finally(() => {
        running = undefined;
      });
    return running;
  }
  async function loop() {
    try {
      await tick();
    } catch {
      /* Retry storage availability later without logging provider data. */
    } finally {
      if (!stopped) timer = setTimeout(() => void loop(), 1000);
    }
  }
  return {
    tick,
    start() {
      if (!stopped) return;
      stopped = false;
      void loop();
    },
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await running?.catch(() => undefined);
    },
  };
}
