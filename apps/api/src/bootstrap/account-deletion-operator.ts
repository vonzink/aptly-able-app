/** Restricted operational command. Never runs vendor requests or erases service data itself. */
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { createDatabase } from '../infrastructure/database.js';
import { createAudioStorage } from '../modules/recordings/audio-storage.js';
import { createAccountDeletionService } from '../modules/account-deletion/service.js';
import { readConfig } from './config.js';
const [action, rawId, evidencePath] = process.argv.slice(2);
const requestId = action === 'queue' ? undefined : z.uuid().parse(rawId);
if (!['queue', 'inspect', 'confirm-external-erasure'].includes(action ?? ''))
  throw new Error(
    'Use queue, inspect REQUEST_UUID, or confirm-external-erasure REQUEST_UUID EVIDENCE_FILE.',
  );
const config = readConfig(process.env);
const database = createDatabase(config.databaseUrl);
try {
  if (!database.pool) throw new Error('Database configuration is required.');
  if (action === 'queue') {
    const result = await database.pool.query(
      `SELECT id,requested_at,expected_completion_at,clock_timestamp()>expected_completion_at AS overdue,service_erased_at IS NOT NULL AS service_erased,provider_evidence IS NOT NULL AS provider_confirmed,backup_evidence IS NOT NULL AS backups_confirmed,attempts,last_error FROM account_deletions WHERE completed_at IS NULL ORDER BY expected_completion_at NULLS FIRST,requested_at LIMIT 100`,
    );
    console.log(
      JSON.stringify(
        { pending: result.rows, note: 'First 100 pending requests; no data is modified.' },
        null,
        2,
      ),
    );
  } else if (action === 'inspect') {
    const result = await database.pool.query(
      'SELECT id, requested_at, expected_completion_at, service_erased_at, provider_scope, provider_evidence, backup_evidence, confirmed_by, confirmed_at, completed_at, attempts, next_attempt_at, last_error FROM account_deletions WHERE id=$1',
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
