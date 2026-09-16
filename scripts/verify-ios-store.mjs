import { isDeepStrictEqual } from 'node:util';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { aggregateRequiredReasons, suppliedBundles } from './package-ios-privacy.mjs';
import { readinessErrors, validateStoreEnvironment } from './ios-store-config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export const readPlist = (path) =>
  JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', path], { encoding: 'utf8' }));
export function missingRequiredReasons(appManifest, sdkManifests) {
  const own = aggregateRequiredReasons(appManifest, []).NSPrivacyAccessedAPITypes;
  const required = aggregateRequiredReasons({}, sdkManifests).NSPrivacyAccessedAPITypes;
  return required.flatMap((entry) => {
    const present =
      own.find((item) => item.NSPrivacyAccessedAPIType === entry.NSPrivacyAccessedAPIType)
        ?.NSPrivacyAccessedAPITypeReasons ?? [];
    return entry.NSPrivacyAccessedAPITypeReasons.filter((reason) => !present.includes(reason)).map(
      (reason) => `${entry.NSPrivacyAccessedAPIType}:${reason}`,
    );
  });
}
function walk(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(path, entry.name)) : [join(path, entry.name)],
  );
}
export function inspectApp({
  app,
  origin,
  wifi,
  unsigned = false,
  plist = readPlist,
  signedEntitlements,
}) {
  const errors = [];
  const info = plist(join(app, 'Info.plist'));
  if (info.CFBundleIdentifier !== 'com.aptlyable.mobile')
    errors.push('Unexpected bundle identifier.');
  if (
    info.AptlyReleaseChannel !== 'store' ||
    info.AptlyRecorderMode !== 'native' ||
    info.AptlyAPIOrigin !== origin
  )
    errors.push(
      'Archive is stale or not generated for the store/native/production profile; regenerate with matching environment.',
    );
  if (info.AptlyPlaudWifiTransferEnabled !== wifi)
    errors.push('Archived Wi-Fi transfer flag differs from selected profile.');
  if ('NSFaceIDUsageDescription' in info)
    errors.push('Unused NSFaceIDUsageDescription is still bundled; regenerate native config.');
  for (const key of [
    'NSLocationWhenInUseUsageDescription',
    'NSLocationAlwaysAndWhenInUseUsageDescription',
  ])
    if (typeof info[key] !== 'string' || !info[key].trim())
      errors.push(`Missing ${key} for optional recording location; regenerate native config.`);
  if (!Array.isArray(info.UIBackgroundModes) || !info.UIBackgroundModes.includes('location'))
    errors.push('Recording location background mode is missing; regenerate native config.');
  if (
    !existsSync(join(app, 'main.jsbundle')) ||
    !readFileSync(join(app, 'main.jsbundle')).includes(origin)
  )
    errors.push('Production API origin is absent from the bundled JavaScript.');
  const manifests = walk(app).filter((p) => p.endsWith('/PrivacyInfo.xcprivacy'));
  for (const path of manifests) {
    try {
      const manifest = plist(path);
      if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error();
    } catch {
      errors.push(`Invalid privacy plist: ${path}`);
    }
  }
  for (const [, bundle] of suppliedBundles)
    if (!manifests.some((p) => p.endsWith(`/${bundle}.bundle/PrivacyInfo.xcprivacy`)))
      errors.push(
        `Missing supplied ${bundle} privacy bundle; regenerate with withStoreReadiness and rebuild.`,
      );
  // Meta's Hermes engine is not the Imgur/Hermes SDK on Apple's commonly-used
  // SDK list. A missing standalone Hermes manifest is not, by itself, an error.
  // Required-reason coverage, actual SDK provenance and Apple validation still apply.
  // https://github.com/react-native-community/discussions-and-proposals/discussions/776
  if (!unsigned) {
    if (!signedEntitlements || signedEntitlements['get-task-allow'] !== false)
      errors.push(
        'Distribution entitlements must explicitly set get-task-allow=false; development/unsigned archives cannot be exported as approved distribution artifacts.',
      );
    for (const key of [
      'com.apple.developer.networking.HotspotConfiguration',
      'com.apple.developer.networking.wifi-info',
    ]) {
      if (wifi ? signedEntitlements?.[key] !== true : signedEntitlements?.[key] === true)
        errors.push(
          `Distribution entitlement mismatch: ${key}. Install the intended App Store profile with matching capabilities.`,
        );
    }
  }
  return { errors, manifests };
}
export function verifyArchive(archive, { unsigned = false, env = process.env } = {}) {
  const profile = validateStoreEnvironment(env);
  const metadata = JSON.parse(
    readFileSync(resolve(root, 'apps/mobile/store-readiness.json'), 'utf8'),
  );
  const errors = readinessErrors(metadata, (p) => existsSync(resolve(root, p)));
  const app = resolve(archive, 'Products/Applications/AptlyAble.app');
  let signedEntitlements;
  if (!unsigned) {
    execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'pipe' });
    const text = execFileSync('codesign', ['-d', '--entitlements', ':-', app], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    signedEntitlements = JSON.parse(
      execFileSync('plutil', ['-convert', 'json', '-o', '-', '-'], {
        input: text,
        encoding: 'utf8',
      }),
    );
  }
  const result = inspectApp({ app, ...profile, unsigned, signedEntitlements });
  errors.push(...result.errors);
  const sdkManifests = [];
  for (const [sdk, bundle] of suppliedBundles) {
    const target = join(app, `${bundle}.bundle/PrivacyInfo.xcprivacy`);
    if (existsSync(target)) {
      try {
        const source = readPlist(
          resolve(root, 'apps/mobile/node_modules', sdk, 'ios/PrivacyInfo.xcprivacy'),
        );
        sdkManifests.push(source);
        if (!isDeepStrictEqual(readPlist(target), source))
          errors.push(
            `Archived ${bundle} differs from the installed vendor manifest; rebuild the exact locked SDK resources.`,
          );
      } catch {
        errors.push(`Cannot compare ${bundle} with its installed SDK manifest.`);
      }
    }
  }
  try {
    for (const reason of missingRequiredReasons(
      readPlist(join(app, 'PrivacyInfo.xcprivacy')),
      sdkManifests,
    ))
      errors.push(
        `Main app privacy manifest is missing supplied SDK API reason ${reason}; rebuild with privacy aggregation.`,
      );
  } catch {
    errors.push(
      'Main app privacy manifest is missing, invalid or has malformed required-reason declarations.',
    );
  }
  return { ...result, errors, unsigned };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!process.argv[2])
      throw new Error('Usage: node scripts/verify-ios-store.mjs ARCHIVE [--unsigned]');
    const result = verifyArchive(resolve(process.argv[2]), {
      unsigned: process.argv.includes('--unsigned'),
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.errors.length) process.exitCode = 1;
    else
      console.log(
        result.unsigned
          ? 'Unsigned structural checks passed; signing, provisioning, upload and physical review remain unverified.'
          : 'Local archive checks passed; Apple validation/upload and physical review remain separate gates.',
      );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
