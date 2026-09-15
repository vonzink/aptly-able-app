import test from 'node:test';
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import {
  inspectAndroidManifest,
  inspectElf,
  signatureAccepted,
  androidReadinessErrors,
} from '../android-store-checks.mjs';
import { androidBuildCommands, validateSigningEnvironment } from '../android-store.mjs';

const origin = 'https://api.plaud.aptlyable.info';
const fixture = () => ({
  manifest: {
    $: {
      package: 'com.aptlyable.mobile',
      'android:versionCode': '7',
      'android:versionName': '0.1.2',
    },
    'uses-sdk': [{ $: { 'android:minSdkVersion': '24', 'android:targetSdkVersion': '36' } }],
    'uses-permission': [
      'INTERNET',
      'BLUETOOTH_SCAN',
      'BLUETOOTH_CONNECT',
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'BLUETOOTH',
      'BLUETOOTH_ADMIN',
      'NEARBY_WIFI_DEVICES',
      'ACCESS_WIFI_STATE',
      'CHANGE_WIFI_STATE',
      'ACCESS_NETWORK_STATE',
      'CHANGE_NETWORK_STATE',
    ].map((name) => ({
      $: {
        'android:name': `android.permission.${name}`,
        ...(['BLUETOOTH', 'BLUETOOTH_ADMIN'].includes(name)
          ? { 'android:maxSdkVersion': '30' }
          : {}),
        ...(['BLUETOOTH_SCAN', 'NEARBY_WIFI_DEVICES'].includes(name)
          ? { 'android:usesPermissionFlags': 'neverForLocation' }
          : {}),
      },
    })),
    application: [
      {
        $: {
          'android:allowBackup': 'false',
          'android:fullBackupContent': '@xml/aptly_backup_rules',
          'android:dataExtractionRules': '@xml/aptly_data_extraction_rules',
        },
        'meta-data': Object.entries({
          'com.aptlyable.releaseChannel': 'store',
          'com.aptlyable.recorderMode': 'native',
          'com.aptlyable.apiOrigin': origin,
        }).map(([name, value]) => ({ $: { 'android:name': name, 'android:value': value } })),
      },
    ],
  },
});
const check = (m) => inspectAndroidManifest(m, { origin, version: '0.1.2', versionCode: 7 });
test('manifest release gate rejects permission creep and stale/insecure profiles', () => {
  assert.deepEqual(check(fixture()), []);
  for (const permission of [
    'SYSTEM_ALERT_WINDOW',
    'RECORD_AUDIO',
    'ACCESS_BACKGROUND_LOCATION',
    'READ_EXTERNAL_STORAGE',
  ]) {
    const m = fixture();
    m.manifest['uses-permission'].push({
      $: { 'android:name': `android.permission.${permission}` },
    });
    assert.ok(check(m).some((e) => e.includes(permission)));
  }
  for (const [key, value] of [
    ['android:debuggable', 'true'],
    ['android:usesCleartextTraffic', 'true'],
    ['android:allowBackup', 'true'],
  ]) {
    const m = fixture();
    m.manifest.application[0].$[key] = value;
    assert.ok(check(m).length);
  }
  const m = fixture();
  m.manifest.application[0]['meta-data'][0].$['android:value'] = 'pilot';
  assert.ok(check(m).some((e) => e.includes('releaseChannel')));
  m.manifest.$['android:versionCode'] = '6';
  assert.ok(check(m).some((e) => e.includes('version')));
});
test('ELF validation checks program headers, not only archive ZIP alignment', () => {
  const elf = Buffer.alloc(120);
  elf.write('\x7fELF');
  elf[4] = 2;
  elf[5] = 1;
  elf.writeBigUInt64LE(64n, 32);
  elf.writeUInt16LE(56, 54);
  elf.writeUInt16LE(1, 56);
  elf.writeUInt32LE(1, 64);
  elf.writeBigUInt64LE(4096n, 112);
  assert.ok(inspectElf(elf, 'liblame.so').errors.some((e) => e.includes('4096')));
  elf.writeBigUInt64LE(16384n, 112);
  assert.deepEqual(inspectElf(elf, 'libgood.so').errors, []);
  assert.ok(inspectElf(Buffer.alloc(10), 'broken.so').errors.length);
});
test('Android evidence and signing fail closed; commands never generate keys or upload', () => {
  assert.ok(androidReadinessErrors({}).length >= 3);
  assert.throws(() => validateSigningEnvironment({}, () => true));
  const signing = {
    APTLY_PILOT_KEYSTORE: '/tmp/existing.p12',
    APTLY_PILOT_STORE_PASSWORD: 'test',
    APTLY_PILOT_KEY_PASSWORD: 'test',
    APTLY_PILOT_KEY_ALIAS: 'existing',
  };
  assert.doesNotThrow(() => validateSigningEnvironment(signing, () => true));
  assert.throws(() => validateSigningEnvironment(signing, () => false));
  const commands = JSON.stringify(androidBuildCommands('/workspace'));
  assert.ok(commands.includes('bundleRelease'));
  assert.ok(!commands.includes('keytool'));
  assert.ok(!commands.includes('upload'));
  assert.ok(!commands.includes('prebuild'));
});

