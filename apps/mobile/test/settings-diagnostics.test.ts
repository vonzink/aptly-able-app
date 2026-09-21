import { describe, expect, it } from 'vitest';
import {
  createDiagnosticsReport,
  readRecorderPermission,
} from '../src/features/settings/diagnostics';
import type { EnrollmentSnapshot } from '../src/features/enrollment/enrollment-controller';
import type { PlaudDeviceSnapshot } from '../src/features/plaud-device/plaud-device-controller';
import type { PlaudSyncSnapshot } from '../src/features/plaud-device/plaud-sync-model';

const privateValue = 'PRIVATE-DO-NOT-COPY';
const enrollment: EnrollmentSnapshot = {
  phase: 'saved',
  hasInvitation: false,
  actorId: privateValue,
  accountEmail: `${privateValue}@example.com`,
  preview: null,
  operation: null,
  message: privateValue,
};
const device: PlaudDeviceSnapshot = {
  phase: 'ready',
  assignment: { serial: privateValue, model: 'notepins' },
  nearby: { uuid: privateValue, serialNumber: privateValue, name: privateValue },
  message: privateValue,
  cloudBound: true,
  pairingAttempted: true,
  connection: null,
  scanDisclosure: null,
  permissionDenied: false,
  release: null,
};
const sync: PlaudSyncSnapshot = {
  phase: 'error',
  progress: null,
  message: privateValue,
  activity: 'unknown',
  sessionId: 123456789,
  command: null,
  transport: 'bluetooth',
  wifiAvailable: true,
  controlsAvailable: true,
  completed: 0,
  total: 0,
  cancelling: false,
  busy: false,
  wifiQueued: false,
  restartRequired: false,
};
const input = {
  build: {
    platform: 'ios' as const,
    version: '0.1.0',
    buildNumber: '5',
    osVersion: '26.0',
    mode: 'pilot' as const,
  },
  enrollment,
  device,
  sync,
  permission: 'granted' as const,
};

describe('support diagnostics', () => {
  it('reports the last setup stage and missing confirmation after failure without exposing raw values', () => {
    const report = createDiagnosticsReport({
      ...input,
      device: {
        ...device,
        phase: 'error',
        connection: {
          stage: 'first_handshake',
          detail: 'status_1',
          bluetooth: true,
          binding: false,
          deviceReady: false,
        },
      },
    });
    expect(report).toContain('Setup stage: first_handshake');
    expect(report).toContain('Setup result: status_1');
    expect(report).toContain('Bluetooth confirmed: Yes');
    expect(report).toContain('Pairing confirmed: No');
    expect(report).toContain('Recorder ready confirmed: No');
    const unsafe = createDiagnosticsReport({
      ...input,
      device: {
        ...device,
        connection: {
          stage: privateValue,
          detail: privateValue,
          bluetooth: false,
          binding: false,
          deviceReady: false,
        },
      },
    });
    expect(unsafe).not.toContain(privateValue);
  });
  it('copies useful state without private identifiers, account details or raw errors', () => {
    const report = createDiagnosticsReport(input);
    expect(report).toContain('0.1.0');
    expect(report).toContain('Build: 5');
    expect(report).toContain('Recorder: Connected');
    expect(report).toContain('Transfer: Needs attention');
    expect(report).toContain('Permissions: Allowed');
    expect(report).not.toContain(privateValue);
    expect(report).not.toContain('123456789');
  });

  it('distinguishes incomplete unpairing from a connected recorder', () => {
    const report = createDiagnosticsReport({
      ...input,
      device: {
        ...device,
        release: { cloud: true, device: false, assignment: false },
      },
    });
    expect(report).toContain('Recorder: Unpairing incomplete');
    expect(report).not.toContain('Recorder: Connected');
  });

  it('does not invent an installed build when native details are unavailable', () => {
    const report = createDiagnosticsReport({
      ...input,
      build: {
        ...input.build,
        version: null,
        buildNumber: null,
      },
    });
    expect(report).toContain('Build: Unavailable');
    expect(report).toContain('Version: Unavailable');
  });

  it('handles unknown state without serializing unexpected input', () => {
    const report = createDiagnosticsReport({
      ...input,
      device: {
        ...device,
        phase: privateValue as PlaudDeviceSnapshot['phase'],
      },
    });
    expect(report).toContain('Recorder: Unknown');
    expect(report).not.toContain(privateValue);
  });

  it('reports web as unavailable and older native builds as unknown without requesting access', () => {
    expect(readRecorderPermission(false)).toBe('unavailable');
    expect(readRecorderPermission(true)).toBe('unknown');
    expect(
      readRecorderPermission(true, () => {
        throw new Error(privateValue);
      }),
    ).toBe('unknown');
    expect(readRecorderPermission(true, () => privateValue)).toBe('unknown');
    expect(readRecorderPermission(true, () => 'not-determined')).toBe('not-determined');
    expect(readRecorderPermission(true, () => 'granted')).toBe('granted');
    expect(
      readRecorderPermission(false, () => {
        throw new Error('Must not call native');
      }),
    ).toBe('unavailable');
  });
});
