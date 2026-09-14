import { describe, expect, it } from 'vitest';

import type { RecorderSummary } from '@aptly/contracts';

import { resolveRecorderMode } from '../src/bootstrap/recorder-mode';
import { createReplaySafeLifecycle } from '../src/bootstrap/recorder-lifecycle';
import type {
  RecorderAdapter,
  RecorderAdapterEvent,
} from '../src/features/recorder/recorder-adapter';
import { createRecorderController } from '../src/features/recorder/recorder-controller';

const recorder: RecorderSummary = {
  id: '2cb9f49a-b03b-4741-89b2-16007f4cd77f',
  name: 'Plaud Note Pro',
  model: 'notepro',
  serialSuffix: '4812',
  batteryPercent: 82,
  storageFreeBytes: 18_000_000_000,
  storageTotalBytes: 32_000_000_000,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function adapter(overrides: Partial<RecorderAdapter> = {}) {
  let listener: ((event: RecorderAdapterEvent) => void) | undefined;
  let unsubscribed = false;
  const value: RecorderAdapter = {
    mode: 'mock',
    scan: async () => [recorder],
    cancelScan: () => undefined,
    connect: async (selected) => selected,
    disconnect: async () => undefined,
    subscribe: (next) => {
      listener = next;
      return () => {
        unsubscribed = true;
        listener = undefined;
      };
    },
    ...overrides,
  };
  return {
    value,
    emit(event: RecorderAdapterEvent) {
      listener?.(event);
    },
    wasUnsubscribed: () => unsubscribed,
  };
}

describe('recorder controller', () => {
  it('does not report a connection before the adapter resolves', async () => {
    const pending = deferred<RecorderSummary>();
    const testAdapter = adapter({ connect: () => pending.promise });
    const controller = createRecorderController(testAdapter.value);

    const connecting = controller.connect(recorder);
    expect(controller.getSnapshot().status).toBe('connecting');
    expect(controller.getSnapshot().connectedRecorder).toBeNull();

    pending.resolve(recorder);
    await connecting;
    expect(controller.getSnapshot().status).toBe('connected');
    expect(controller.getSnapshot().connectedRecorder?.id).toBe(recorder.id);
  });

  it('invalidates scan results that arrive after cancel', async () => {
    const pending = deferred<RecorderSummary[]>();
    const testAdapter = adapter({ scan: () => pending.promise });
    const controller = createRecorderController(testAdapter.value);

    const scanning = controller.scan();
    controller.cancel();
    pending.resolve([recorder]);
    await scanning;

    expect(controller.getSnapshot().status).toBe('idle');
    expect(controller.getSnapshot().recorders).toEqual([]);
  });

  it('ignores a connect completion after disconnect begins', async () => {
    const pending = deferred<RecorderSummary>();
    const testAdapter = adapter({ connect: () => pending.promise });
    const controller = createRecorderController(testAdapter.value);

    const connecting = controller.connect(recorder);
    await controller.disconnect();
    pending.resolve(recorder);
    await connecting;

    expect(controller.getSnapshot().status).toBe('idle');
    expect(controller.getSnapshot().connectedRecorder).toBeNull();
  });

  it('unsubscribes from adapter events and stops notifying listeners when disposed', () => {
    const testAdapter = adapter();
    const controller = createRecorderController(testAdapter.value);
    let notifications = 0;
    controller.subscribe(() => {
      notifications += 1;
    });

    controller.dispose();
    testAdapter.emit({ type: 'disconnected' });

    expect(testAdapter.wasUnsubscribed()).toBe(true);
    expect(notifications).toBe(0);
  });

  it('throws for real recorder mode instead of falling back to a simulation', () => {
    expect(() => resolveRecorderMode('real')).toThrow(
      'Real recorder support is not available in this build.',
    );
  });

  it('allows a rejected scan to be retried', async () => {
    let attempt = 0;
    const testAdapter = adapter({
      scan: async () => {
        attempt += 1;
        if (attempt === 1) throw new Error('radio unavailable');
        return [recorder];
      },
    });
    const controller = createRecorderController(testAdapter.value);

    await controller.scan();
    expect(controller.getSnapshot().status).toBe('error');
    expect(controller.getSnapshot().error).toBe(
      "Couldn't find your recorder. Make sure it's nearby and powered on.",
    );

    await controller.scan();
    expect(controller.getSnapshot().status).toBe('found');
    expect(controller.getSnapshot().recorders).toEqual([recorder]);
  });
});

describe('recorder provider lifecycle', () => {
  it('does not dispose the controller during a Strict Mode effect replay', () => {
    const scheduled: Array<() => void> = [];
    let disposals = 0;
    const lifecycle = createReplaySafeLifecycle({ dispose: () => (disposals += 1) }, (task) =>
      scheduled.push(task),
    );

    const firstCleanup = lifecycle.setup();
    firstCleanup();
    const finalCleanup = lifecycle.setup();
    scheduled.shift()?.();
    expect(disposals).toBe(0);

    finalCleanup();
    scheduled.shift()?.();
    expect(disposals).toBe(1);
  });
});
