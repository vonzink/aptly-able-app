import { spawn, execFileSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import console from 'node:console';

process.umask(0o077);
const root = fileURLToPath(new URL('../', import.meta.url));
const release = JSON.parse(readFileSync(resolve(root, 'apps/mobile/release.json'), 'utf8'));
const pilot = resolve(root, '.local/remote-pilot');
const workspace = resolve(root, 'apps/mobile/ios/AptlyAble.xcworkspace');
const env = { ...process.env };
const developmentTeam = process.env.APTLY_IOS_DEVELOPMENT_TEAM;
const wifiTransferEnabled = process.env.APTLY_IOS_BLUETOOTH_ONLY !== '1';
const readPlist = (path) =>
  JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', path], { encoding: 'utf8' }));
let logFd;
const run = (command, args) =>
  new Promise((done, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: ['ignore', logFd, logFd] });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0
        ? done()
        : reject(new Error(`${command} failed (${code}); see .local/remote-pilot/ios-build.log.`)),
    );
  });
try {
  if (process.platform !== 'darwin') throw new Error('iOS archive requires macOS and Xcode.');
  if (developmentTeam !== undefined && !/^[A-Z0-9]{10}$/.test(developmentTeam))
    throw new Error('APTLY_IOS_DEVELOPMENT_TEAM must be the intended 10-character Apple team ID.');
  const raw = process.env.EXPO_PUBLIC_API_URL;
  if (!raw) throw new Error('Set EXPO_PUBLIC_API_URL explicitly to the HTTPS pilot API origin.');
  const api = new URL(raw);
  if (
    api.protocol !== 'https:' ||
    api.username ||
    api.password ||
    api.search ||
    api.hash ||
    api.pathname !== '/' ||
    /^(localhost|127\.|\[::1\])/.test(api.hostname)
  )
    throw new Error(
      'Pilot API must be a public HTTPS origin only, without credentials, query, fragment or secrets.',
    );
  if (!existsSync(workspace) || !existsSync(resolve(root, 'apps/mobile/ios/Pods/Manifest.lock')))
    throw new Error(
      'Existing iOS workspace and installed Pods required. See docs/IOS_PILOT.md; this command does not regenerate or alter native signing.',
    );
  const nativeInfo = readPlist(resolve(root, 'apps/mobile/ios/AptlyAble/Info.plist'));
  const nativeEntitlements = readPlist(
    resolve(root, 'apps/mobile/ios/AptlyAble/AptlyAble.entitlements'),
  );
  const wifiKeys = [
    'com.apple.developer.networking.HotspotConfiguration',
    'com.apple.developer.networking.wifi-info',
  ];
  if (
    nativeInfo.AptlyPlaudWifiTransferEnabled !== wifiTransferEnabled ||
    wifiKeys.some((key) =>
      wifiTransferEnabled ? nativeEntitlements[key] !== true : key in nativeEntitlements,
    )
  )
    throw new Error(
      'Native Wi-Fi configuration differs from this build. Run non-clean iOS prebuild with the same APTLY_IOS_BLUETOOTH_ONLY setting; see docs/IOS_PILOT.md.',
    );
  for (const key of Object.keys(env)) if (key.startsWith('EXPO_PUBLIC_')) delete env[key];
  delete env.SKIP_BUNDLING;
  Object.assign(env, {
    EXPO_NO_DOTENV: '1',
    EXPO_PUBLIC_API_URL: api.origin,
    EXPO_PUBLIC_AUTH_MODE: 'pilot',
    NODE_ENV: 'production',
    FORCE_BUNDLING: '1',
    APTLY_ANDROID_PREVIEW: '0',
  });
  mkdirSync(pilot, { recursive: true });
  logFd = openSync(resolve(pilot, 'ios-build.log'), 'w', 0o600);
  console.log(
    `Building ${developmentTeam ? 'development-signed' : 'unsigned'} iOS Release archive (${wifiTransferEnabled ? 'Wi-Fi + Bluetooth' : 'Bluetooth only'}); progress log: .local/remote-pilot/ios-build.log`,
  );
  await run('node', ['scripts/check-plaud-sdk.mjs', 'ios']);
  await run('pnpm', ['--filter', '@aptly/contracts', 'build']);
  await run('pnpm', ['--filter', '@aptly/api-client', 'build']);
  // Each archive gets an isolated output. Derived data stays ignored and reusable.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archive = resolve(pilot, `ios/AptlyAble-${stamp}.xcarchive`);
  await run('xcodebuild', [
    'archive',
    '-quiet',
    '-workspace',
    workspace,
    '-scheme',
    'AptlyAble',
    '-configuration',
    'Release',
    '-destination',
    'generic/platform=iOS',
    '-archivePath',
    archive,
    '-derivedDataPath',
    resolve(pilot, 'ios/DerivedData'),
    ...(developmentTeam
      ? [
          '-allowProvisioningUpdates',
          `DEVELOPMENT_TEAM=${developmentTeam}`,
          'CODE_SIGN_STYLE=Automatic',
          'CODE_SIGN_IDENTITY=Apple Development',
        ]
      : ['CODE_SIGNING_ALLOWED=NO', 'CODE_SIGNING_REQUIRED=NO']),
    `MARKETING_VERSION=${release.version}`,
    `CURRENT_PROJECT_VERSION=${release.buildNumber}`,
  ]);
  const app = resolve(archive, 'Products/Applications/AptlyAble.app');
  const bundle = readFileSync(resolve(app, 'main.jsbundle'));
  if (!bundle.includes(Buffer.from(api.origin)))
    throw new Error('Archived JS bundle does not contain the configured pilot API origin.');
  const packageId = execFileSync(
    '/usr/libexec/PlistBuddy',
    ['-c', 'Print :CFBundleIdentifier', resolve(app, 'Info.plist')],
    { encoding: 'utf8' },
  ).trim();
  if (packageId !== 'com.aptlyable.mobile')
    throw new Error('Archive has an unexpected application identifier.');
  const readAppPlist = (key) =>
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, resolve(app, 'Info.plist')], {
      encoding: 'utf8',
    }).trim();
  const version = readAppPlist('CFBundleShortVersionString');
  const buildNumber = readAppPlist('CFBundleVersion');
  if (version !== release.version || buildNumber !== String(release.buildNumber))
    throw new Error(
      'Archive version differs from release.json. Regenerate the iOS project before archiving.',
    );
  if (readPlist(resolve(app, 'Info.plist')).AptlyPlaudWifiTransferEnabled !== wifiTransferEnabled)
    throw new Error('Archived app has an unexpected Wi-Fi capability setting.');
  if (developmentTeam) {
    execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'pipe' });
    const signature = execFileSync('codesign', ['-d', '--entitlements', ':-', app], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const signedEntitlements = JSON.parse(
      execFileSync('plutil', ['-convert', 'json', '-o', '-', '-'], {
        input: signature,
        encoding: 'utf8',
      }),
    );
    if (
      signedEntitlements['com.apple.developer.team-identifier'] !== developmentTeam ||
      !signedEntitlements['get-task-allow'] ||
      wifiKeys.some((key) =>
        wifiTransferEnabled ? signedEntitlements[key] !== true : key in signedEntitlements,
      ) ||
      !existsSync(resolve(app, 'embedded.mobileprovision'))
    )
      throw new Error('Signed app does not match the requested development team or capabilities.');
  }
  const metadata = {
    package: packageId,
    version,
    buildNumber,
    apiUrl: api.origin,
    authMode: 'pilot',
    builtAt: new Date().toISOString(),
    archive,
    app,
    bundleBytes: bundle.length,
    bundleSha256: createHash('sha256').update(bundle).digest('hex'),
    signed: !!developmentTeam,
    installable: !!developmentTeam,
    installationScope: developmentTeam
      ? 'devices allowed by the embedded development profile'
      : 'none',
    developmentTeam: developmentTeam ?? null,
    wifiTransferEnabled,
    testFlightReady: false,
    hardwareAcceptance: 'pending',
  };
  writeFileSync(resolve(pilot, 'ios-archive.json'), JSON.stringify(metadata, null, 2) + '\n');
  console.log(
    developmentTeam
      ? `Development-signed archive: ${archive}\nApp: ${app}\nFor provisioned devices only. Not installed, uploaded or TestFlight-distributed.`
      : `Unsigned archive compiled: ${archive}\nNot installable or TestFlight-distributable. See docs/IOS_PILOT.md for Apple signing steps.`,
  );
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : 'iOS pilot build failed.');
  process.exitCode = 1;
} finally {
  if (logFd !== undefined) closeSync(logFd);
}
