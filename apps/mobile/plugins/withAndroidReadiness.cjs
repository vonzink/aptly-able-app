/* global require, module, process, URL */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('expo/config-plugins');
const domains = ['root', 'file', 'database', 'sharedpref', 'external'];
const excludes = domains.map((domain) => `    <exclude domain="${domain}" path="." />`).join('\n');
// Exclude both cloud backup and device transfer: vendor preferences may contain
// authentication data; recordings remain exportable through the app's Share action.
const backupRules = `<full-backup-content>\n${excludes}\n</full-backup-content>\n`;
const extractionRules = `<data-extraction-rules>\n  <cloud-backup>\n${excludes}\n  </cloud-backup>\n  <device-transfer>\n${excludes}\n  </device-transfer>\n</data-extraction-rules>\n`;
module.exports = function withAndroidReadiness(config) {
  config = withAndroidManifest(config, (result) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(result.modResults);
    AndroidConfig.Manifest.ensureToolsAvailable(result.modResults);
    app.$['android:allowBackup'] = 'false';
    app.$['android:fullBackupContent'] = '@xml/aptly_backup_rules';
    app.$['android:dataExtractionRules'] = '@xml/aptly_data_extraction_rules';
    const overrides = new Set((app.$['tools:replace'] ?? '').split(',').filter(Boolean));
    for (const key of [
      'android:allowBackup',
      'android:fullBackupContent',
      'android:dataExtractionRules',
    ])
      overrides.add(key);
    app.$['tools:replace'] = [...overrides].join(',');
    const metadata = {
      'com.aptlyable.releaseChannel': config.extra?.releaseChannel ?? 'pilot',
      'com.aptlyable.recorderMode': config.extra?.recorderMode ?? 'native',
      'com.aptlyable.apiOrigin':
        config.extra?.releaseChannel === 'store'
          ? new URL(process.env.EXPO_PUBLIC_API_URL).origin
          : '',
    };
    for (const [name, value] of Object.entries(metadata))
      AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, name, value);
    return result;
  });
  return withDangerousMod(config, [
    'android',
    async (result) => {
      const { mkdir, writeFile } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const path = join(result.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      await mkdir(path, { recursive: true });
      await writeFile(join(path, 'aptly_backup_rules.xml'), backupRules);
      await writeFile(join(path, 'aptly_data_extraction_rules.xml'), extractionRules);
      return result;
    },
  ]);
};
module.exports.backupRules = backupRules;
module.exports.extractionRules = extractionRules;
