import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { migrate } from '../src/infrastructure/migrate.js';

const schema = `erasure_ops_${randomBytes(10).toString('hex')}`;
let pool: pg.Pool, control: pg.Pool, connectionString: string;
beforeAll(async () => {
  const databaseUrl = new URL(process.env.TEST_DATABASE_URL!);
  control = new pg.Pool({ connectionString: databaseUrl.href });
  await control.query(`CREATE SCHEMA ${schema}`);
  databaseUrl.searchParams.set('options', `-c search_path=${schema}`);
  connectionString = databaseUrl.href;
  pool = new pg.Pool({ connectionString });
  await migrate(pool);
});
beforeEach(async () => {
  await pool.query('TRUNCATE account_deletions');
});
afterAll(async () => {
  await pool?.end();
  await control?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await control?.end();
});

function runOperator(...args: string[]) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    execFile(
      process.execPath,
      [
        '--import',
        import.meta.resolve('tsx'),
        fileURLToPath(new URL('../src/bootstrap/account-deletion-operator.ts', import.meta.url)),
        ...args,
      ],
      {
        env: { PATH: process.env.PATH, NODE_ENV: 'test', DATABASE_URL: connectionString },
        timeout: 10000,
      },
      (error, stdout, stderr) =>
        resolve({
          code: typeof error?.code === 'number' ? error.code : error ? -1 : 0,
          stdout,
          stderr,
        }),
    );
  });
}

async function insertRequest(
  daysUntilDue: number | null,
  options: {
    serviceErased?: boolean;
    evidence?: boolean;
    failed?: boolean;
    complete?: boolean;
  } = {},
) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO account_deletions(id,user_id,receipt_token_hash,requested_at,expected_completion_at,service_erased_at,provider_evidence,backup_evidence,confirmed_by,completed_at,last_error,provider_scope)
     VALUES ($1,$2,'private-receipt-hash',clock_timestamp()-interval '8 days',clock_timestamp()+$3*interval '1 day',
       CASE WHEN $4 THEN clock_timestamp() END,CASE WHEN $5 THEN 'private-provider-evidence' END,
       CASE WHEN $5 THEN 'private-backup-evidence' END,CASE WHEN $5 THEN 'private-operator' END,
       CASE WHEN $6 THEN clock_timestamp() END,CASE WHEN $7 THEN 'SERVICE_CLEANUP_FAILED' END,
       '{"recorders":[{"serial":"private-serial"}]}'::jsonb)`,
    [
      id,
      randomUUID(),
      daysUntilDue,
      options.serviceErased ?? false,
      options.evidence ?? false,
      options.complete ?? false,
      options.failed ?? false,
    ],
  );
  return id;
}

test('status reports an empty queue successfully without exposing account details', async () => {
  const result = await runOperator('status');
  expect(result.stderr).toBe('');
  expect(result.code).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({
    pending: 0,
    overdue: 0,
    due_within_24_hours: 0,
    missing_deadline: 0,
    service_pending: 0,
    provider_pending: 0,
    backups_pending: 0,
    service_failures: 0,
    ready_for_completion: 0,
    completed_late: 0,
    attention_required: false,
    oldest_requested_at: null,
    next_deadline_at: null,
    oldest_overdue_deadline_at: null,
  });
});

test('status sees the whole backlog, flags overdue/failure/legacy work and never changes a deadline or completes erasure', async () => {
  for (let i = 0; i < 101; i++) await insertRequest(2);
  await insertRequest(-2, { failed: true });
  await insertRequest(-1, { serviceErased: true });
  await insertRequest(0.5, { serviceErased: true });
  await insertRequest(null);
  await insertRequest(2, { serviceErased: true, evidence: true });
  await insertRequest(-1, { serviceErased: true, evidence: true, complete: true });
  const before = (await pool.query('SELECT * FROM account_deletions ORDER BY id')).rows;
  const result = await runOperator('status');
  expect(result.stderr).toBe('');
  expect(result.code).toBe(2);
  const status = JSON.parse(result.stdout);
  expect(status).toMatchObject({
    pending: 106,
    overdue: 2,
    due_within_24_hours: 1,
    missing_deadline: 1,
    service_pending: 103,
    provider_pending: 105,
    backups_pending: 105,
    service_failures: 1,
    ready_for_completion: 1,
    completed_late: 1,
    attention_required: true,
  });
  expect(Date.parse(status.oldest_overdue_deadline_at)).toBeLessThan(
    Date.parse(status.observed_at),
  );
  expect(Date.parse(status.next_deadline_at)).toBeGreaterThan(Date.parse(status.observed_at));
  for (const secret of ['private-', 'user_id', 'receipt_token_hash', 'provider_scope'])
    expect(result.stdout).not.toContain(secret);
  expect((await pool.query('SELECT * FROM account_deletions ORDER BY id')).rows).toEqual(before);
  const queue = await runOperator('queue');
  expect(queue.code).toBe(0);
  expect(JSON.parse(queue.stdout).pending).toHaveLength(100);
});

test('due soon is visible before breach and missing external evidence remains pending', async () => {
  const id = await insertRequest(0.5, { serviceErased: true });
  const result = await runOperator('status');
  expect(result.code).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({
    pending: 1,
    overdue: 0,
    due_within_24_hours: 1,
    service_pending: 0,
    provider_pending: 1,
    backups_pending: 1,
    ready_for_completion: 0,
  });
  const inspect = await runOperator('inspect', id);
  expect(inspect.code).toBe(0);
  expect(JSON.parse(inspect.stdout)).toMatchObject({
    id,
    overdue: false,
    pending_work: ['provider_erasure', 'backup_retention'],
    completed_at: null,
  });
});

test.each([
  { label: 'overdue', due: -1, failed: false },
  { label: 'missing deadline', due: null, failed: false },
  { label: 'cleanup failure', due: 2, failed: true },
])(
  'status signals $label even when it is the only attention condition',
  async ({ due, failed }) => {
    await insertRequest(due, { failed });
    const result = await runOperator('status');
    expect(result.code).toBe(2);
    expect(JSON.parse(result.stdout).attention_required).toBe(true);
  },
);

test('a completed late request remains visible as history without becoming pending again', async () => {
  await insertRequest(-1, { serviceErased: true, evidence: true, complete: true });
  const result = await runOperator('status');
  expect(result.code).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ pending: 0, overdue: 0, completed_late: 1 });
});

test('inspect identifies overdue work, keeps legacy deadlines unknown and errors on another nonexistent request', async () => {
  const overdue = await insertRequest(-1);
  const legacy = await insertRequest(null);
  expect(JSON.parse((await runOperator('inspect', overdue)).stdout)).toMatchObject({
    id: overdue,
    overdue: true,
    pending_work: ['service_data', 'provider_erasure', 'backup_retention'],
  });
  expect(JSON.parse((await runOperator('inspect', legacy)).stdout)).toMatchObject({
    id: legacy,
    overdue: null,
  });
  expect((await runOperator('inspect', randomUUID())).code).toBe(1);
});
