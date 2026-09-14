import { access, readFile, stat } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { log, error } from 'node:console';
import { createHash } from 'node:crypto';

const root = new URL('../apps/mobile/modules/plaud-sdk/', import.meta.url);
const platform = process.argv[2] ?? 'all';
if (!['ios', 'android', 'all'].includes(platform)) {
  error('Usage: node scripts/check-plaud-sdk.mjs [ios|android|all]');
  process.exitCode = 1;
} else {
  const failures = [];
  const required = async (path, minimumBytes = 1) => {
    try {
      const file = new URL(path, root);
      await access(file);
      const info = await stat(file);
      if (!info.isFile() || info.size < minimumBytes) throw new Error('Invalid SDK file.');
      log(`Present: ${path}`);
    } catch {
      failures.push(fileURLToPath(new URL(path, root)));
    }
  };
  await required('expo-module.config.json');
  if (platform === 'all' || platform === 'ios') {
    for (const name of ['PlaudBleSDK', 'PlaudWiFiSDK', 'PlaudDeviceBasicSDK'])
      await required(
        `ios/Frameworks/${name}.xcframework/ios-arm64/${name}.framework/${name}`,
        1024,
      );
    await required(
      'ios/Frameworks/PlaudDeviceBasicSDK.xcframework/ios-arm64/PlaudDeviceBasicSDK.framework/PlaudDeviceBasicSDK.bundle/Info.plist',
    );
    log(
      'iOS libraries target physical arm64 devices. This check does not compile or pair hardware.',
    );
  }
  if (platform === 'all' || platform === 'android') {
    const artifacts = JSON.parse(await readFile(new URL('sdk-artifacts.json', root), 'utf8'));
    const { path, sha256 } = artifacts.android;
    await required(path, 1024);
    if (!failures.includes(fileURLToPath(new URL(path, root)))) {
      const bytes = await readFile(new URL(path, root));
      if (bytes[0] !== 0x50 || bytes[1] !== 0x4b)
        failures.push('Android SDK is not an AAR/ZIP archive.');
      if (createHash('sha256').update(bytes).digest('hex') !== sha256)
        failures.push(
          'Android SDK differs from sdk-artifacts.json. Restore the pinned artifact or review the SDK upgrade and its dependencies.',
        );
    }
  }
  if (failures.length) {
    error('Plaud native SDK setup is incomplete:');
    failures.forEach((path) => error(`  ${path}`));
    error('Obtain the missing SDK files from Plaud. See docs/PLAUD_NATIVE_SETUP.md.');
    process.exitCode = 1;
  } else
    log(
      'Requested Plaud SDK files are present. Credentials and phone acceptance are separate checks.',
    );
}
