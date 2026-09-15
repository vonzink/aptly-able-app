/** Restricted operational command. Never runs vendor requests or erases service data itself. */
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { createDatabase } from '../infrastructure/database.js';
import { createAudioStorage } from '../modules/recordings/audio-storage.js';
import { createAccountDeletionService } from '../modules/account-deletion/service.js';
import { readConfig } from './config.js';
const [action, rawId, evidencePath] = process.argv.slice(2);
if (!['status', 'queue', 'inspect', 'confirm-external-erasure'].includes(action ?? ''))
  throw new Error(
    'Use status, queue, inspect REQUEST_UUID, or confirm-external-erasure REQUEST_UUID EVIDENCE_FILE.',
  );
const requestId = action === 'queue' || action === 'status' ? undefined : z.uuid().parse(rawId);
const config = readConfig(process.env);
const database = createDatabase(config.databaseUrl);
try {
  if (!database.pool) throw new Error('Database configuration is required.');
  if (action === 'status') {
    // One database snapshot covers the full queue, including work beyond queue's display limit.
    const result = await database.pool.query<{
      overdue: number;
      missing_deadline: number;
      service_failures: number;
    }>(
      `SELECT statement_timestamp() AS observed_at,
        (count(*) FILTER (WHERE completed_at IS NULL))::int AS pending,
        (count(*) FILTER (WHERE completed_at IS NULL AND expected_completion_at<statement_timestamp()))::int AS overdue,
        (count(*) FILTER (WHERE completed_at IS NULL AND expected_completion_at>=statement_timestamp() AND expected_completion_at<=statement_timestamp()+interval '24 hours'))::int AS due_within_24_hours,
        (count(*) FILTER (WHERE completed_at IS NULL AND expected_completion_at IS NULL))::int AS missing_deadline,
        (count(*) FILTER (WHERE completed_at IS NULL AND service_erased_at IS NULL))::int AS service_pending,
        (count(*) FILTER (WHERE completed_at IS NULL AND provider_evidence IS NULL))::int AS provider_pending,
        (count(*) FILTER (WHERE completed_at IS NULL AND backup_evidence IS NULL))::int AS backups_pending,
        (count(*) FILTER (WHERE completed_at IS NULL AND last_error IS NOT NULL))::int AS service_failures,
        (count(*) FILTER (WHERE completed_at IS NULL AND service_erased_at IS NOT NULL AND provider_evidence IS NOT NULL AND backup_evidence IS NOT NULL AND confirmed_by IS NOT NULL))::int AS ready_for_completion,
        (count(*) FILTER (WHERE completed_at>expected_completion_at))::int AS completed_late,
        min(requested_at) FILTER (WHERE completed_at IS NULL) AS oldest_requested_at,
        min(expected_completion_at) FILTER (WHERE completed_at IS NULL AND expected_completion_at>=statement_timestamp()) AS next_deadline_at,
        min(expected_completion_at) FILTER (WHERE completed_at IS NULL AND expected_completion_at<statement_timestamp()) AS oldest_overdue_deadline_at
       FROM account_deletions`,
    );
    const status = result.rows[0]!;
    const attentionRequired =
      status.overdue > 0 || status.missing_deadline > 0 || status.service_failures > 0;
    console.log(JSON.stringify({ ...status, attention_required: attentionRequired }, null, 2));
    // Distinguish an observed operational problem from CLI/configuration failure (exit 1).
    process.exitCode = attentionRequired ? 2 : 0;
  } else if (action === 'queue') {
    const result = await database.pool.query(
      `SELECT id,requested_at,expected_completion_at,clock_timestamp()>expected_completion_at AS overdue,service_erased_at IS NOT NULL AS service_erased,provider_evidence IS NOT NULL AS provider_confirmed,backup_evidence IS NOT NULL AS backups_confirmed,attempts,last_error FROM account_deletions WHERE completed_at IS NULL ORDER BY expected_completion_at NULLS FIRST,requested_at LIMIT 100`,
    );
    console.log(
      JSON.stringify(
        {
          pending: result.rows,
          note: 'First 100 pending requests; use status for full-backlog counts. No data is modified.',
        },
        null,
        2,
      ),
    );
  } else if (action === 'inspect') {
    const result = await database.pool.query(
      `SELECT id, requested_at, expected_completion_at, service_erased_at, provider_scope, provider_evidence, backup_evidence, confirmed_by, confirmed_at, completed_at, attempts, next_attempt_at, last_error,
        completed_at IS NULL AND statement_timestamp()>expected_completion_at AS overdue,
        array_remove(ARRAY[CASE WHEN service_erased_at IS NULL THEN 'service_data' END, CASE WHEN provider_evidence IS NULL THEN 'provider_erasure' END, CASE WHEN backup_evidence IS NULL THEN 'backup_retention' END],NULL) AS pending_work
       FROM account_deletions WHERE id=$1`,
      [requestId],
    );
    if (!result.rowCount) throw new Error('Request not found.');
    console.log(JSON.stringify(result.rows[0], null, 2));
  } else {
    if (!evidencePath) throw new Error('A JSON evidence file is required.');
    const evidence = z
      .object({
        providerEvidence: z.string().trim().min(8).max(10000),
        backupEvidence: z.string().trim().min(8).max(10000),
        confirmedBy: z.string().trim().min(8).max(200),
        allAccountDataConfirmed: z.literal(true),
      })
      .strict()
      .parse(JSON.parse(await readFile(evidencePath, 'utf8')));
    await createAccountDeletionService(
      database.pool,
      createAudioStorage(config.recordingsDirectory),
    ).confirmExternalErasure(requestId!, evidence);
    console.log(
      'Evidence recorded. The worker will evaluate completion; this command does not declare the request complete.',
    );
  }
} finally {
  await database.close();
}
