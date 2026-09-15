import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectApp, missingRequiredReasons } from '../verify-ios-store.mjs';
import { packagePrivacy, suppliedBundles } from '../package-ios-privacy.mjs';
import { validateStoreEnvironment, readinessErrors } from '../ios-store-config.mjs';
import { buildCommands, validateExportOptions } from '../ios-store.mjs';

const env = {
  APTLY_RELEASE_CHANNEL: 'store',
  EXPO_PUBLIC_API_URL: 'https://api.aptlyable.com',
  APTLY_PRODUCTION_API_ORIGIN: 'https://api.aptlyable.com',
  EXPO_PUBLIC_AUTH_MODE: 'pilot',
};
test('store profile rejects local, mismatched, demo and mock configuration', () => {
  assert.equal(validateStoreEnvironment(env).origin, env.EXPO_PUBLIC_API_URL);
  for (const patch of [
    { EXPO_PUBLIC_API_URL: 'https://localhost' },
    { APTLY_PRODUCTION_API_ORIGIN: 'https://other.example.com' },
    { EXPO_PUBLIC_AUTH_MODE: 'demo' },
    { APTLY_ANDROID_PREVIEW: '1' },
    { APTLY_RELEASE_CHANNEL: 'pilot' },
  ])
    assert.throws(() => validateStoreEnvironment({ ...env, ...patch }));
});
test(
  'archive fixture detects missing SDK resources and development signing',
  { skip: process.platform !== 'darwin' },
  () => {
    const dir = mkdtempSync(join(tmpdir(), 'aptly-ios-test-'));
    try {
      const app = join(dir, 'AptlyAble.app');
      mkdirSync(app);
      writeFileSync(join(app, 'main.jsbundle'), env.EXPO_PUBLIC_API_URL);
      const info = {
        CFBundleIdentifier: 'com.aptlyable.mobile',
        AptlyReleaseChannel: 'store',
        AptlyRecorderMode: 'native',
        AptlyAPIOrigin: env.EXPO_PUBLIC_API_URL,
        AptlyPlaudWifiTransferEnabled: false,
      };
      const run = (extra = {}) =>
        inspectApp({
          app,
          origin: env.EXPO_PUBLIC_API_URL,
          wifi: false,
          plist: (p) => (p.endsWith('Info.plist') ? info : { NSPrivacyAccessedAPITypes: [] }),
          ...extra,
        });
      assert.ok(
        run({ signedEntitlements: { 'get-task-allow': true } }).errors.some((e) =>
          e.includes('get-task-allow'),
        ),
      );
      assert.ok(run({ unsigned: true }).errors.some((e) => e.includes('Hermes SDK')));
      const mobile = join(dir, 'mobile');
      for (const [sdk] of suppliedBundles) {
        const p = join(mobile, 'node_modules', sdk, 'ios');
        mkdirSync(p, { recursive: true });
        writeFileSync(
          join(p, 'PrivacyInfo.xcprivacy'),
          JSON.stringify({ NSPrivacyAccessedAPITypes: [] }),
        );
      }
      packagePrivacy(mobile, app);
      for (const [, bundle] of suppliedBundles)
        assert.equal(
          readFileSync(join(app, `${bundle}.bundle/PrivacyInfo.xcprivacy`), 'utf8'),
          JSON.stringify({ NSPrivacyAccessedAPITypes: [] }),
        );
      assert.ok(!run({ unsigned: true }).errors.some((e) => e.includes('Missing supplied')));
      assert.ok(run({ unsigned: true }).errors.some((e) => e.includes('Hermes SDK')));
      info.AptlyReleaseChannel = 'pilot';
      assert.ok(run({ unsigned: true }).errors.some((e) => e.includes('stale')));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
test('no distribution bypass or automatic provisioning/upload in command plans', () => {
  assert.throws(() =>
    validateExportOptions({ method: 'app-store-connect', destination: 'upload' }),
  );
  assert.throws(() => validateExportOptions({ method: 'development', destination: 'export' }));
  const commands = JSON.stringify(
    buildCommands({ mode: 'archive', archive: '/tmp/test.xcarchive', unsigned: true }),
  );
  assert.ok(commands.includes('CODE_SIGNING_ALLOWED=NO'));
  assert.ok(!commands.includes('allowProvisioningUpdates'));
  assert.ok(readinessErrors({}, () => false).some((e) => e.includes('providerEvidencePath')));
});

test('required API reasons aggregate without overwriting app privacy declarations', async () => {
  const { aggregateRequiredReasons } = await import('../package-ios-privacy.mjs');
  const manifest = {
    NSPrivacyTracking: true,
    NSPrivacyTrackingDomains: ['owned.example'],
    NSPrivacyCollectedDataTypes: [
      { NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeEmailAddress' },
    ],
    NSPrivacyAccessedAPITypes: [
      {
        NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
        NSPrivacyAccessedAPITypeReasons: ['C617.1'],
      },
    ],
  };
  const sdk = {
    NSPrivacyTracking: false,
    NSPrivacyAccessedAPITypes: [
      {
        NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
        NSPrivacyAccessedAPITypeReasons: ['C617.1', '0A2A.1'],
      },
      {
        NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
        NSPrivacyAccessedAPITypeReasons: ['E174.1'],
      },
    ],
  };
  const merged = aggregateRequiredReasons(manifest, [sdk]);
  assert.equal(merged.NSPrivacyTracking, true);
  assert.deepEqual(merged.NSPrivacyTrackingDomains, manifest.NSPrivacyTrackingDomains);
  assert.deepEqual(merged.NSPrivacyCollectedDataTypes, manifest.NSPrivacyCollectedDataTypes);
  assert.deepEqual(
    merged.NSPrivacyAccessedAPITypes.find((row) =>
      row.NSPrivacyAccessedAPIType.endsWith('FileTimestamp'),
    ).NSPrivacyAccessedAPITypeReasons,
    ['0A2A.1', 'C617.1'],
  );
  assert.deepEqual(aggregateRequiredReasons(merged, [sdk]), merged);
  assert.throws(() =>
    aggregateRequiredReasons({}, [
      {
        NSPrivacyAccessedAPITypes: [
          { NSPrivacyAccessedAPIType: 'type', NSPrivacyAccessedAPITypeReasons: [] },
        ],
      },
    ]),
  );
});

test('archive verification rejects required reasons missing from the main manifest', () => {
  const entry = (reasons) => ({
    NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
    NSPrivacyAccessedAPITypeReasons: reasons,
  });
  const sdk = { NSPrivacyAccessedAPITypes: [entry(['E174.1', '85F4.1'])] };
  assert.equal(missingRequiredReasons({}, [sdk]).length, 2);
  assert.deepEqual(
    missingRequiredReasons({ NSPrivacyAccessedAPITypes: [entry(['E174.1'])] }, [sdk]),
    ['NSPrivacyAccessedAPICategoryDiskSpace:85F4.1'],
  );
  assert.deepEqual(missingRequiredReasons(sdk, [sdk]), []);
});
