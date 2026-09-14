import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createDatabase } from '../src/infrastructure/database.js';
import { migrate } from '../src/infrastructure/migrate.js';
import { createEnrollmentService } from '../src/modules/enrollments/service.js';
import { createPlaudDeviceService } from '../src/modules/plaud-devices/service.js';

describe('database capacity during slow external work', () => {
  const schema = `capacity_${randomBytes(10).toString('hex')}`;
  const actor = { userId: randomUUID(), role: 'user' as const, selfService: true };
  const operationIds: string[] = [];
  let control: pg.Pool;
  let database: ReturnType<typeof createDatabase>;

  beforeAll(async () => {
    control = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL! });
    await control.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.searchParams.set('options', `-c search_path=${schema}`);
    database = createDatabase(url.toString());
    await migrate(database.pool!);
    await database.pool!.query('INSERT INTO users(id) VALUES ($1)', [actor.userId]);
    const enrollments = createEnrollmentService(database.pool!);
    for (let index = 0; index < 2; index++) {
      const assignment = await enrollments.createAssignment(actor, {
        userId: actor.userId,
        serial: `CAP${randomBytes(6).toString('hex')}0001`,
        model: 'notepins',
      });
      const token = await enrollments.issueToken(actor, assignment.id, 600);
      operationIds.push((await enrollments.claim(actor, token.rawToken, randomUUID())).id);
    }
  });

  afterAll(async () => {
    await database?.close();
    await control?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await control?.end();
  });

  test.each([
    { sessions: 2, worker: false },
    { sessions: 1, worker: true },
  ])(
    'ordinary requests remain available with $sessions held session(s), worker=$worker',
    async ({ sessions, worker }) => {
      const release = Promise.withResolvers<void>();
      const started = Promise.withResolvers<void>();
      let entered = 0;
      const devicePool = database.devicePool ?? database.pool!;
      const service = createPlaudDeviceService(devicePool, {
        async session() {
          if (++entered === sessions) started.resolve();
          await release.promise;
          return {
            userAccessToken: 'test-only-token',
            expiresAt: '2026-10-01T00:00:00.000Z',
            customDomain: 'platform-us.plaud.ai',
          };
        },
        async bind() {},
        async unbind() {},
      });
      const workerClient = worker
        ? await (database.workerPool ?? database.pool!).connect()
        : undefined;
      const pending = operationIds.slice(0, sessions).map((id) => service.session(actor, id));
      const completed = Promise.all(pending);
      // Observe startup errors immediately, including fixture errors before the provider.
      void completed.catch(started.reject);
      try {
        await started.promise;
        await expect(database.probe()).resolves.toBeUndefined();
        const result = await database.pool!.query('SELECT id FROM users WHERE id = $1', [
          actor.userId,
        ]);
        expect(result.rows).toEqual([{ id: actor.userId }]);
      } finally {
        release.resolve();
        workerClient?.release();
        await completed;
      }
    },
  );
});
