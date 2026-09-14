import { cp, mkdir, readFile, writeFile, chmod, mkdtemp, rm, stat } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { randomBytes, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { log, error } from 'node:console';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, '.local/remote-pilot');
const origin = 'https://plaud.aptlyable.info';
const apiOrigin = 'https://api.plaud.aptlyable.info';
await mkdir(output, { recursive: true, mode: 0o700 });
const stage = await mkdtemp(resolve(output, 'server-package-'));
try {
  const apk = resolve(output, 'downloads/aptly-able-android.apk');
  const metadata = JSON.parse(
    await readFile(resolve(output, 'downloads/aptly-able-android.json'), 'utf8'),
  );
  if (
    metadata.apiUrl !== apiOrigin ||
    metadata.package !== 'com.aptlyable.mobile' ||
    !metadata.standalone
  )
    throw new Error(
      'The Android build must be standalone and target the configured pilot website.',
    );
  const bytes = await readFile(apk);
  if (metadata.sha256 !== createHash('sha256').update(bytes).digest('hex'))
    throw new Error('The APK checksum differs from its build metadata.');
  const entries = [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'tsconfig.base.json',
    '.dockerignore',
    'packages/contracts',
    'apps/api',
    'deploy/pilot',
    'scripts/copy-api-migrations.mjs',
    'docs/AWS_PILOT.md',
    'docs/ANDROID_PILOT.md',
    'docs/AMPLIFY_PILOT.md',
    'docs/EXISTING_EC2_PILOT.md',
    'docs/IOS_PILOT.md',
    'docs/verification/REMOTE_PILOT.md',
  ];
  for (const entry of entries) {
    await cp(resolve(root, entry), resolve(stage, entry), {
      recursive: true,
      filter: (source) => {
        const name = basename(source);
        return (
          !['node_modules', 'dist', '.local', 'test', 'tests', 'downloads'].includes(name) &&
          !(name === '.env' || (name.startsWith('.env.') && name !== '.env.example')) &&
          !name.endsWith('.log')
        );
      },
    });
  }
  const archive = resolve(output, 'aptly-able-pilot-server.tar.gz');
  const result = spawnSync('tar', ['-czf', archive, '-C', stage, '.'], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Server archive creation failed.');

  // Private runtime configuration is deliberately separate from the shareable archive.
  const serverEnv = resolve(output, 'server.env');
  let exists = true;
  try {
    await stat(serverEnv);
  } catch {
    exists = false;
  }
  if (!exists) {
    const existing = parseEnv(await readFile(resolve(root, 'apps/api/.env'), 'utf8'));
    const id = existing.PLAUD_CLIENT_ID;
    const secret = existing.PLAUD_CLIENT_SECRET;
    if (!id || !secret)
      throw new Error(
        'Add Plaud SDK credentials to apps/api/.env before packaging private server configuration.',
      );
    const quote = (value) => {
      if (/[\r\n']/.test(value)) throw new Error('A configuration value needs manual quoting.');
      return `'${value}'`;
    };
    const lines = {
      SITE_ADDRESS: 'api.plaud.aptlyable.info',
      PUBLIC_ORIGIN: origin,
      API_ORIGIN: apiOrigin,
      RELEASE_TAG: '2026-09-14',
      POSTGRES_PASSWORD: randomBytes(32).toString('hex'),
      PLAUD_CLIENT_ID: id,
      PLAUD_CLIENT_SECRET: secret,
      PLAUD_REGION: existing.PLAUD_REGION ?? 'us',
      ANDROID_DOWNLOAD_URL: `${origin}/downloads/aptly-able-android.apk`,
      IOS_TESTFLIGHT_URL: '',
      DOWNLOADS_DIRECTORY: './downloads',
    };
    await writeFile(
      serverEnv,
      Object.entries(lines)
        .map(([key, value]) => `${key}=${quote(value)}`)
        .join('\n') + '\n',
      { flag: 'wx', mode: 0o600 },
    );
  }
  await chmod(serverEnv, 0o600);
  const saved = parseEnv(await readFile(serverEnv, 'utf8'));
  if (
    saved.SITE_ADDRESS !== 'api.plaud.aptlyable.info' ||
    saved.PUBLIC_ORIGIN !== origin ||
    saved.API_ORIGIN !== apiOrigin
  )
    throw new Error(
      'Existing server.env uses a different deployment topology. Update only SITE_ADDRESS, PUBLIC_ORIGIN and API_ORIGIN using deploy/pilot/.env.example; preserve all existing secrets.',
    );
  const buildEnvironment = {
    ...process.env,
    VITE_API_URL: apiOrigin,
    VITE_ANDROID_DOWNLOAD_URL: `${origin}/downloads/aptly-able-android.apk`,
    VITE_IOS_TESTFLIGHT_URL: process.env.VITE_IOS_TESTFLIGHT_URL ?? '',
  };
  for (const name of ['@aptly/contracts', '@aptly/api-client', '@aptly/admin']) {
    const build = spawnSync('pnpm', ['--filter', name, 'build'], {
      cwd: root,
      env: buildEnvironment,
      stdio: 'inherit',
    });
    if (build.status !== 0) throw new Error('Amplify website build failed.');
  }
  const webStage = resolve(stage, 'amplify-site');
  await cp(resolve(root, 'apps/admin/dist'), webStage, { recursive: true });
  await mkdir(resolve(webStage, 'downloads'), { recursive: true });
  await cp(apk, resolve(webStage, 'downloads/aptly-able-android.apk'));
  await cp(resolve(root, 'deploy/amplify/customHttp.yml'), resolve(webStage, 'customHttp.yml'));
  const zipPath = resolve(output, 'aptly-able-amplify.zip');
  // Remove only this generated archive before replacing it; zip otherwise retains deleted entries.
  await rm(zipPath, { force: true });
  const zip = spawnSync('zip', ['-q', '-r', zipPath, '.'], { cwd: webStage, stdio: 'inherit' });
  if (zip.status !== 0) throw new Error('Amplify archive creation failed.');
  log(`Amplify upload: ${zipPath}`);
  log(`Server bundle: ${archive}`);
  log(
    `Private server configuration: ${serverEnv} (existing configuration preserved; never publish it)`,
  );
} catch (failure) {
  error(failure instanceof Error ? failure.message : 'Pilot packaging failed.');
  process.exitCode = 1;
} finally {
  await rm(stage, { recursive: true, force: true });
}
