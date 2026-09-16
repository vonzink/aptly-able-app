import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectAndroidBackupResources } from '../android-backup-checks.mjs';

const node = (name, child = [], attribute = []) => ({ element: { name, child, attribute } });
const rules = () =>
  ['root', 'file', 'database', 'sharedpref', 'external'].map((domain) =>
    node(
      'exclude',
      [],
      [
        { name: 'domain', value: domain },
        { name: 'path', value: '.' },
      ],
    ),
  );
const fixture = () => ({
  'base/res/xml/aptly_backup_rules.xml': node('full-backup-content', rules()),
  'base/res/xml/aptly_data_extraction_rules.xml': node('data-extraction-rules', [
    node('cloud-backup', rules()),
    node('device-transfer', rules()),
  ]),
});

test('packaged rules protect all supported backup scopes', () => {
  assert.deepEqual(inspectAndroidBackupResources(fixture()), []);
  for (const name of Object.keys(fixture())) {
    const resources = fixture();
    delete resources[name];
    assert.ok(inspectAndroidBackupResources(resources).some((error) => error.includes('Missing')));
  }
  for (const scope of [0, 1]) {
    const resources = fixture();
    const children = resources['base/res/xml/aptly_data_extraction_rules.xml'].element.child;
    children[scope].element.child.pop();
    assert.ok(inspectAndroidBackupResources(resources).some((error) => error.includes('external')));
  }
});

test('alternate resource qualifiers cannot weaken the default rules', () => {
  const resources = fixture();
  resources['base/res/xml-v31/aptly_backup_rules.xml'] = node('full-backup-content');
  assert.ok(inspectAndroidBackupResources(resources).some((error) => error.includes('xml-v31')));
});

test('malformed, partial or ambiguous exclusions fail closed', () => {
  const key = 'base/res/xml/aptly_backup_rules.xml';
  for (const replacement of [
    {},
    node('wrong-root', rules()),
    node('full-backup-content', [node('include'), ...rules()]),
    node(
      'full-backup-content',
      rules().map((rule) => ({
        element: {
          ...rule.element,
          attribute: [
            { name: 'domain', value: 'file' },
            { name: 'path', value: 'one.mp3' },
          ],
        },
      })),
    ),
  ])
    assert.ok(inspectAndroidBackupResources({ ...fixture(), [key]: replacement }).length);

  const resources = fixture();
  resources[key].element.child[0].element.attribute[0].namespaceUri = 'unexpected';
  assert.ok(inspectAndroidBackupResources(resources).length);
  const extraction = fixture();
  extraction['base/res/xml/aptly_data_extraction_rules.xml'].element.child.push(
    node('cloud-backup', rules()),
  );
  assert.ok(inspectAndroidBackupResources(extraction).length);
});
