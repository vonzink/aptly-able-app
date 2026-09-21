import type { EnrollmentSnapshot } from '../enrollment/enrollment-controller';
import type {
  PlaudDevicePhase,
  PlaudDeviceSnapshot,
} from '../plaud-device/plaud-device-controller';
import type { PlaudSyncSnapshot } from '../plaud-device/plaud-sync-model';
import { safeConnectionDetail, safeConnectionStage } from '../plaud-device/connection-diagnostics';

export const permissionLabels = {
  granted: 'Allowed',
  'not-granted': 'Not allowed',
  'not-determined': 'Not requested yet',
  restricted: 'Restricted by this phone',
  unavailable: 'Phone app required',
  unknown: 'Could not check',
} as const;
export type RecorderPermission = keyof typeof permissionLabels;

export interface DiagnosticBuild {
  platform: 'ios' | 'android' | 'web' | 'unknown';
  version: string | null;
  buildNumber: string | null;
  osVersion: string | null;
  mode: 'pilot' | 'development' | 'simulation';
}

const connectionLabels: Record<PlaudDevicePhase, string> = {
  unavailable: 'Phone app required',
  'signed-out': 'Sign in required',
  'needs-enrollment': 'Enrollment required',
  idle: 'Ready to connect',
  preparing: 'Preparing',
  scanning: 'Searching',
  found: 'Recorder found',
  binding: 'Pairing',
  connecting: 'Connecting',
  ready: 'Connected',
  disconnecting: 'Disconnecting',
  disconnected: 'Disconnected',
  unpairing: 'Unpairing',
  unpaired: 'Unpaired',
  error: 'Needs attention',
};
const transferLabels: Record<PlaudSyncSnapshot['phase'], string> = {
  unavailable: 'Unavailable',
  waiting: 'Waiting for recorder',
  checking: 'Checking recorder',
  'connecting-wifi': 'Connecting Wi-Fi',
  syncing: 'Receiving audio',
  saving: 'Saving audio',
  recording: 'Recording',
  idle: 'Idle',
  error: 'Needs attention',
};
function label(labels: Record<string, string>, value: string): string {
  return Object.hasOwn(labels, value) ? labels[value]! : 'Unknown';
}

/** Read-only native getter: never requests permissions, scans or initializes the SDK. */
export function readRecorderPermission(
  available: boolean,
  read?: () => unknown,
): RecorderPermission {
  if (!available) return 'unavailable';
  try {
    const value = read?.();
    return typeof value === 'string' && Object.hasOwn(permissionLabels, value)
      ? (value as RecorderPermission)
      : 'unknown';
  } catch {
    return 'unknown';
  }
}

export function recorderConnectionLabel(device: PlaudDeviceSnapshot): string {
  if (device.release && device.phase !== 'unpairing') return 'Unpairing incomplete';
  return label(connectionLabels, device.phase);
}

// Runtime version fields are bounded, single-line values. No config, URLs or device IDs.
function version(value: string | null): string {
  return value && /^[0-9][0-9A-Za-z.()+_-]{0,39}$/.test(value) ? value : 'Unavailable';
}
export function appVersionLabel(build: DiagnosticBuild): string {
  return build.platform === 'web'
    ? `Web · ${version(build.version)}`
    : `${version(build.version)} · Build ${version(build.buildNumber)}`;
}

/** Explicit allowlist. Never serialize snapshots, free-text errors, enrollment or SDK payloads. */
export function createDiagnosticsReport({
  build,
  enrollment,
  device,
  sync,
  permission,
}: {
  build: DiagnosticBuild;
  enrollment: EnrollmentSnapshot;
  device: PlaudDeviceSnapshot;
  sync: PlaudSyncSnapshot;
  permission: RecorderPermission;
}): string {
  return [
    'Aptly Able diagnostics · format 2',
    `Platform: ${label({ ios: 'iOS', android: 'Android', web: 'Web', unknown: 'Unknown' }, build.platform)}`,
    `Version: ${version(build.version)}`,
    `Build: ${build.platform === 'web' ? 'Not applicable (web)' : version(build.buildNumber)}`,
    `OS / Android API level: ${version(build.osVersion)}`,
    `Mode: ${label({ pilot: 'Pilot', development: 'Development', simulation: 'Simulation' }, build.mode)}`,
    `Account: ${enrollment.phase === 'signing-in' ? 'Signing in' : enrollment.actorId ? 'Signed in' : 'Signed out'}`,
    `Recorder: ${recorderConnectionLabel(device)}`,
    `Setup stage: ${safeConnectionStage(device.connection?.stage) ?? 'Not reported'}`,
    `Setup result: ${safeConnectionDetail(device.connection?.detail) ?? 'Not reported'}`,
    `Bluetooth confirmed: ${device.connection?.bluetooth === true ? 'Yes' : 'No'}`,
    `Pairing confirmed: ${device.connection?.binding === true ? 'Yes' : 'No'}`,
    `Recorder ready confirmed: ${device.connection?.deviceReady === true ? 'Yes' : 'No'}`,
    `Model: ${device.assignment ? label({ notepins: 'Plaud NotePin S', notepro: 'Plaud Note Pro' }, device.assignment.model) : 'Not loaded'}`,
    `Permissions: ${label(permissionLabels, permission)}`,
    `Transfer: ${label(transferLabels, sync.phase)}`,
    `Transport: ${label({ bluetooth: 'Bluetooth', wifi: 'Wi-Fi' }, sync.transport)}`,
    'Recording content, account details and recorder identifiers are excluded.',
  ].join('\n');
}
