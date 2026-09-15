import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';

const mobile = createRequire(new URL('../../apps/mobile/package.json', import.meta.url));
const router = createRequire(mobile.resolve('expo-router/package.json'));
const queryPath = router.resolve('query-string');

test('router preserves enrollment tokens, Unicode labels and repeated query values', () => {
  const query = router('query-string');
  const parsed = query.parseUrl(
    'aptlyable://enroll?token=a_B-9&label=Jos%C3%A9+Smith&tag=one&tag=two#setup',
    { parseFragmentIdentifier: true },
  );
  assert.equal(parsed.url, 'aptlyable://enroll');
  assert.equal(parsed.query.token, 'a_B-9');
  assert.equal(parsed.query.label, 'José Smith');
  assert.deepEqual(parsed.query.tag, ['one', 'two']);
  assert.equal(parsed.fragmentIdentifier, 'setup');
  assert.equal(
    query.parse(query.stringify({ token: 'a_B-9', label: 'a+b / café' })).label,
    'a+b / café',
  );
});

test('malformed percent-encoded links finish without freezing the router', () => {
  // Separate bounded process: a regression must fail instead of hanging the test runner.
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      "const q = require(process.argv[1]); q.parse('label=' + '%80'.repeat(2048));",
      queryPath,
    ],
    { timeout: 2000, killSignal: 'SIGKILL', encoding: 'utf8' },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});

test('Xcode project IDs remain compatible with the patched UUID dependency', () => {
  const expo = createRequire(mobile.resolve('expo/package.json'));
  const plugins = createRequire(expo.resolve('@expo/config-plugins/package.json'));
  const xcode = plugins('xcode');
  const xcodeRequire = createRequire(plugins.resolve('xcode/package.json'));
  assert.equal(xcodeRequire('uuid/package.json').version, '11.1.1');
  const project = xcode.project(fileURLToPath(new URL('fixture.pbxproj', import.meta.url)));
  project.hash = { project: { objects: {} } };
  const ids = Array.from({ length: 100 }, () => project.generateUuid());
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[A-F0-9]{24}$/);
});
