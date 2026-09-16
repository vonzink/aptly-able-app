import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, URL } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import process from 'node:process';
import console from 'node:console';
import { validateStoreEnvironment, readinessErrors } from './ios-store-config.mjs';
import { inspectAndroidBackupResources } from './android-backup-checks.mjs';
import {
  inspectAndroidManifest,
  inspectElf,
  signatureAccepted,
  androidReadinessErrors,
} from './android-store-checks.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const mobileRequire = createRequire(resolve(root, 'apps/mobile/package.json'));
const { AndroidConfig } = mobileRequire('expo/config-plugins');
const run = (cmd, args) =>
  execFileSync(cmd, args, {
    maxBuffer: 128 * 1024 * 1024,
    timeout: 120_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

export async function verifyAndroidBundle(bundle, env = process.env) {
  const { origin } = validateStoreEnvironment(env);
  if (!existsSync(bundle)) throw new Error('Bundle does not exist.');
  const tool = env.APTLY_BUNDLETOOL_JAR;
  if (!tool || !existsSync(tool))
    throw new Error('Set APTLY_BUNDLETOOL_JAR to an official Google bundletool JAR.');
  const expectedCertificate = (env.APTLY_ANDROID_CERT_SHA256 ?? '')
    .replaceAll(':', '')
    .toUpperCase();
  if (!/^[A-F0-9]{64}$/.test(expectedCertificate))
    throw new Error(
      'Set APTLY_ANDROID_CERT_SHA256 to the reviewed release/upload certificate fingerprint.',
    );
  const metadata = JSON.parse(
    readFileSync(resolve(root, 'apps/mobile/store-readiness.json'), 'utf8'),
  );
  const release = JSON.parse(readFileSync(resolve(root, 'apps/mobile/release.json'), 'utf8'));
  const errors = [
    ...readinessErrors(metadata, (p) => existsSync(resolve(root, p))),
    ...androidReadinessErrors(metadata),
  ];
  const warnings = [];
  run('java', ['-jar', tool, 'validate', `--bundle=${bundle}`]);
  const manifestXml = run('java', [
    '-jar',
    tool,
    'dump',
    'manifest',
    `--bundle=${bundle}`,
    '--module=base',
  ]);
  const scratch = mkdtempSync(join(tmpdir(), 'aptly-aab-'));
  try {
    const manifestPath = join(scratch, 'AndroidManifest.xml');
    writeFileSync(manifestPath, manifestXml);
    const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(manifestPath);
    errors.push(
      ...inspectAndroidManifest(manifest, {
        origin,
        version: release.version,
        versionCode: release.buildNumber,
      }),
    );
    const backupResources = JSON.parse(
      run('java', [
        '-cp',
        tool,
        resolve(root, 'scripts/java/ReadBundleBackupRules.java'),
        bundle,
      ]).toString(),
    );
    errors.push(...inspectAndroidBackupResources(backupResources));
    const signature = spawnSync(
      'jarsigner',
      ['-J-Duser.language=en', '-verify', '-strict', bundle],
      { encoding: 'utf8', timeout: 120_000 },
    );
    if (!signatureAccepted(signature))
      errors.push('Bundle signature failed or contains unexpected signer errors/unsigned entries.');
    const certificate = run('keytool', [
      '-J-Duser.language=en',
      '-printcert',
      '-jarfile',
      bundle,
    ]).toString();
    const fingerprints = [...certificate.matchAll(/SHA256:\s*([A-F0-9:]+)/g)].map((m) =>
      m[1].replaceAll(':', ''),
    );
    if (!fingerprints.includes(expectedCertificate))
      errors.push('Bundle signer differs from the reviewed certificate.');
    const config = JSON.parse(
      run('java', ['-jar', tool, 'dump', 'config', `--bundle=${bundle}`]).toString(),
    );
    if (config.optimizations?.uncompressNativeLibraries?.alignment !== 'PAGE_ALIGNMENT_16K')
      errors.push('Bundle native ZIP alignment is not PAGE_ALIGNMENT_16K.');
    const entries = run('unzip', ['-Z1', bundle]).toString().trim().split('\n');
    const libs = entries.filter((p) => p.endsWith('.so') && p.startsWith('base/lib/'));
    if (!libs.length) errors.push('No native libraries packaged.');
    if (libs.some((p) => !p.startsWith('base/lib/arm64-v8a/')))
      errors.push(
        'Unexpected ABI; update the explicit device/support matrix and verifier before adding architectures.',
      );
    for (const name of libs) {
      const result = inspectElf(run('unzip', ['-p', bundle, name]), name);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }
    if (
      !entries.includes('base/assets/index.android.bundle') ||
      !run('unzip', ['-p', bundle, 'base/assets/index.android.bundle']).includes(origin)
    )
      errors.push('Production API origin missing from bundled JavaScript.');
    if (
      entries.some((p) => /(?:^|\/)(?:\.env(?:\.[^/]*)?|[^/]+\.(?:p12|pem|keystore|jks))$/i.test(p))
    )
      errors.push('Potential environment/signing secret packaged; inspect before release.');
    return {
      bundle,
      sha256: createHash('sha256').update(readFileSync(bundle)).digest('hex'),
      version: release.version,
      versionCode: release.buildNumber,
      nativeLibraries: libs.length,
      errors,
      warnings,
      note: 'Local artifact inspection only. Device tests, Play Console validation and Apple validation are separate requirements.',
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) {
    console.error('Usage: verify-android-store.mjs APP.aab');
    process.exitCode = 1;
  } else
    verifyAndroidBundle(resolve(process.argv[2]))
      .then((result) => {
        console.log(JSON.stringify(result, null, 2));
        if (result.errors.length) process.exitCode = 1;
      })
      .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
}
