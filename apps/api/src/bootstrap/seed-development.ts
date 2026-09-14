import pg from 'pg';
import { readConfig } from './config.js';

async function run() {
  const config = readConfig(process.env);
  if (config.environment === 'production') throw new Error('Development seed is disabled.');
  if (!config.databaseUrl || !config.developmentIdentity || !config.developmentAdminIdentity) {
    throw new Error('Development seed configuration is incomplete.');
  }

  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: 1,
    connectionTimeoutMillis: 3_000,
    statement_timeout: 5_000,
  });
  pool.on('error', () => undefined);
  try {
    await pool.query(
      'INSERT INTO users(id, display_name) VALUES ($1, $2), ($3, $4) ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name',
      [
        config.developmentIdentity.userId,
        config.developmentUserDisplayName,
        config.developmentAdminIdentity.userId,
        config.developmentAdminDisplayName,
      ],
    );
  } finally {
    await pool.end();
  }
}

run().catch(() => {
  console.error(
    'Development seed failed. Check local configuration and migrate the database first.',
  );
  process.exitCode = 1;
});
