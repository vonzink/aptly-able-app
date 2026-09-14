import pg from 'pg';
import { migrate } from '../infrastructure/migrate.js';
import { readConfig } from './config.js';

async function run() {
  const connectionString = readConfig(process.env).databaseUrl;
  if (!connectionString) throw new Error('Database is not configured.');

  const pool = new pg.Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 3_000,
    statement_timeout: 15_000,
  });
  pool.on('error', () => undefined);
  try {
    await migrate(pool);
  } finally {
    await pool.end();
  }
}

run().catch(() => {
  console.error('Database migration failed. Check the configured database and migration history.');
  process.exitCode = 1;
});
