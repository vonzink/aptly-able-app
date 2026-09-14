import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';

const migrationsDirectory = fileURLToPath(new URL('./migrations/', import.meta.url));

export async function migrate(pool: pg.Pool): Promise<void> {
  const files = (await readdir(migrationsDirectory))
    .filter((file) => /^\d+_[a-z0-9_]+\.sql$/.test(file))
    .sort();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [1_907_461_339]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
        applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
      )
    `);
    const applied = await client.query<{ version: string; checksum: string }>(
      'SELECT version, checksum FROM schema_migrations ORDER BY version',
    );
    const current = new Set(files);
    const missing = applied.rows.find(({ version }) => !current.has(version));
    if (missing) {
      throw new Error(
        `Applied migration ${missing.version} is absent from the migration directory.`,
      );
    }
    const maxApplied = applied.rows.at(-1)?.version;
    const outOfOrder =
      maxApplied &&
      files.find(
        (version) => version < maxApplied && !applied.rows.some((row) => row.version === version),
      );
    if (outOfOrder) {
      throw new Error(
        `Migration ${outOfOrder} was inserted before already applied migration ${maxApplied}.`,
      );
    }
    for (const version of files) {
      const sql = await readFile(new URL(`./migrations/${version}`, import.meta.url), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = applied.rows.find((row) => row.version === version);
      if (existing) {
        if (existing.checksum !== checksum) {
          throw new Error(
            `Migration checksum mismatch for ${version}. Applied migrations are immutable.`,
          );
        }
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(version, checksum) VALUES ($1, $2)', [
        version,
        checksum,
      ]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
