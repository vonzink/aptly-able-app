import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { inspectElf } from './android-store-checks.mjs';

// Types currently referenced by the native bridge. Presence is only a first
// compatibility screen; it does not establish method signatures or behavior.
const bridgeTypes = [
  'sdk/PlaudDeviceAgent.class',
  'sdk/PlaudDeviceAgentListener.class',
  'sdk/NiceBuildSdk.class',
  'sdk/audio/AudioExportFormat.class',
  'sdk/audio/AudioExporter$ExportCallback.class',
  'sdk/ble/wifi/IWifiTransferAgent.class',
  'com/tinnotech/penblesdk/TntAgent.class',
  'com/tinnotech/penblesdk/Constants$DeviceStatus.class',
  'com/tinnotech/penblesdk/entity/BleDevice.class',
  'com/tinnotech/penblesdk/entity/BleFile.class',
];
const unzip = (args, limit = 64 * 1024 * 1024) =>
  execFileSync('unzip', args, {
    timeout: 30_000,
    maxBuffer: limit,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

function archiveEntries(path) {
  const names = unzip(['-Z1', path], 4 * 1024 * 1024)
    .toString()
    .trim()
    .split('\n');
  if (
    !names.length ||
    new Set(names).size !== names.length ||
    names.some(
      (name) =>
        !/^[A-Za-z0-9_$./-]+$/.test(name) ||
        name.startsWith('/') ||
        name.split('/').some((part) => part === '..' || part === '.'),
    )
  )
    throw new Error('Archive has duplicate, unsafe, or unsupported entry names.');
  return names;
}

export function inspectPlaudAar(path, expectedSha256) {
  if (!/^[a-f0-9]{64}$/i.test(expectedSha256 ?? ''))
    throw new Error('Supply the SHA-256 recorded for the candidate source.');
  const aar = resolve(path);
  const info = statSync(aar);
  if (!info.isFile() || info.size < 4 || info.size > 128 * 1024 * 1024)
    throw new Error('Expected an AAR file between 4 bytes and 128 MB.');
  const bytes = readFileSync(aar);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  // Stop before parsing an unexpected artifact. A matching digest identifies
  // bytes; it does not grant a license or prove vendor support/signing.
  if (sha256 !== expectedSha256.toLowerCase())
    throw new Error(`SHA-256 mismatch. Received ${sha256}.`);
  const entries = archiveEntries(aar);
  for (const name of ['AndroidManifest.xml', 'classes.jar'])
    if (!entries.includes(name)) throw new Error(`AAR is missing ${name}.`);
  const errors = [],
    warnings = [],
    libraries = [];
  const nativeEntries = entries.filter((name) => /^jni\/[^/]+\/[^/]+\.so$/.test(name));
  if (!nativeEntries.some((name) => name.startsWith('jni/arm64-v8a/')))
    errors.push('No arm64-v8a native libraries; the current phone release requires ARM64.');
  for (const name of nativeEntries.sort()) {
    const abi = name.split('/')[1];
    const data = unzip(['-p', aar, name]);
    const checked = ['arm64-v8a', 'x86_64'].includes(abi);
    const result = checked ? inspectElf(data, name) : { errors: [], warnings: [] };
    errors.push(...result.errors);
    warnings.push(...result.warnings);
    libraries.push({
      name,
      abi,
      sha256: createHash('sha256').update(data).digest('hex'),
      elf64Checked: checked,
      ...result,
    });
  }
  const scratch = mkdtempSync(join(tmpdir(), 'aptly-aar-intake-'));
  let missingBridgeTypes;
  try {
    const jar = join(scratch, 'classes.jar');
    // Stream only this named entry; never extract vendor paths into the project.
    writeFileSync(jar, unzip(['-p', aar, 'classes.jar']));
    const classes = new Set(archiveEntries(jar));
    missingBridgeTypes = bridgeTypes.filter((name) => !classes.has(name));
    errors.push(...missingBridgeTypes.map((name) => `Current bridge type missing: ${name}`));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  return {
    sha256,
    bytes: info.size,
    checksumMatches: true,
    libraries,
    missingBridgeTypes,
    reviewResources: entries.filter((name) => /license|notice|privacy|logback/i.test(name)),
    errors,
    warnings,
    note: 'Static intake only; all included ARM64/x86_64 libraries are checked. The current store build ships ARM64 only. No SDK was executed or installed. Compile/API review, license/support, release logging, cancellation, privacy, final APK/AAB packaging and device tests remain separate requirements.',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4)
      throw new Error('Usage: inspect-plaud-aar.mjs CANDIDATE.aar EXPECTED_SHA256');
    const result = inspectPlaudAar(process.argv[2], process.argv[3]);
    console.log(JSON.stringify(result, null, 2));
    if (result.errors.length) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
