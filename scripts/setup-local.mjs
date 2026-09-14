import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { parseEnv } from 'node:util';
import { log, error } from 'node:console';
import process from 'node:process';

const root = fileURLToPath(new URL('../', import.meta.url));
const envFile = new URL('../apps/api/.env', import.meta.url);
const accessFile = new URL('../.local/development-access.txt', import.meta.url);
const localDatabase = 'postgres://aptly:aptly_local_only@127.0.0.1:55432/aptly_mobile';
async function setup() {
  let content;
  try {
    content = await readFile(envFile, 'utf8');
  } catch (failure) {
    if (failure.code !== 'ENOENT') throw failure;
    content =
      [
        'NODE_ENV=development',
        'HOST=127.0.0.1',
        'PORT=4100',
        `DATABASE_URL=${localDatabase}`,
        `DEV_USER_ID=${randomUUID()}`,
        `DEV_SESSION_TOKEN=${randomBytes(32).toString('base64url')}`,
        'DEV_USER_DISPLAY_NAME="Zach (local test)"',
        `DEV_ADMIN_USER_ID=${randomUUID()}`,
        `DEV_ADMIN_SESSION_TOKEN=${randomBytes(32).toString('base64url')}`,
        'DEV_ADMIN_DISPLAY_NAME="Local administrator"',
        'ENROLLMENT_BASE_URL=http://localhost:8088/enroll',
        'BROWSER_ORIGINS=http://localhost:8088,http://localhost:8089,http://127.0.0.1:8088,http://127.0.0.1:8089',
      ].join('\n') + '\n';
    await writeFile(envFile, content, { flag: 'wx', mode: 0o600 });
  }
  const config = parseEnv(content);
  if (
    config.DATABASE_URL !== localDatabase ||
    config.NODE_ENV !== 'development' ||
    config.HOST !== '127.0.0.1' ||
    !config.DEV_SESSION_TOKEN ||
    !config.DEV_ADMIN_SESSION_TOKEN
  ) {
    throw new Error('Existing API environment needs manual local configuration.');
  }
  const run = (command, args) => {
    const result = spawnSync(command, args, {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, ...config },
    });
    if (result.status !== 0) throw new Error('Local setup command failed.');
  };
  run('docker', ['compose', 'up', '-d', '--wait', 'postgres']);
  run('pnpm', ['db:migrate']);
  run('pnpm', ['db:seed-dev']);
  await mkdir(new URL('../.local/', import.meta.url), { recursive: true, mode: 0o700 });
  await writeFile(
    accessFile,
    [
      'Aptly Able — local development access only',
      '',
      'Admin dashboard: http://localhost:8089',
      `Administrator access code: ${config.DEV_ADMIN_SESSION_TOKEN}`,
      '',
      'Enrollment screen: http://localhost:8088/enroll',
      `User access code: ${config.DEV_SESSION_TOKEN}`,
      '',
      'These codes are for this local database and loopback API only. Do not share or put them in a client bundle.',
    ].join('\n'),
    { mode: 0o600 },
  );
  log(
    'Local database is ready. Development access codes are in .local/development-access.txt (not printed).',
  );
  log(
    'Start the API with pnpm dev:api, the dashboard with pnpm dev:admin, and the mobile preview with pnpm dev:web.',
  );
}
setup().catch(() => {
  error(
    'Local setup did not finish. Check Docker, API environment configuration and migration history. Existing configuration was preserved.',
  );
  process.exitCode = 1;
});
