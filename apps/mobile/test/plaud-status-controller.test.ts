import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPlaudStatusController } from '../src/features/plaud-device/plaud-status-controller';
import type {
  PlaudStatusEvents,
  PlaudStatusPort,
} from '../src/features/plaud-device/plaud-status-port';

function harness(available = true) {
  const callbacks = new Map<keyof PlaudStatusEvents, (event: never) => void>();
  const request = vi.fn(async () => undefined);
  const port: PlaudStatusPort = {
    isAvailable: available,
    request,
    addListener(name, callback) {
      callbacks.set(name, callback as (event: never) => void);
      return {
        remove: () => {
          callbacks.delete(name);
        },
      };
    },
  };
  const controller = createPlaudStatusController(port, 100);
  const emit = <K extends keyof PlaudStatusEvents>(name: K, event: PlaudStatusEvents[K]) =>
    callbacks.get(name)?.(event as never);
  return { controller, request, callbacks, emit };
}

afterEach(() => vi.useRealTimers());

describe('recorder status', () => {
  it('waits for both SDK callbacks, rather than treating request dispatch as readings', async () => {
    vi.useFakeTimers();
    const h = harness();
    h.controller.setConnection('owner:recorder');
    await Promise.resolve();
    expect(h.controller.getSnapshot()).toMatchObject({
      refreshing: true,
      batteryPercent: null,
      storage: null,
    });
    h.emit('batteryState', { batteryPercent: 82, charging: true });
    expect(h.controller.getSnapshot().refreshing).toBe(true);
    h.emit('storageState', { totalBytes: 32000000000, freeBytes: 18000000000 });
    expect(h.controller.getSnapshot()).toMatchObject({
      refreshing: false,
      batteryPercent: 82,
      charging: true,
      message: null,
    });
    expect(vi.getTimerCount()).toBe(0);
    h.controller.setConnection(null);
  });

  it('accepts an empty battery and full storage and preserves charging on power-only updates', () => {
    vi.useFakeTimers();
    const h = harness();
    h.controller.setConnection('owner:recorder');
    h.emit('batteryState', { batteryPercent: 100, charging: true });
    h.emit('batteryState', { batteryPercent: 0 });
    h.emit('storageState', { totalBytes: 32000000000, freeBytes: 0 });
    expect(h.controller.getSnapshot()).toMatchObject({
      batteryPercent: 0,
      charging: true,
      storage: { freeBytes: 0 },
      refreshing: false,
    });
    h.controller.setConnection(null);
  });

  it('rejects invalid values and stops waiting with a partial reading', async () => {
    vi.useFakeTimers();
    const h = harness();
    h.controller.setConnection('owner:recorder');
    for (const batteryPercent of [-1, 101, NaN, Infinity, 1.2])
      h.emit('batteryState', { batteryPercent });
    for (const [totalBytes, freeBytes] of [
      [0, 0],
      [10, 11],
      [10, -1],
      [NaN, 0],
      [Infinity, 0],
      [1.1, 0],
    ] as const) {
      h.emit('storageState', { totalBytes, freeBytes });
    }
    expect(h.controller.getSnapshot()).toMatchObject({ batteryPercent: null, storage: null });
    h.emit('batteryState', { batteryPercent: 42 });
    await vi.advanceTimersByTimeAsync(100);
    expect(h.controller.getSnapshot()).toMatchObject({
      batteryPercent: 42,
      storage: null,
      refreshing: false,
    });
    expect(h.controller.getSnapshot().message).toContain('unavailable');
    h.controller.refresh();
    h.emit('batteryState', { batteryPercent: 41, charging: false });
    h.emit('storageState', { totalBytes: 100, freeBytes: 50 });
    expect(h.controller.getSnapshot()).toMatchObject({ refreshing: false, message: null });
    h.controller.setConnection(null);
  });

  it('clears readings and ignores detached listeners and rejected requests from another connection', async () => {
    vi.useFakeTimers();
    const h = harness();
    let reject!: (error: Error) => void;
    h.request.mockImplementationOnce(
      () =>
        new Promise<undefined>((_, no) => {
          reject = no;
        }),
    );
    h.controller.setConnection('owner:first');
    const oldBattery = h.callbacks.get('batteryState')!;
    h.emit('batteryState', { batteryPercent: 82, charging: true });
    h.controller.setConnection('owner:second');
    oldBattery({ batteryPercent: 12 } as never);
    reject(new Error('Old request failed'));
    await Promise.resolve();
    await Promise.resolve();
    expect(h.controller.getSnapshot()).toMatchObject({
      batteryPercent: null,
      charging: null,
      refreshing: true,
      message: null,
    });
    h.controller.setConnection(null);
    expect(h.callbacks.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('supports effect cleanup and reattachment without leaking subscriptions or duplicating a pending refresh', () => {
    vi.useFakeTimers();
    const h = harness();
    h.controller.setConnection('owner:recorder');
    h.controller.setConnection(null);
    h.controller.setConnection('owner:recorder');
    h.controller.refresh();
    expect(h.request).toHaveBeenCalledTimes(2);
    expect(h.callbacks.size).toBe(2);
    expect(vi.getTimerCount()).toBe(1);
    h.controller.setConnection(null);
  });

  it('keeps last readings and offers retry when a refresh fails', async () => {
    vi.useFakeTimers();
    const h = harness();
    h.controller.setConnection('owner:recorder');
    h.emit('batteryState', { batteryPercent: 82 });
    h.emit('storageState', { totalBytes: 100, freeBytes: 50 });
    h.request.mockRejectedValueOnce(new Error('Bluetooth busy'));
    h.controller.refresh();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.controller.getSnapshot()).toMatchObject({ refreshing: false, batteryPercent: 82 });
    expect(h.controller.getSnapshot().message).toContain('last readings');
    expect(vi.getTimerCount()).toBe(0);
    h.controller.setConnection(null);
  });

  it('handles a phone build without status support without making native calls', () => {
    const h = harness(false);
    h.controller.setConnection('owner:recorder');
    expect(h.request).not.toHaveBeenCalled();
    expect(h.callbacks.size).toBe(0);
    expect(h.controller.getSnapshot()).toMatchObject({
      available: false,
      batteryPercent: null,
      refreshing: false,
    });
  });
});
