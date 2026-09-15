import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, URL, URLSearchParams } from 'node:url';
import process from 'node:process';
import { log, error } from 'node:console';
import pg from 'pg';
const { fetch, AbortSignal } = globalThis;

async function smoke() {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
  const destination = new URL(databaseUrl);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(destination.hostname)) {
    throw new Error('Runtime smoke requires a local test database.');
  }
  const control = new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 3000 });
  control.on('error', () => undefined);
  const schema = `smoke_${randomBytes(12).toString('hex')}`;
  const userId = randomUUID();
  const adminId = randomUUID();
  const userCredential = randomBytes(32).toString('base64url');
  const adminCredential = randomBytes(32).toString('base64url');
  const portProbe = createServer();
  portProbe.listen(0, '127.0.0.1');
  await once(portProbe, 'listening');
  const port = portProbe.address().port;
  await new Promise((resolve, reject) =>
    portProbe.close((failure) => (failure ? reject(failure) : resolve())),
  );
  destination.searchParams.set('options', `-c search_path=${schema}`);
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: String(port),
    DATABASE_URL: destination.toString(),
    DEV_USER_ID: userId,
    DEV_SESSION_TOKEN: userCredential,
    DEV_ADMIN_USER_ID: adminId,
    DEV_ADMIN_SESSION_TOKEN: adminCredential,
    ENROLLMENT_BASE_URL: 'https://enroll.example.test/setup',
  };
  let server;
  let output = '';
  let rawToken;
  const launch = (filename) => {
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL(`../dist/bootstrap/${filename}`, import.meta.url))],
      {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    return child;
  };
  const command = async (filename) => {
    const child = launch(filename);
    try {
      const [code] = await once(child, 'exit', { signal: AbortSignal.timeout(20000) });
      assert.equal(code, 0, `${filename} failed`);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }
  };
  const url = `http://127.0.0.1:${port}`;
  const request = async (path, credential, body) => {
    const response = await fetch(`${url}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(5000),
    });
    return {
      status: response.status,
      value: response.status === 204 ? undefined : await response.json(),
    };
  };
  try {
    await control.query(`CREATE SCHEMA ${schema}`);
    await command('migrate.js');
    await command('migrate.js');
    await command('seed-development.js');
    await command('seed-development.js');
    server = launch('server.js');
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      if (server.exitCode !== null) throw new Error('Compiled API exited before readiness.');
      try {
        ready =
          (await fetch(`${url}/health/ready`, { signal: AbortSignal.timeout(500) })).status === 200;
      } catch {
        /* Server may still be starting. */
      }
      if (ready) break;
      await delay(100);
    }
    assert.ok(ready, 'compiled API readiness');
    assert.equal((await request('/v1/session', adminCredential)).value.user.role, 'admin');
    assert.equal((await request('/v1/session', userCredential)).value.user.role, 'user');
    assert.equal((await request('/v1/admin/users', userCredential)).status, 403);
    const people = await request('/v1/admin/users?page=1', adminCredential);
    assert.equal(people.status, 200);
    assert.ok(people.value.users.some((user) => user.id === userId && user.displayName));
    assert.equal(people.value.hasMore, false);
    assert.equal((await request('/v1/admin/recorder-assignments', userCredential, {})).status, 403);
    const assigned = await request('/v1/admin/recorder-assignments', adminCredential, {
      userId,
      serial: '881-SMOKE-0004812',
      model: 'notepro',
    });
    assert.equal(assigned.status, 201);
    const assignmentId = assigned.value.id;
    const detail = await request(`/v1/admin/recorder-assignments/${assignmentId}`, adminCredential);
    assert.equal(detail.value.recorder.serialSuffix, '4812');
    assert.equal(detail.value.latestInvitation, null);
    const list = await request('/v1/admin/recorder-assignments?page=1', adminCredential);
    assert.equal(list.value.assignments[0].id, assignmentId);
    assert.ok(!JSON.stringify(list.value).includes('881-SMOKE-0004812'));
    const issued = await request(
      `/v1/admin/recorder-assignments/${assignmentId}/enrollment-tokens`,
      adminCredential,
      {},
    );
    assert.equal(issued.status, 201);
    assert.ok(issued.value.qrSvg.startsWith('<svg'));
    rawToken = new URLSearchParams(new URL(issued.value.enrollmentUrl).hash.slice(1)).get('token');
    assert.match(rawToken, /^[A-Za-z0-9_-]{43}$/);
    const resolved = await request('/v1/enrollments/resolve', userCredential, { token: rawToken });
    assert.equal(resolved.status, 200);
    assert.equal(resolved.value.recorder.serialSuffix, '4812');
    assert.equal(
      (await request('/v1/enrollments/resolve', adminCredential, { token: rawToken })).status,
      404,
    );
    const body = { token: rawToken, idempotencyKey: randomUUID() };
    const claims = await Promise.all([
      request('/v1/enrollments/claim', userCredential, body),
      request('/v1/enrollments/claim', userCredential, body),
    ]);
    assert.ok(claims.every((response) => response.status === 200));
    assert.equal(claims[0].value.id, claims[1].value.id);
    assert.equal(claims[0].value.status, 'pending');
    const recovered = await request(
      `/v1/enrollments/claims/${body.idempotencyKey}`,
      userCredential,
    );
    assert.equal(recovered.status, 200);
    assert.equal(recovered.value.id, claims[0].value.id);
    assert.equal(
      (await request(`/v1/enrollments/claims/${body.idempotencyKey}`, adminCredential)).status,
      404,
    );
    assert.equal(
      (await request(`/v1/enrollments/operations/${claims[0].value.id}`, userCredential)).status,
      200,
    );
    assert.equal(
      (await request(`/v1/admin/enrollment-tokens/${issued.value.id}/revoke`, adminCredential, {}))
        .status,
      204,
    );
    assert.equal((await request('/v1/enrollments/claim', userCredential, body)).status, 404);
    assert.equal(
      (await request(`/v1/enrollments/claims/${body.idempotencyKey}`, userCredential)).value.status,
      'revoked',
    );
    const ended = await request(
      `/v1/admin/recorder-assignments/${assignmentId}/end`,
      adminCredential,
      { status: 'released' },
    );
    assert.equal(ended.value.status, 'released');
    for (const secret of [userCredential, adminCredential, rawToken, '881-SMOKE-0004812']) {
      assert.ok(
        !output.includes(secret),
        'API/CLI logs must not contain secrets or the full recorder serial',
      );
    }
    log(
      'Compiled API smoke passed: migrations, seed, sessions/roles, admin read models, assignment, QR, resolve, concurrent claim/recovery, revocation and release.',
    );
  } finally {
    if (server && server.exitCode === null) {
      const exited = once(server, 'exit', { signal: AbortSignal.timeout(5000) });
      server.kill('SIGTERM');
      try {
        await exited;
      } catch {
        server.kill('SIGKILL');
      }
    }
    await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await control.end();
  }
}
smoke().catch(() => {
  error('Compiled API smoke failed. Check local test database access and run pnpm build first.');
  process.exitCode = 1;
});
