import { Buffer } from 'node:buffer';

const allowedPermissions = new Set(
  [
    'INTERNET',
    'MODIFY_AUDIO_SETTINGS',
    'VIBRATE',
    'ACCESS_WIFI_STATE',
    'CHANGE_WIFI_STATE',
    'NEARBY_WIFI_DEVICES',
    'ACCESS_NETWORK_STATE',
    'WAKE_LOCK',
    'BLUETOOTH',
    'BLUETOOTH_ADMIN',
    'BLUETOOTH_SCAN',
    'BLUETOOTH_CONNECT',
    'ACCESS_FINE_LOCATION',
    'ACCESS_COARSE_LOCATION',
    'CHANGE_NETWORK_STATE',
  ].map((name) => `android.permission.${name}`),
);
allowedPermissions.add('com.aptlyable.mobile.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION');

export function inspectAndroidManifest(document, { origin, version, versionCode }) {
  const errors = [];
  const manifest = document.manifest ?? {};
  const app = manifest.application?.[0] ?? {};
  const attrs = app.$ ?? {};
  if (manifest.$?.package !== 'com.aptlyable.mobile') errors.push('Unexpected application ID.');
  if (
    manifest.$?.['android:versionName'] !== version ||
    Number(manifest.$?.['android:versionCode']) !== versionCode
  )
    errors.push('Stale release version/name.');
  const sdk = manifest['uses-sdk']?.[0]?.$ ?? {};
  if (
    !Number.isInteger(Number(sdk['android:targetSdkVersion'])) ||
    Number(sdk['android:targetSdkVersion']) < 36
  )
    errors.push('Target SDK must be 36 or newer.');
  if (Number(sdk['android:minSdkVersion']) !== 24)
    errors.push('Review the changed minimum SDK/support matrix.');
  if (attrs['android:debuggable'] === 'true' || attrs['android:testOnly'] === 'true')
    errors.push('Debug/test-only application cannot be released.');
  if (attrs['android:usesCleartextTraffic'] === 'true')
    errors.push('Global cleartext traffic must not be enabled.');
  if (attrs['android:allowBackup'] !== 'false')
    errors.push('Automatic backup must be disabled for SDK authentication data.');
  if (attrs['android:backupAgent'])
    errors.push(
      'Custom backup agents require separate privacy review; XML exclusions are insufficient.',
    );
  if (
    attrs['android:fullBackupContent'] !== '@xml/aptly_backup_rules' ||
    attrs['android:dataExtractionRules'] !== '@xml/aptly_data_extraction_rules'
  )
    errors.push('Missing explicit backup and device-transfer exclusions.');
  const permissions = [
    ...(manifest['uses-permission'] ?? []),
    ...(manifest['uses-permission-sdk-23'] ?? []),
  ];
  for (const row of permissions) {
    const name = row.$?.['android:name'];
    if (!allowedPermissions.has(name)) errors.push(`Unexpected permission: ${name}`);
    if (
      ['android.permission.BLUETOOTH', 'android.permission.BLUETOOTH_ADMIN'].includes(name) &&
      row.$['android:maxSdkVersion'] !== '30'
    )
      errors.push(`Legacy permission needs maxSdkVersion=30: ${name}`);
    if (
      ['android.permission.BLUETOOTH_SCAN', 'android.permission.NEARBY_WIFI_DEVICES'].includes(
        name,
      ) &&
      !(
        row.$['android:usesPermissionFlags']?.split('|').includes('neverForLocation') ||
        (Number(row.$['android:usesPermissionFlags']) & 0x10000) !== 0
      )
    )
      errors.push(`Missing neverForLocation flag: ${name}`);
  }
  const requiredCoverage = {
    INTERNET: [24, Infinity],
    BLUETOOTH: [24, 30],
    BLUETOOTH_ADMIN: [24, 30],
    BLUETOOTH_SCAN: [31, Infinity],
    BLUETOOTH_CONNECT: [31, Infinity],
    ACCESS_FINE_LOCATION: [24, Infinity],
    ACCESS_COARSE_LOCATION: [24, Infinity],
    NEARBY_WIFI_DEVICES: [33, Infinity],
    ACCESS_WIFI_STATE: [24, Infinity],
    CHANGE_WIFI_STATE: [24, Infinity],
    ACCESS_NETWORK_STATE: [24, Infinity],
    CHANGE_NETWORK_STATE: [24, Infinity],
  };
  for (const [name, [, lastSdk]] of Object.entries(requiredCoverage)) {
    const rows = permissions.filter((p) => p.$?.['android:name'] === `android.permission.${name}`);
    if (!rows.length) errors.push(`Missing SDK-required permission: ${name}`);
    else if (
      !rows.some((row) => {
        const limit = row.$['android:maxSdkVersion'];
        return limit === undefined || (Number.isInteger(Number(limit)) && Number(limit) >= lastSdk);
      })
    )
      errors.push(`SDK-required permission does not cover supported Android versions: ${name}`);
  }
  const metadata = Object.fromEntries(
    (app['meta-data'] ?? []).map((row) => [row.$?.['android:name'], row.$?.['android:value']]),
  );
  for (const [key, value] of Object.entries({
    releaseChannel: 'store',
    recorderMode: 'native',
    apiOrigin: origin,
  })) {
    if (metadata[`com.aptlyable.${key}`] !== value)
      errors.push(`Stale Android ${key}; regenerate native config in the store environment.`);
  }
  return errors;
}

