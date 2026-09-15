import Constants from 'expo-constants';
import { setStringAsync } from 'expo-clipboard';
import type { DiagnosticBuild, RecorderPermission } from '../features/settings/diagnostics';

export async function getDiagnosticBuild(): Promise<DiagnosticBuild> {
  return {
    platform: 'web',
    version: Constants.expoConfig?.version ?? null,
    buildNumber: null,
    osVersion: null,
    mode: process.env.EXPO_PUBLIC_AUTH_MODE === 'pilot' ? 'pilot' : 'development',
  };
}
export function getRecorderPermission(): RecorderPermission {
  return 'unavailable';
}
export async function copyDiagnostics(report: string): Promise<boolean> {
  try {
    // Start the clipboard write within the user's click; no asynchronous import on web.
    return await setStringAsync(report);
  } catch {
    return false;
  }
}
