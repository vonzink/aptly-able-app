import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import { isAvailable, PlaudSdk } from '../../modules/plaud-sdk';
import { readRecorderPermission, type DiagnosticBuild } from '../features/settings/diagnostics';

export async function getDiagnosticBuild(): Promise<DiagnosticBuild> {
  // Loading new JS in an older development binary must not crash Settings.
  const application = requireOptionalNativeModule('ExpoApplication')
    ? await import('expo-application').catch(() => null)
    : null;
  return {
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    version: application?.nativeApplicationVersion ?? null,
    buildNumber: application?.nativeBuildVersion ?? null,
    osVersion: String(Platform.Version),
    mode:
      Constants.expoConfig?.extra?.recorderMode === 'mock'
        ? 'simulation'
        : process.env.EXPO_PUBLIC_AUTH_MODE === 'pilot'
          ? 'pilot'
          : 'development',
  };
}

export function getRecorderPermission() {
  return readRecorderPermission(isAvailable, PlaudSdk.getBluetoothPermissionStatus?.bind(PlaudSdk));
}

export async function copyDiagnostics(report: string): Promise<boolean> {
  try {
    if (!requireOptionalNativeModule('ExpoClipboard')) return false;
    const clipboard = await import('expo-clipboard');
    return await clipboard.setStringAsync(report);
  } catch {
    return false;
  }
}