test('compiled permission flags retain neverForLocation and backup rules exclude secrets', () => {
  const m = fixture();
  m.manifest['uses-permission'][1].$['android:usesPermissionFlags'] = '0x00010000';
  assert.deepEqual(check(m), []);
  const require = createRequire(import.meta.url);
  const {
    backupRules,
    extractionRules,
  } = require('../../apps/mobile/plugins/withAndroidReadiness.cjs');
  for (const domain of ['root', 'file', 'sharedpref', 'database', 'external']) {
    assert.ok(backupRules.includes(`domain="${domain}" path="."`));
    assert.equal(extractionRules.split(`domain="${domain}" path="."`).length - 1, 2);
  }
  assert.ok(extractionRules.includes('<device-transfer>'));
});

test('release gate rejects missing target SDK and permissions restricted on newer devices', () => {
  for (const target of [undefined, 'unknown', '35', '36.5']) {
    const m = fixture();
    m.manifest['uses-sdk'][0].$['android:targetSdkVersion'] = target;
    assert.ok(check(m).some((error) => error.includes('Target SDK')));
  }
  for (const name of ['BLUETOOTH', 'BLUETOOTH_ADMIN', 'NEARBY_WIFI_DEVICES']) {
    const m = fixture();
    m.manifest['uses-permission'] = m.manifest['uses-permission'].filter(
      (row) => row.$['android:name'] !== `android.permission.${name}`,
    );
    assert.ok(check(m).some((error) => error.includes(name)));
  }
  for (const name of ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'BLUETOOTH_SCAN']) {
    const m = fixture();
    m.manifest['uses-permission'].find(
      (row) => row.$['android:name'] === `android.permission.${name}`,
    ).$['android:maxSdkVersion'] = '30';
    assert.ok(check(m).some((error) => error.includes('does not cover')));
  }
});

test('signature exception accepts only self-signed trust errors, not invalid certificates', () => {
  const output =
    '\njar verified, with signer errors.\n\nError: \nThis jar contains entries whose certificate chain is invalid. Reason: PKIX path building failed: unable to find valid certification path\nThis jar contains entries whose signer certificate is self-signed.\n\nWarning: \nNo timestamp.\n';
  assert.equal(signatureAccepted({ status: 4, stdout: output }), true);
  assert.equal(signatureAccepted({ status: 0, stdout: 'jar verified.' }), true);
  for (const message of [
    'signer certificate has expired.',
    'signer certificate is not yet valid.',
    'disabled signature algorithm.',
    'unexpected severe signer failure.',
  ]) {
    assert.equal(
      signatureAccepted({
        status: 4,
        stdout: output.replace('\nWarning:', `\n${message}\nWarning:`),
      }),
      false,
    );
  }
  assert.equal(signatureAccepted({ status: 16, stdout: output }), false);
  assert.equal(
    signatureAccepted({ status: 4, stdout: 'jar verified, with signer errors.' }),
    false,
  );
});
