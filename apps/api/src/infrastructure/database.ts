import pg from 'pg';
export function createDatabase(connectionString: string | undefined) {
  function createPool(max: number) {
    const pool = connectionString
      ? new pg.Pool({
          connectionString,
          max,
          connectionTimeoutMillis: 3_000,
          statement_timeout: 3_000,
          query_timeout: 4_000,
        })
      : undefined;
    // Never dump the driver error: it can contain connection details.
    pool?.on('error', () => undefined);
    return pool;
  }
  // Vendor operations hold ownership locks during network work. Give those
  // operations separate, bounded capacity so they cannot consume the connections
  // used by authentication, ordinary reads, and readiness. Pools open lazily.
  const pool = createPool(2);
  const devicePool = createPool(2);
  const workerPool = createPool(1);
  const uploadPool = createPool(2);
  const deletionPool = createPool(1);
  return {
    pool,
    devicePool,
    workerPool,
    uploadPool,
    deletionPool,
    async probe() {
      if (!pool) throw new Error('Database is not configured.');
      await pool.query('SELECT 1');
    },
    async close() {
      await Promise.all([
        pool?.end(),
        devicePool?.end(),
        workerPool?.end(),
        uploadPool?.end(),
        deletionPool?.end(),
      ]);
    },
  };
}
