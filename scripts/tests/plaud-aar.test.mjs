import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { inspectPlaudAar } from '../inspect-plaud-aar.mjs';
import { readinessErrors } from '../ios-store-config.mjs';
import { sdkHashMatches } from '../sdk-artifact-checks.mjs';

function candidate(t, { alignment = 16384n, omit = '', abi = 'arm64-v8a' } = {}) {
  const scratch = mkdtempSync(join(tmpdir(), 'aptly-aar-test-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const put = (name, content) => {
    const path = join(scratch, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  };
  for (const name of [
    'sdk/PlaudDeviceAgent',
    'sdk/PlaudDeviceAgentListener',
    'sdk/NiceBuildSdk',
    'sdk/audio/AudioExportFormat',
    'sdk/audio/AudioExporter$ExportCallback',
    'sdk/ble/wifi/IWifiTransferAgent',
    'com/tinnotech/penblesdk/TntAgent',
    'com/tinnotech/penblesdk/Constants$DeviceStatus',
    'com/tinnotech/penblesdk/entity/BleDevice',
    'com/tinnotech/penblesdk/entity/BleFile',
  ]) {
    if (name !== omit) put(`classes/${name}.class`, 'class presence fixture only');
  }
  put('aar/AndroidManifest.xml', '<manifest />');
  const elf = Buffer.alloc(120);
  elf.write('\x7fELF');
  elf[4] = 2;
  elf[5] = 1;
  elf.writeBigUInt64LE(64n, 32);
  elf.writeUInt16LE(56, 54);
  elf.writeUInt16LE(1, 56);
  elf.writeUInt32LE(1, 64);
  elf.writeBigUInt64LE(alignment, 112);
  put(`aar/jni/${abi}/libcodec.so`, elf);
  execFileSync('zip', ['-qr', join(scratch, 'aar/classes.jar'), '.'], {
    cwd: join(scratch, 'classes'),
  });
  const path = join(scratch, 'candidate.aar');
  execFileSync('zip', ['-qr', path, '.'], { cwd: join(scratch, 'aar') });
  const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
  return { path, hash, scratch };
}

test('intake checks actual nested archive and native bytes without installing an SDK', (t) => {
  const { path, hash } = candidate(t);
  const result = inspectPlaudAar(path, hash);
  assert.equal(result.sha256, hash);
  assert.deepEqual(result.errors, []);
  assert.equal(result.libraries[0].elf64Checked, true);
  assert.match(result.note, /Static intake only/);
});

test('a checksum match never bypasses 4 KB native alignment or a removed bridge API', (t) => {
  const { path, hash } = candidate(t, {
    alignment: 4096n,
    omit: 'com/tinnotech/penblesdk/TntAgent',
  });
  const result = inspectPlaudAar(path, hash);
  assert.equal(result.checksumMatches, true);
  assert.ok(result.errors.some((message) => message.includes('alignment 4096')));
  assert.ok(result.errors.some((message) => message.includes('TntAgent')));
});

test('missing ARM64 and mismatched or absent expected digests fail intake', (t) => {
  const { path, hash } = candidate(t, { abi: 'x86_64' });
  assert.ok(inspectPlaudAar(path, hash).errors.some((message) => message.includes('No arm64')));
  assert.throws(() => inspectPlaudAar(path, '0'.repeat(64)), /SHA-256 mismatch/);
  assert.throws(() => inspectPlaudAar(path), /Supply the SHA-256/);
});

test('an archive path outside the archive root is rejected', (t) => {
  const { path, scratch } = candidate(t);
  writeFileSync(join(scratch, 'outside'), 'fixture');
  execFileSync('zip', ['-q', path, '../outside'], { cwd: join(scratch, 'aar') });
  const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
  assert.throws(() => inspectPlaudAar(path, hash), /unsafe/);
});

test('both stores require binary distribution review separately from privacy review', () => {
  const metadata = { providerPrivacyReviewed: true };
  assert.ok(
    readinessErrors(metadata, () => true).some((e) => e.includes('providerDistributionReviewed')),
  );
  metadata.providerDistributionReviewed = true;
  assert.ok(
    !readinessErrors(metadata, () => true).some((e) => e.includes('providerDistributionReviewed')),
  );
});

test('SDK pin check rejects changed binary bytes, missing pins and malformed digests', () => {
  const bytes = Buffer.from('reviewed vendor binary');
  const hash = createHash('sha256').update(bytes).digest('hex');
  assert.equal(sdkHashMatches(bytes, hash), true);
  assert.equal(sdkHashMatches(bytes, hash.toUpperCase()), true);
  assert.equal(sdkHashMatches(Buffer.from('replacement'), hash), false);
  assert.equal(sdkHashMatches(bytes, undefined), false);
  assert.equal(sdkHashMatches(bytes, 'not-a-checksum'), false);
});
