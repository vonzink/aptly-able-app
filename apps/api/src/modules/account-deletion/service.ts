import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  ACCOUNT_DELETION_MAX_DAYS,
  accountDeletionReceiptSchema,
  requestAccountDeletionSchema,
} from '@aptly/contracts';
import { verifyPassword } from '../identity/password.js';
import type { AudioStorage } from '../recordings/audio-storage.js';
export class AccountDeletionError extends Error {
  readonly statusCode = 401;
  readonly code = 'AUTH_FAILED';
  constructor() {
    super('A valid account session and password are required.');
  }
}
type Row = {
  id: string;
  user_id: string;
  requested_at: Date;
  expected_completion_at: Date | null;
  service_erased_at: Date | null;
  provider_evidence: string | null;
  backup_evidence: string | null;
  completed_at: Date | null;
};
function receipt(row: Row) {
  return accountDeletionReceiptSchema.parse({
    requestId: row.id,
    requestedAt: row.requested_at.toISOString(),
    expectedCompletionAt: row.expected_completion_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
    status: row.completed_at ? 'complete' : 'pending',
    pendingWork: [
      !row.service_erased_at && 'service_data',
      !row.provider_evidence && 'provider_erasure',
      !row.backup_evidence && 'backup_retention',
    ].filter(Boolean),
  });
}
function hash(authorization?: string) {
  const token = authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if (!token) throw new AccountDeletionError();
  return createHash('sha256').update(token).digest('hex');
}
export function createAccountDeletionService(pool: pg.Pool, storage: AudioStorage) {
  return {
    async status(authorization?: string) {
      const result = await pool.query<Row>(
        'SELECT * FROM account_deletions WHERE receipt_token_hash=$1',
        [hash(authorization)],
      );
      if (!result.rows[0]) throw new AccountDeletionError();
      return receipt(result.rows[0]);
    },
    async request(authorization: string | undefined, raw: unknown) {
      const input = requestAccountDeletionSchema.parse(raw);
      const tokenHash = hash(authorization);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const previous = await client.query<Row>(
          'SELECT * FROM account_deletions WHERE receipt_token_hash=$1',
          [tokenHash],
        );
        if (previous.rows[0]) {
          await client.query('COMMIT');
          return receipt(previous.rows[0]);
        }
        const session = await client.query<{ user_id: string }>(
          'SELECT user_id FROM pilot_sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp()',
          [tokenHash],
        );
        const userId = session.rows[0]?.user_id;
        if (!userId) throw new AccountDeletionError();
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,418))', [userId]);
        const existing = await client.query<Row>(
          'SELECT * FROM account_deletions WHERE user_id=$1 AND receipt_token_hash=$2',
          [userId, tokenHash],
        );
        if (existing.rows[0]) {
          await client.query('COMMIT');
          return receipt(existing.rows[0]);
        }
        const account = await client.query<{ password_hash: string }>(
          'SELECT password_hash FROM pilot_accounts WHERE user_id=$1 AND EXISTS (SELECT 1 FROM pilot_sessions WHERE token_hash=$2 AND revoked_at IS NULL AND expires_at>clock_timestamp())',
          [userId, tokenHash],
        );
        if (!(await verifyPassword(input.password, account.rows[0]?.password_hash)))
          throw new AccountDeletionError();
        const result = await client.query<Row>(
          `INSERT INTO account_deletions(id,user_id,receipt_token_hash,expected_completion_at,provider_scope) VALUES ($1,$2,$3,clock_timestamp()+make_interval(days=>$4),jsonb_build_object('userId',$2::uuid::text,'recordings',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'taskId',provider_task_id,'status',status)), '[]'::jsonb) FROM processing_recordings WHERE user_id=$2),'recorders',(SELECT coalesce(jsonb_agg(jsonb_build_object('serial',r.serial,'model',r.model)), '[]'::jsonb) FROM recorder_assignments a JOIN recorders r ON r.id=a.recorder_id WHERE a.user_id=$2))) RETURNING *`,
          [randomUUID(), userId, tokenHash, ACCOUNT_DELETION_MAX_DAYS],
        );
        await client.query(
          'UPDATE pilot_sessions SET revoked_at=clock_timestamp() WHERE user_id=$1',
          [userId],
        );
        await client.query('COMMIT');
        return receipt(result.rows[0]!);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    // Called only by the server worker. Files are removed before DB references: failures retry.
    async tick() {
      const client = await pool.connect();
      let requestId: string | undefined;
      try {
        await client.query('BEGIN');
        const row = (
          await client.query<Row>(
            'SELECT * FROM account_deletions WHERE completed_at IS NULL AND (service_erased_at IS NULL OR (provider_evidence IS NOT NULL AND backup_evidence IS NOT NULL)) AND next_attempt_at<=clock_timestamp() ORDER BY requested_at FOR UPDATE SKIP LOCKED LIMIT 1',
          )
        ).rows[0];
        if (!row) {
          await client.query('COMMIT');
          return;
        }
        requestId = row.id;
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,418))', [row.user_id]);
        if (!row.service_erased_at) {
          const audio = await client.query<{ audio_key: string }>(
            'SELECT audio_key FROM processing_recordings WHERE user_id=$1 AND audio_key IS NOT NULL UNION SELECT audio_key FROM account_audio_uploads WHERE user_id=$1',
            [row.user_id],
          );
          for (const file of audio.rows) await storage.remove(file.audio_key);
          await client.query(
            'DELETE FROM audit_events WHERE actor_id=$1 OR resource_id=$1 OR resource_id IN (SELECT id FROM recorder_assignments WHERE user_id=$1 UNION SELECT id FROM setup_operations WHERE user_id=$1 UNION SELECT id FROM processing_recordings WHERE user_id=$1 UNION SELECT id FROM enrollment_tokens WHERE assignment_id IN (SELECT id FROM recorder_assignments WHERE user_id=$1))',
            [row.user_id],
          );
          await client.query('DELETE FROM account_audio_uploads WHERE user_id=$1', [row.user_id]);
          await client.query('DELETE FROM processing_recordings WHERE user_id=$1', [row.user_id]);
          await client.query('DELETE FROM setup_operations WHERE user_id=$1', [row.user_id]);
          await client.query(
            'DELETE FROM enrollment_tokens WHERE assignment_id IN (SELECT id FROM recorder_assignments WHERE user_id=$1)',
            [row.user_id],
          );
          await client.query('DELETE FROM recorder_assignments WHERE user_id=$1', [row.user_id]);
          await client.query('DELETE FROM audit_events WHERE actor_id=$1 OR resource_id=$1', [
            row.user_id,
          ]);
          await client.query('DELETE FROM pilot_accounts WHERE user_id=$1', [row.user_id]);
          await client.query('DELETE FROM users WHERE id=$1', [row.user_id]);
          await client.query(
            'UPDATE account_deletions SET service_erased_at=clock_timestamp() WHERE id=$1',
            [row.id],
          );
        }
        await client.query(
          `UPDATE account_deletions SET attempts=attempts+1,last_error=NULL,next_attempt_at=clock_timestamp()+interval '1 minute',completed_at=CASE WHEN provider_evidence IS NOT NULL AND backup_evidence IS NOT NULL AND confirmed_by IS NOT NULL THEN clock_timestamp() ELSE NULL END,provider_scope=CASE WHEN provider_evidence IS NOT NULL THEN '{}'::jsonb ELSE provider_scope END WHERE id=$1`,
          [row.id],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        if (requestId)
          await client.query(
            "UPDATE account_deletions SET attempts=attempts+1,last_error='SERVICE_CLEANUP_FAILED',next_attempt_at=clock_timestamp()+interval '1 minute' WHERE id=$1",
            [requestId],
          );
        throw error;
      } finally {
        client.release();
      }
    },
    // Operational API, deliberately not exposed over HTTP. Evidence must describe confirmed scope.
    async confirmExternalErasure(
      requestId: string,
      input: { providerEvidence: string; backupEvidence: string; confirmedBy: string },
    ) {
      if (
        [input.providerEvidence, input.backupEvidence, input.confirmedBy].some(
          (value) => value.trim().length < 8,
        )
      )
        throw new Error('Recorded erasure evidence and operator identity are required.');
      const result = await pool.query(
        'UPDATE account_deletions SET provider_evidence=$2,backup_evidence=$3,confirmed_by=$4,confirmed_at=clock_timestamp(),next_attempt_at=clock_timestamp() WHERE id=$1 AND completed_at IS NULL AND provider_evidence IS NULL AND backup_evidence IS NULL AND confirmed_by IS NULL RETURNING id',
        [requestId, input.providerEvidence, input.backupEvidence, input.confirmedBy],
      );
      if (result.rowCount) return;
      // An interrupted operator command may be retried after the worker completed.
      // Preserve the original evidence and timestamp; conflicting attestations need review.
      const previous = await pool.query(
        'SELECT id FROM account_deletions WHERE id=$1 AND provider_evidence=$2 AND backup_evidence=$3 AND confirmed_by=$4',
        [requestId, input.providerEvidence, input.backupEvidence, input.confirmedBy],
      );
      if (!previous.rowCount)
        throw new Error(
          'Request not found or erasure evidence conflicts with the recorded confirmation.',
        );
    },
  };
}
export type AccountDeletionService = ReturnType<typeof createAccountDeletionService>;
