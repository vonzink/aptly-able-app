import { spawn, execFileSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import console from 'node:console';

process.umask(0o077);

const root = fileURLToPath(new URL('../', import.meta.url));
const mobile = resolve(root, 'apps/mobile');
const release = JSON.parse(readFileSync(resolve(mobile, 'release.json'), 'utf8'));
const pilot = resolve(root, '.local/remote-pilot');
const signing = resolve(pilot, 'signing');
const output = resolve(pilot, 'downloads');
const sdk = process.env.ANDROID_HOME ?? resolve(root, '.local/android-sdk');
const env = { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
const run = (command, args, cwd = root) =>
  new Promise((done, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? done() : reject(new Error(`${command} failed (${code}).`)),
    );
  });
try {
  const raw = process.env.EXPO_PUBLIC_API_URL;
  if (!raw) throw new Error('Set EXPO_PUBLIC_API_URL explicitly to the HTTPS pilot API URL.');
  const api = new URL(raw);
  if (
    api.protocol !== 'https:' ||
    api.username ||
    api.password ||
    api.search ||
    api.hash ||
    api.pathname !== '/' ||
    /^(localhost|127\.|\[::1\])/.test(api.hostname)
  )
    throw new Error(
      'Pilot API must be a public HTTPS origin only, without credentials, query, fragment or secrets.',
    );
  // Ignore local Expo dotenv files and remove every inherited public variable so no local credentials are bundled.
  for (const key of Object.keys(env)) if (key.startsWith('EXPO_PUBLIC_')) delete env[key];
  Object.assign(env, {
    APTLY_ANDROID_PREVIEW: '0',
    EXPO_NO_DOTENV: '1',
    EXPO_PUBLIC_API_URL: api.origin,
    EXPO_PUBLIC_AUTH_MODE: 'pilot',
    NODE_ENV: 'production',
  });
  if (!env.JAVA_HOME)
    env.JAVA_HOME = execFileSync('/usr/libexec/java_home', ['-v', '21'], {
      encoding: 'utf8',
    }).trim();
  mkdirSync(signing, { recursive: true, mode: 0o700 });
  chmodSync(signing, 0o700);
  const keystore = resolve(signing, 'aptly-pilot.p12');
  const passwordFile = resolve(signing, 'password');
  if (existsSync(keystore) !== existsSync(passwordFile))
    throw new Error(
      'Incomplete signing state. Restore the original key and password backup; do not replace an existing signing identity.',
    );
  if (!existsSync(keystore)) {
    writeFileSync(passwordFile, randomBytes(32).toString('base64url'), { mode: 0o600, flag: 'wx' });
    env.APTLY_PILOT_STORE_PASSWORD = readFileSync(passwordFile, 'utf8').trim();
    env.APTLY_PILOT_KEY_PASSWORD = env.APTLY_PILOT_STORE_PASSWORD;
    await run(resolve(env.JAVA_HOME, 'bin/keytool'), [
      '-genkeypair',
      '-keystore',
      keystore,
      '-storetype',
      'PKCS12',
      '-alias',
      'aptly-pilot',
      '-keyalg',
      'RSA',
      '-keysize',
      '3072',
      '-validity',
      '10000',
      '-dname',
      'CN=Aptly Able Pilot',
      '-storepass:env',
      'APTLY_PILOT_STORE_PASSWORD',
      '-keypass:env',
      'APTLY_PILOT_KEY_PASSWORD',
    ]);
  }
  chmodSync(passwordFile, 0o600);
  chmodSync(keystore, 0o600);
  Object.assign(env, {
    APTLY_PILOT_KEYSTORE: keystore,
    APTLY_PILOT_KEY_ALIAS: 'aptly-pilot',
    APTLY_PILOT_STORE_PASSWORD: readFileSync(passwordFile, 'utf8').trim(),
    APTLY_PILOT_KEY_PASSWORD: readFileSync(passwordFile, 'utf8').trim(),
  });
  await run('node', ['scripts/check-plaud-sdk.mjs', 'android']);
  await run('pnpm', ['--filter', '@aptly/contracts', 'build']);
  await run('pnpm', ['--filter', '@aptly/api-client', 'build']);
  await run(
    'pnpm',
    ['exec', 'expo', 'prebuild', '--platform', 'android', '--no-install', '--no-clean'],
    mobile,
  );
  await run(
    './gradlew',
    [':app:assembleRelease', '-PreactNativeArchitectures=arm64-v8a', '--no-daemon'],
    resolve(mobile, 'android'),
  );
  const built = resolve(mobile, 'android/app/build/outputs/apk/release/app-release.apk');
  const buildTools = resolve(sdk, 'build-tools/36.0.0');
  const signature = execFileSync(
    resolve(buildTools, 'apksigner'),
    ['verify', '--verbose', '--print-certs', built],
    { env, encoding: 'utf8' },
  );
  const manifest = execFileSync(resolve(buildTools, 'aapt'), ['dump', 'badging', built], {
    env,
    encoding: 'utf8',
  });
  const packageInfo = manifest.match(
    /^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'/m,
  );
  const entries = execFileSync('unzip', ['-Z1', built], { encoding: 'utf8' });
  const bundle = execFileSync('unzip', ['-p', built, 'assets/index.android.bundle'], {
    maxBuffer: 40 * 1024 * 1024,
  });
  if (
    packageInfo?.[1] !== 'com.aptlyable.mobile' ||
    packageInfo[2] !== String(release.buildNumber) ||
    packageInfo[3] !== release.version ||
    !entries.includes('assets/index.android.bundle') ||
    !bundle.includes(Buffer.from(api.origin)) ||
    signature.includes('Android Debug')
  )
    throw new Error('Release package, bundled API, assets or signing verification failed.');
  for (const permission of [
    'android.permission.BLUETOOTH_SCAN',
    'android.permission.BLUETOOTH_CONNECT',
    'android.permission.INTERNET',
  ])
    if (!manifest.includes(permission)) throw new Error(`Missing permission: ${permission}`);
  mkdirSync(output, { recursive: true });
  const apk = resolve(output, 'aptly-able-android.apk');
  copyFileSync(built, apk);
  const metadata = {
    package: 'com.aptlyable.mobile',
    version: packageInfo[3],
    versionCode: Number(packageInfo[2]),
    architecture: 'arm64-v8a',
    apiUrl: api.origin,
    authMode: 'pilot',
    builtAt: new Date().toISOString(),
    sha256: createHash('sha256').update(readFileSync(apk)).digest('hex'),
    bytes: readFileSync(apk).length,
    standalone: true,
    hardwareAcceptance: 'pending',
  };
  writeFileSync(
    resolve(output, 'aptly-able-android.json'),
    JSON.stringify(metadata, null, 2) + '\n',
  );
  writeFileSync(resolve(pilot, 'android-signature.txt'), signature);
  writeFileSync(resolve(pilot, 'android-manifest.txt'), manifest);
  console.log(`Verified standalone APK: ${apk}\nSHA-256: ${metadata.sha256}`);
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : 'Android pilot build failed.');
  process.exitCode = 1;
}