export function inspectElf(data, name) {
  const errors = [],
    warnings = [];
  try {
    if (
      !Buffer.isBuffer(data) ||
      data.length < 64 ||
      data.subarray(0, 4).toString('hex') !== '7f454c46' ||
      data[4] !== 2 ||
      data[5] !== 1
    )
      throw new Error('Expected little-endian ELF64.');
    const offset = Number(data.readBigUInt64LE(32));
    const size = data.readUInt16LE(54),
      count = data.readUInt16LE(56);
    if (
      !count ||
      size < 56 ||
      !Number.isSafeInteger(offset) ||
      offset < 64 ||
      offset + count * size > data.length
    )
      throw new Error('Invalid program header table.');
    let loads = 0;
    for (let i = 0; i < count; i++) {
      const start = offset + i * size,
        type = data.readUInt32LE(start);
      if (type === 1) {
        loads++;
        const alignment = data.readBigUInt64LE(start + 48);
        if (alignment < 16384n || (alignment & (alignment - 1n)) !== 0n)
          errors.push(`${name}: ELF LOAD alignment ${alignment} is not 16 KB compatible.`);
        if ((data.readBigUInt64LE(start + 8) - data.readBigUInt64LE(start + 16)) % 16384n !== 0n)
          errors.push(`${name}: LOAD file/virtual offsets are not 16 KB congruent.`);
      }
      if (
        type === 0x6474e552 &&
        (data.readBigUInt64LE(start + 16) + data.readBigUInt64LE(start + 40)) % 16384n !== 0n
      )
        warnings.push(
          `${name}: RELRO end is not 16 KB aligned; require toolchain review and device evidence.`,
        );
    }
    if (!loads) throw new Error('No LOAD segments.');
  } catch (error) {
    errors.push(`${name}: ${error.message}`);
  }
  return { errors, warnings };
}

export function androidReadinessErrors(metadata) {
  return [
    'sdkLoggingReviewed',
    'dataSafetyReviewed',
    'pageSizeDeviceVerified',
    'signingIdentityReviewed',
  ]
    .filter((key) => metadata.android?.[key] !== true)
    .map((key) => `Android readiness blocked: ${key} needs recorded verification.`);
}

export function signatureAccepted(result) {
  if (result.error || ![0, 4].includes(result.status) || !result.stdout?.includes('jar verified'))
    return false;
  const text = `${result.stdout}\n${result.stderr ?? ''}`;
  if (/\b(disabled|expired)\b|not[- ]yet[- ]valid/i.test(text)) return false;
  if (result.status === 0) return true;
  // Android upload certificates are commonly self-signed. Only these two known
  // trust errors are exempted; all other strict verification errors fail closed.
  const section = text.split(/\nError:\s*\n/)[1]?.split(/\nWarning:\s*\n/)[0];
  if (!section) return false;
  const lines = section
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return (
    lines.some(
      (line) => line === 'This jar contains entries whose signer certificate is self-signed.',
    ) &&
    lines.every(
      (line) =>
        line === 'This jar contains entries whose signer certificate is self-signed.' ||
        line.startsWith(
          'This jar contains entries whose certificate chain is invalid. Reason: PKIX path building failed:',
        ),
    )
  );
}
