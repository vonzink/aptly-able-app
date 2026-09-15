import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { validateStoreEnvironment, readinessErrors } from './ios-store-config.mjs';
import { readPlist, verifyArchive } from './verify-ios-store.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export function buildCommands({ mode, archive, exportPath, exportOptions, unsigned }) {
  if (mode === 'export')
    return [
      [
        'xcodebuild',
        [
          '-exportArchive',
          '-archivePath',
          archive,
          '-exportPath',
          exportPath,
          '-exportOptionsPlist',
          exportOptions,
        ],
      ],
    ];
  return [
    ...['@aptly/contracts', '@aptly/api-client', '@aptly/product-content'].map((pkg) => [
      'pnpm',
      ['--filter', pkg, 'build'],
    ]),
    [
      'xcodebuild',
      [
        'archive',
        '-workspace',
        resolve(root, 'apps/mobile/ios/AptlyAble.xcworkspace'),
        '-scheme',
        'AptlyAble',
        '-configuration',
        'Release',
        '-destination',
        'generic/platform=iOS',
        '-archivePath',
        archive,
        '-derivedDataPath',
        resolve(root, '.local/store/DerivedData'),
        ...(unsigned ? ['CODE_SIGNING_ALLOWED=NO', 'CODE_SIGNING_REQUIRED=NO'] : []),
      ],
    ],
  ];
}
export function validateExportOptions(options) {
  if (options.method !== 'app-store-connect' || options.destination !== 'export')
    throw new Error(
      'Export options must use method=app-store-connect and destination=export; upload is never supported.',
    );
  if (
    options.signingStyle !== 'manual' ||
    !/^[A-Z0-9]{10}$/.test(options.teamID ?? '') ||
    !options.provisioningProfiles?.['com.aptlyable.mobile']
  )
    throw new Error(
      'Supply explicit manual distribution teamID and com.aptlyable.mobile provisioning profile in your export options; automatic signing/provisioning is not supported.',
    );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const mode = args[0] ?? 'archive';
    if (!['archive', 'export'].includes(mode))
      throw new Error(
        'Usage: ios-store.mjs archive|export [--archive PATH] [--unsigned] [--execute] [--export-options PATH] [--export-path PATH]. Default is dry-run.',
      );
    const option = (key) => {
      const i = args.indexOf(key);
      if (i < 0) return undefined;
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${key}`);
      return args[i + 1];
    };
    const profile = validateStoreEnvironment(process.env);
    const unsigned = args.includes('--unsigned');
    if (mode === 'export' && unsigned)
      throw new Error('Unsigned archives cannot be exported for distribution.');
    if (mode === 'export' && !option('--archive'))
      throw new Error('Export requires explicit --archive PATH.');
    const archive = resolve(
      option('--archive') ??
        resolve(
          root,
          `.local/store/AptlyAble-${new Date().toISOString().replaceAll(':', '-')}.xcarchive`,
        ),
    );
    const exportOptions = option('--export-options') && resolve(option('--export-options'));
    if (mode === 'export') {
      if (!exportOptions)
        throw new Error(
          'Export requires --export-options with owner-supplied manual App Store distribution settings.',
        );
      validateExportOptions(readPlist(exportOptions));
    }
    const metadata = JSON.parse(
      readFileSync(resolve(root, 'apps/mobile/store-readiness.json'), 'utf8'),
    );
    const blockers = readinessErrors(metadata, (p) => existsSync(resolve(root, p)));
    const commands = buildCommands({
      mode,
      archive,
      unsigned,
      exportOptions,
      exportPath: resolve(option('--export-path') ?? resolve(root, '.local/store/export')),
    });
    console.log(
      JSON.stringify({ dryRun: !args.includes('--execute'), profile, blockers, commands }, null, 2),
    );
    if (args.includes('--execute')) {
      if (process.platform !== 'darwin') throw new Error('Execution requires macOS/Xcode.');
      if (!unsigned && blockers.length) throw new Error(blockers.join('\n'));
      if (mode === 'archive') {
        if (existsSync(archive))
          throw new Error(
            'Archive already exists; use a fresh path to preserve the prior artifact.',
          );
        const info = readPlist(resolve(root, 'apps/mobile/ios/AptlyAble/Info.plist'));
        if (
          info.AptlyReleaseChannel !== 'store' ||
          info.AptlyRecorderMode !== 'native' ||
          info.AptlyAPIOrigin !== profile.origin ||
          info.AptlyPlaudWifiTransferEnabled !== profile.wifi
        )
          throw new Error(
            'Native generation is stale: run store-environment expo prebuild --platform ios --no-clean and pod install explicitly, then retry. This command never regenerates native projects.',
          );
        const pods = readFileSync(resolve(root, 'apps/mobile/ios/Podfile.lock'), 'utf8');
        for (const pod of ['EXApplication', 'ExpoClipboard'])
          if (!pods.includes(`- ${pod} (`))
            throw new Error(
              `Native dependency drift: ${pod} missing from Podfile.lock. Regenerate/install Pods before archive.`,
            );
      } else {
        const result = verifyArchive(archive);
        if (result.errors.length) throw new Error(result.errors.join('\n'));
      }
      const env = {
        ...process.env,
        EXPO_NO_DOTENV: '1',
        NODE_ENV: 'production',
        FORCE_BUNDLING: '1',
      };
      delete env.SKIP_BUNDLING;
      for (const [command, commandArgs] of commands)
        execFileSync(command, commandArgs, {
          cwd: root,
          env,
          stdio: 'inherit',
          timeout: 20 * 60 * 1000,
        });
      if (mode === 'archive') {
        const result = verifyArchive(archive, { unsigned });
        console.log(JSON.stringify(result, null, 2));
        if (result.errors.length)
          throw new Error('Archive produced but store verification failed; see blockers above.');
      }
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
