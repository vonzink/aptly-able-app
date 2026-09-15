import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { createRequire } from 'node:module';
import process from 'node:process';
import console from 'node:console';
import { readinessErrors, validateStoreEnvironment } from './ios-store-config.mjs';
import { inspectAndroidManifest, androidReadinessErrors } from './android-store-checks.mjs';
import { verifyAndroidBundle } from './verify-android-store.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
export function validateSigningEnvironment(env, exists = existsSync) {
  for (const key of [
    'APTLY_PILOT_KEYSTORE',
    'APTLY_PILOT_STORE_PASSWORD',
    'APTLY_PILOT_KEY_PASSWORD',
    'APTLY_PILOT_KEY_ALIAS',
  ]) {
    if (!env[key])
      throw new Error(`Existing release signing required: ${key}. No keys are generated.`);
  }
  if (!exists(env.APTLY_PILOT_KEYSTORE))
    throw new Error('Existing release keystore does not exist.');
}
export function androidBuildCommands(workspace) {
  return [
    ['node', ['scripts/check-plaud-sdk.mjs', 'android'], workspace],
    ...['@aptly/contracts', '@aptly/api-client', '@aptly/product-content'].map((pkg) => [
      'pnpm',
      ['--filter', pkg, 'build'],
      workspace,
    ]),
    [
      './gradlew',
      [
        ':app:bundleRelease',
        ':plaud-sdk:testReleaseUnitTest',
        '-PreactNativeArchitectures=arm64-v8a',
        '--no-daemon',
        '--max-workers=2',
      ],
      resolve(workspace, 'apps/mobile/android'),
    ],
  ];
}
export async function runAndroidStore(args, env = process.env) {
  if (args.some((arg) => !['--execute', '--inspect'].includes(arg)))
    throw new Error(
      'Usage: android-store.mjs [--execute] [--inspect]. Default dry run; inspect can build a candidate with pending evidence but never declares it ready.',
    );
  const profile = validateStoreEnvironment(env);
  const metadata = JSON.parse(
    readFileSync(resolve(root, 'apps/mobile/store-readiness.json'), 'utf8'),
  );
  const blockers = [
    ...readinessErrors(metadata, (p) => existsSync(resolve(root, p))),
    ...androidReadinessErrors(metadata),
  ];
  const commands = androidBuildCommands(root);
  console.log(
    JSON.stringify(
      {
        dryRun: !args.includes('--execute'),
        inspectionOnly: args.includes('--inspect'),
        profile,
        blockers,
        commands,
      },
      null,
      2,
    ),
  );
  if (!args.includes('--execute')) return;
  if (blockers.length && !args.includes('--inspect')) throw new Error(blockers.join('\n'));
  validateSigningEnvironment(env);
  if (!env.APTLY_BUNDLETOOL_JAR || !existsSync(env.APTLY_BUNDLETOOL_JAR))
    throw new Error('Provide an existing official bundletool JAR via APTLY_BUNDLETOOL_JAR.');
  if (!/^[A-Fa-f0-9]{64}$/.test((env.APTLY_ANDROID_CERT_SHA256 ?? '').replaceAll(':', '')))
    throw new Error('Set the reviewed upload certificate SHA-256 via APTLY_ANDROID_CERT_SHA256.');
  const require = createRequire(resolve(root, 'apps/mobile/package.json'));
  const { AndroidConfig } = require('expo/config-plugins');
  const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(
    resolve(root, 'apps/mobile/android/app/src/main/AndroidManifest.xml'),
  );
  // Source manifests omit uses-sdk/version (Gradle adds them); check profile and permissions in final AAB instead.
  const check = inspectAndroidManifest(manifest, {
    ...profile,
    version: '',
    versionCode: 0,
  }).filter((e) => e.startsWith('Stale Android'));
  if (check.length) throw new Error(check.join('\n'));
  const buildEnv = {
    ...env,
    EXPO_NO_DOTENV: '1',
    NODE_ENV: 'production',
    EXPO_PUBLIC_RECORDER_MODE: 'native',
  };
  for (const [command, argv, cwd] of commands)
    execFileSync(command, argv, { cwd, env: buildEnv, stdio: 'inherit', timeout: 30 * 60 * 1000 });
  const result = await verifyAndroidBundle(
    resolve(root, 'apps/mobile/android/app/build/outputs/bundle/release/app-release.aab'),
    env,
  );
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length)
    throw new Error('Candidate built, but submission verification is blocked; see findings above.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runAndroidStore(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
