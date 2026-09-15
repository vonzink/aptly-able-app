import { expect, it } from 'vitest';
import { transferRecovery } from '../src/features/plaud-device/transfer-recovery';

it('offers retry only when a failed native operation has actually released the lane', () => {
  expect(
    transferRecovery({ phase: 'error', busy: true, restartRequired: false, message: null }),
  ).toBeNull();
  expect(
    transferRecovery({
      phase: 'error',
      busy: false,
      restartRequired: false,
      message: 'Keep it nearby.',
    })?.action,
  ).toBe('retry');
  expect(
    transferRecovery({ phase: 'syncing', busy: true, restartRequired: false, message: null }),
  ).toBeNull();
});

it('prioritizes restart guidance even after reconnect or a recording event changes the displayed phase', () => {
  for (const phase of ['error', 'waiting', 'recording'] as const) {
    const recovery = transferRecovery({ phase, busy: true, restartRequired: true, message: null });
    expect(recovery?.action).toBe('restart-app');
  }
});
