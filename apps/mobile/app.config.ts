import type { ExpoConfig } from 'expo/config';
import { withSettingsGradle } from 'expo/config-plugins';
import release from './release.json';

// Only the separate Android emulator build opts into simulation. Phone builds default to native.
const androidPreview = process.env.APTLY_ANDROID_PREVIEW === '1';
const iosWifiTransfer = process.env.APTLY_IOS_BLUETOOTH_ONLY !== '1';

const config: ExpoConfig = {
  name: androidPreview ? 'Aptly Able Preview' : 'Aptly Able',
  slug: 'aptly-able',
  version: release.version,
  icon: './assets/app-icon.png',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  scheme: androidPreview ? 'aptlyable-preview' : 'aptlyable',
  plugins: [
    './plugins/withPilotSigning.cjs',
    './plugins/withAppSchemes.cjs',
    './plugins/withPlaudIosTransfer.cjs',
    'expo-router',
    'expo-secure-store',
    [
      'expo-audio',
      { microphonePermission: false, recordAudioAndroid: false, enableBackgroundPlayback: false },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: { recorderMode: androidPreview ? 'mock' : 'native' },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.aptlyable.mobile',
    buildNumber: String(release.buildNumber),
    entitlements: iosWifiTransfer
      ? {
          'com.apple.developer.networking.HotspotConfiguration': true,
          'com.apple.developer.networking.wifi-info': true,
        }
      : {},
    infoPlist: {
      AptlyPlaudWifiTransferEnabled: iosWifiTransfer,
      ...(iosWifiTransfer
        ? {
            NSLocalNetworkUsageDescription:
              'Aptly Able connects to your Plaud recorder over Wi-Fi to receive recordings faster.',
            NSLocationWhenInUseUsageDescription:
              'Aptly Able uses this permission to identify your recorder’s Wi-Fi connection.',
          }
        : {}),
      NSBluetoothAlwaysUsageDescription:
        'Aptly Able uses Bluetooth to connect to your assigned Plaud recorder.',
      UIBackgroundModes: ['bluetooth-central'],
    },
  },
  android: {
    package: androidPreview ? 'com.aptlyable.mobile.preview' : 'com.aptlyable.mobile',
    versionCode: release.buildNumber,
  },
  web: { bundler: 'metro' },
};

export default withSettingsGradle(config, (result) => {
  const anchor = 'expoAutolinking.useExpoModules()';
  const marker = '// Aptly Able: emulator preview has no Plaud hardware SDK.';
  if (!result.modResults.contents.includes(marker)) {
    if (!result.modResults.contents.includes(anchor)) {
      throw new Error('Android autolinking template changed; review the preview SDK exclusion.');
    }
    result.modResults.contents = result.modResults.contents.replace(
      anchor,
      `${marker}\nif (System.getenv('APTLY_ANDROID_PREVIEW') == '1') {\n  expoAutolinking.exclude = ['plaud-sdk']\n}\n${anchor}`,
    );
  }
  return result;
});
