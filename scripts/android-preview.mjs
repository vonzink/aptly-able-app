import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { error, log } from 'node:console';

const root = fileURLToPath(new URL('../', import.meta.url));
const sdk = process.env.ANDROID_HOME ?? resolve(root, '.local/android-sdk');
const env = {
  ...process.env,
  ANDROID_HOME: sdk,
  ANDROID_SDK_ROOT: sdk,
  ANDROID_AVD_HOME: process.env.ANDROID_AVD_HOME ?? resolve(root, '.local/android-development/avd'),
};
const run = (command, args, cwd = root) =>
  new Promise((done, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) =>
      code === 0 ? done() : reject(new Error(`${command} stopped (${signal ?? code}).`)),
    );
  });

try {
  const command = process.argv[2] ?? 'run';
  if (!['run', 'emulator', 'build'].includes(command))
    throw new Error('Usage: node scripts/android-preview.mjs [run|emulator|build]');
  if (!existsSync(resolve(sdk, 'platform-tools/adb')))
    throw new Error('Android SDK is missing. See docs/ANDROID_PREVIEW.md for setup.');
  if (command === 'emulator') {
    await run(resolve(sdk, 'emulator/emulator'), ['-avd', 'AptlyAble_API36', '-no-boot-anim']);
  } else {
    // Keep the preview independent of the working iPhone's Metro server and local .env files.
    Object.assign(env, {
      APTLY_ANDROID_PREVIEW: '1',
      EXPO_NO_DOTENV: '1',
      EXPO_PUBLIC_API_URL: 'http://10.0.2.2:4100',
      EXPO_PUBLIC_DEV_HTTP_ORIGIN: 'http://10.0.2.2:4100',
    });
    if (!env.JAVA_HOME && process.platform === 'darwin')
      env.JAVA_HOME = execFileSync('/usr/libexec/java_home', ['-v', '21'], {
        encoding: 'utf8',
      }).trim();
    const mobile = resolve(root, 'apps/mobile');
    let device;
    if (command === 'run') {
      const devices = execFileSync(resolve(sdk, 'platform-tools/adb'), ['devices'], {
        env,
        encoding: 'utf8',
      });
      device = devices.match(/^(emulator-\d+)\s+device$/m)?.[1];
      if (!device) throw new Error('Start the virtual phone first: pnpm android:emulator');
      // Expo selects Android devices by AVD name, whereas adb uses emulator serials.
      device = execFileSync(
        resolve(sdk, 'platform-tools/adb'),
        ['-s', device, 'emu', 'avd', 'name'],
        {
          env,
          encoding: 'utf8',
        },
      )
        .split(/\r?\n/)[0]
        .trim();
    }
    await run('pnpm', ['--filter', '@aptly/contracts', 'build']);
    await run('pnpm', ['--filter', '@aptly/api-client', 'build']);
    await run(
      'pnpm',
      ['exec', 'expo', 'prebuild', '--platform', 'android', '--no-install', '--no-clean'],
      mobile,
    );
    if (command === 'build') {
      await run(
        './gradlew',
        [
          ':app:assembleDebug',
          '-PreactNativeArchitectures=arm64-v8a',
          '-PreactNativeDevServerPort=8092',
        ],
        resolve(mobile, 'android'),
      );
      log('Preview APK: apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk');
    } else {
      await run(
        'pnpm',
        ['exec', 'expo', 'run:android', '--device', device, '--port', '8092'],
        mobile,
      );
    }
  }
} catch (cause) {
  error(cause instanceof Error ? cause.message : 'Android preview could not start.');
  process.exitCode = 1;
}
