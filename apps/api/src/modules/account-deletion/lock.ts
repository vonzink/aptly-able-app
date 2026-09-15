import type pg from 'pg';
export async function lockActiveAccount(client: pg.PoolClient, userId: string) {
  await client.query('SELECT pg_advisory_xact_lock_shared(hashtextextended($1,418))', [userId]);
  const result = await client.query('SELECT 1 FROM account_deletions WHERE user_id=$1', [userId]);
  if (result.rowCount) throw new Error('Account is unavailable.');
}
