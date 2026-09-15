import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import process from 'node:process';

export const suppliedBundles = [
  ['expo-file-system', 'ExpoFileSystem_privacy'],
  ['expo-application', 'ExpoApplication_privacy'],
];

// Union only supplied API reasons; preserve the app's other privacy declarations.
export function aggregateRequiredReasons(appManifest, sdkManifests) {
  const categories = new Map();
  for (const manifest of [appManifest, ...sdkManifests]) {
    const entries = manifest.NSPrivacyAccessedAPITypes ?? [];
    if (!Array.isArray(entries)) throw new Error('Invalid required API declarations.');
    for (const entry of entries) {
      const type = entry.NSPrivacyAccessedAPIType;
      const reasons = entry.NSPrivacyAccessedAPITypeReasons;
      if (
        typeof type !== 'string' ||
        !type.startsWith('NSPrivacyAccessedAPICategory') ||
        !Array.isArray(reasons) ||
        !reasons.length ||
        reasons.some((reason) => typeof reason !== 'string' || !/^[A-Z0-9]{4}\.\d+$/.test(reason))
      )
        throw new Error('Invalid required API reason in supplied privacy manifest.');
      const values = categories.get(type) ?? new Set();
      reasons.forEach((reason) => values.add(reason));
      categories.set(type, values);
    }
  }
  return {
    ...appManifest,
    NSPrivacyAccessedAPITypes: [...categories]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([type, reasons]) => ({
        NSPrivacyAccessedAPIType: type,
        NSPrivacyAccessedAPITypeReasons: [...reasons].sort(),
      })),
  };
}
const readManifest = (path) =>
  JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', path], { encoding: 'utf8' }));
export function packagePrivacy(mobile, destination) {
  const sourceManifests = [];
  for (const [sdk, bundle] of suppliedBundles) {
    const source = resolve(mobile, 'node_modules', sdk, 'ios/PrivacyInfo.xcprivacy');
    readFileSync(source); // A missing vendor resource must fail the build.
    sourceManifests.push(readManifest(source));
    const output = resolve(destination, `${bundle}.bundle`);
    mkdirSync(output, { recursive: true });
    copyFileSync(source, resolve(output, 'PrivacyInfo.xcprivacy'));
    writeFileSync(
      resolve(output, 'Info.plist'),
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.aptlyable.resources.${bundle.replaceAll('_', '-')}</string><key>CFBundleName</key><string>${bundle}</string><key>CFBundlePackageType</key><string>BNDL</string><key>CFBundleVersion</key><string>1</string></dict></plist>\n`,
    );
  }
  const appPath = resolve(destination, 'PrivacyInfo.xcprivacy');
  const existing = existsSync(appPath) ? readManifest(appPath) : {};
  const merged = aggregateRequiredReasons(existing, sourceManifests);
  // Aggregate required API reasons only. Vendor "no tracking" or empty collected
  // data declarations must never replace the application's own privacy assertions.
  const xml = execFileSync('plutil', ['-convert', 'xml1', '-o', '-', '-'], {
    input: JSON.stringify(merged),
    encoding: 'utf8',
  });
  writeFileSync(appPath, xml);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4)
    throw new Error('Usage: package-ios-privacy.mjs MOBILE_ROOT APP_RESOURCES');
  packagePrivacy(resolve(process.argv[2]), resolve(process.argv[3]));
}
