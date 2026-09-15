import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, type PlaudDeviceClient } from '@aptly/api-client';
import type { PlaudDeviceSession } from '@aptly/contracts';

import {
  createPlaudDeviceController,
  type PlaudDeviceController,
} from '../src/features/plaud-device/plaud-device-controller';
import type {
  PlaudNativeEvents,
  PlaudNativePort,
  PlaudNearbyDevice,
} from '../src/features/plaud-device/plaud-native-port';
import { plaudNative as webNative } from '../src/services/plaud-native.web';
import { getRecorderNotice } from '../src/features/plaud-device/recorder-notice';

const actorId = '201b4a9f-80dd-4b9b-bdd0-ac5e907ddc08';
const operationId = '600d7e5c-82f2-47e0-bf1d-9e88e4e3a780';
const device: PlaudNearbyDevice = {
  uuid: 'native-device-uuid',
  serialNumber: '882123456789',
  name: 'PLAUD NotePin S',
};
const session: PlaudDeviceSession = {
  userAccessToken: 'ephemeral-user-token',
  expiresAt: '2099-01-01T00:00:00.000Z',
  customDomain: 'platform-us.plaud.ai',
  userId: actorId,
  recorder: { serial: device.serialNumber, model: 'notepins' },
};
const penState = { state: 0, privacy: 0, keyState: 0, uDisk: 0 };
const bind = { sn: device.serialNumber, status: 0, protVersion: 1 };
const connected = { connected: true, failed: false, state: 1 };
const disconnected = { connected: false, failed: false, state: 0 };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const controllers: PlaudDeviceController[] = [];

function harness(
  overrides: Partial<PlaudDeviceClient> = {},
  nativeOverrides: Partial<PlaudNativePort> = {},
  onUnpaired = vi.fn<(identity: { actorId: string; operationId: string }) => Promise<void>>(
    async () => undefined,
  ),
) {
  const callbacks = new Map<keyof PlaudNativeEvents, Set<(event: unknown) => void>>();
  let nativeConnected = false;
  const emit = <K extends keyof PlaudNativeEvents>(name: K, event: PlaudNativeEvents[K]) => {
    if (name === 'connectState')
      nativeConnected = (event as PlaudNativeEvents['connectState']).connected;
    callbacks.get(name)?.forEach((listener) => listener(event));
  };
  const native: PlaudNativePort = {
    isAvailable: true,
    initSDK: vi.fn(async () => undefined),
    startScan: vi.fn(async () => undefined),
    stopScan: vi.fn(async () => undefined),
    connectBleDevice: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => emit('connectState', disconnected)),
    isConnected: vi.fn(async () => nativeConnected),
    unpair: vi.fn(async () => undefined),
    addListener: vi.fn(
      <K extends keyof PlaudNativeEvents>(
        name: K,
        listener: (event: PlaudNativeEvents[K]) => void,
      ) => {
        const listeners = callbacks.get(name) ?? new Set();
        const callback = listener as (event: unknown) => void;
        listeners.add(callback);
        callbacks.set(name, listeners);
        return {
          remove: () => {
            listeners.delete(callback);
          },
        };
      },
    ),
    ...nativeOverrides,
  };
  const client: PlaudDeviceClient = {
    capabilities: vi.fn(async () => ({ available: true, reason: 'ready' }) as const),
    session: vi.fn(async () => session),
    bind: vi.fn(async () => ({ status: 'bound' }) as const),
    unbind: vi.fn(async () => ({ status: 'unbound' }) as const),
    completeUnpair: vi.fn(async () => ({ status: 'released' }) as const),
    ...overrides,
  };
  const controller = createPlaudDeviceController({
    client,
    native,
    onUnpaired,
    timeouts: { requestMs: 1000, scanMs: 1000, handshakeMs: 1000, cleanupMs: 10 },
  });
  controllers.push(controller);
  controller.setEnrollment({ actorId, operationId, status: 'pending' });
  return { native, client, controller, emit, callbacks, onUnpaired };
}

type Harness = ReturnType<typeof harness>;

async function flush() {
  for (let index = 0; index < 40; index += 1) await Promise.resolve();
}

async function found(test: Harness) {
  const scanning = test.controller.scan();
  await flush();
  expect(test.controller.getSnapshot().phase).toBe('scanning');
  test.emit('scanResult', { devices: [device] });
  await scanning;
  expect(test.controller.getSnapshot().phase).toBe('found');
}

async function ready(test: Harness) {
  await found(test);
  const connecting = test.controller.connect();
  await flush();
  test.emit('connectState', connected);
  test.emit('bind', bind);
  test.emit('penState', penState);
  await connecting;
  expect(test.controller.getSnapshot().phase).toBe('ready');
}

beforeEach(() => vi.useFakeTimers());
afterEach(async () => {
  controllers.splice(0).forEach((controller) => controller.dispose());
  await vi.runAllTimersAsync();
  vi.useRealTimers();
});

describe('native Plaud recorder controller', () => {
  it.each([
    { serial: '882B123456785641', model: 'notepro' as const },
    { serial: '8810004812', model: 'notepins' as const },
    { serial: '8800005641', model: 'notepins' as const },
  ])('explains incompatible saved recorder $model before starting Bluetooth', async (recorder) => {
    const test = harness({ session: vi.fn(async () => ({ ...session, recorder })) });
    const scanning = test.controller.scan();
    await vi.runAllTimersAsync();
    await scanning;
    expect(test.controller.getSnapshot().phase).toBe('error');
    expect(test.controller.getSnapshot().message).toContain('dashboard');
    expect(test.controller.getSnapshot().message).not.toContain(recorder.serial);
    expect(test.native.initSDK).not.toHaveBeenCalled();
    expect(test.native.startScan).not.toHaveBeenCalled();
    expect(test.client.bind).not.toHaveBeenCalled();
  });

  it.each([
    { serial: '882B123456785641', model: 'notepins' as const },
    { serial: '881b123456784812', model: 'notepro' as const },
  ])(
    'finds only the exact alphanumeric $model serial, with a native device identifier',
    async (recorder) => {
      const test = harness({ session: vi.fn(async () => ({ ...session, recorder })) });
      const nearby = { ...device, serialNumber: recorder.serial };
      const scanning = test.controller.scan();
      await flush();
      test.emit('scanResult', {
        devices: [
          { ...nearby, uuid: '' },
          { ...nearby, serialNumber: recorder.serial.slice(-4) },
          { ...nearby, serialNumber: recorder.serial.replace(/b/i, 'C') },
          {
            ...nearby,
            serialNumber: recorder.serial.replace(/b/i, recorder.serial.includes('B') ? 'b' : 'B'),
          },
        ],
      });
      await flush();
      expect(test.controller.getSnapshot().phase).toBe('scanning');
      test.emit('scanResult', { devices: [nearby] });
      await scanning;
      expect(test.controller.getSnapshot().phase).toBe('found');
      expect(test.controller.getSnapshot().nearby).toEqual(nearby);
    },
  );

  it('keeps web / Expo Go unavailable without calling native methods or backend', async () => {
    const test = harness({}, webNative);
    expect(test.controller.getSnapshot().phase).toBe('unavailable');
    expect(getRecorderNotice(test.controller.getSnapshot()).tone).toBe('neutral');
    await test.controller.scan();
    await test.controller.connect();
    await test.controller.unpair();
    expect(test.client.capabilities).not.toHaveBeenCalled();
  });

  it('requires a signed-in actor and claimed or recovered enrollment before scanning', async () => {
    const test = harness();
    test.controller.setEnrollment(null);
    await test.controller.scan();
    expect(test.controller.getSnapshot().phase).toBe('signed-out');
    test.controller.setEnrollment({ actorId, operationId: null, status: null });
    await test.controller.scan();
    expect(test.controller.getSnapshot().phase).toBe('needs-enrollment');
    expect(test.client.session).not.toHaveBeenCalled();
  });

  it('initializes the per-actor session, filters by exact assigned supported serial, and stores no token in its snapshot', async () => {
    const test = harness();
    const scanning = test.controller.scan();
    await flush();
    test.emit('scanResult', {
      devices: [
        { ...device, serialNumber: '882000006789' },
        { ...device, serialNumber: '880123456789' },
      ],
    });
    await flush();
    expect(test.controller.getSnapshot().phase).toBe('scanning');
    test.emit('scanResult', { devices: [device] });
    await scanning;
    expect(test.native.initSDK).toHaveBeenCalledWith({
      userAccessToken: session.userAccessToken,
      customDomain: session.customDomain,
      userId: actorId,
    });
    expect(test.client.session).toHaveBeenCalledWith(operationId, {
      signal: expect.any(AbortSignal),
    });
    expect(test.controller.getSnapshot().nearby).toEqual(device);
    expect(JSON.stringify(test.controller.getSnapshot())).not.toContain(session.userAccessToken);
  });

  it.each([
    ['connectState', 'bind', 'penState'],
    ['connectState', 'penState', 'bind'],
    ['bind', 'connectState', 'penState'],
    ['bind', 'penState', 'connectState'],
    ['penState', 'bind', 'connectState'],
    ['penState', 'connectState', 'bind'],
  ] as const)(
    'requires all handshake evidence for callback order %s / %s / %s',
    async (...order) => {
      const test = harness();
      await found(test);
      const connecting = test.controller.connect();
      await flush();
      expect(test.controller.getSnapshot().phase).toBe('connecting');
      const events = { connectState: connected, bind, penState };
      for (const [index, name] of order.entries()) {
        if (name === 'connectState') test.emit(name, events[name]);
        if (name === 'bind') test.emit(name, events[name]);
        if (name === 'penState') test.emit(name, events[name]);
        await flush();
        expect(test.controller.getSnapshot().phase).toBe(index === 2 ? 'ready' : 'connecting');
        expect(getRecorderNotice(test.controller.getSnapshot()).tone).toBe(
          index === 2 ? 'success' : 'neutral',
        );
      }
      await connecting;
      expect(test.client.bind).toHaveBeenCalledWith(operationId, {
        signal: expect.any(AbortSignal),
      });
      expect(test.native.connectBleDevice).toHaveBeenCalledWith({
        uuid: device.uuid,
        deviceToken: actorId,
      });
    },
  );

  it('ignores pen-state callbacks that arrived before the selected connection attempt', async () => {
    const test = harness();
    await found(test);
    test.emit('penState', penState);
    test.emit('bind', bind);
    const connecting = test.controller.connect();
    await flush();
    test.emit('connectState', connected);
    test.emit('bind', bind);
    await flush();
    expect(test.controller.getSnapshot().phase).toBe('connecting');
    test.controller.cancel();
    await connecting;
  });

  it.each([
    { ...bind, sn: '882999999999' },
    { ...bind, status: 1 },
    { ...bind, sn: null },
  ])('rejects wrong serial / failed native bind %#', async (badBind) => {
    const test = harness();
    await found(test);
    const connecting = test.controller.connect();
    await flush();
    test.emit('connectState', connected);
    test.emit('penState', penState);
    test.emit('bind', badBind);
    await connecting;
    expect(test.controller.getSnapshot().phase).toBe('error');
    expect(test.controller.getSnapshot().cloudBound).toBe(true);
    await flush();
    expect(test.native.disconnect).toHaveBeenCalled();
  });

  it('does not connect BLE when cloud bind fails and keeps release available for an ambiguous response', async () => {
    const test = harness({
      bind: vi.fn(async () => {
        throw new Error('network');
      }),
    });
    await found(test);
    await test.controller.connect();
    expect(test.native.connectBleDevice).not.toHaveBeenCalled();
    expect(test.controller.getSnapshot()).toMatchObject({
      phase: 'error',
      pairingAttempted: true,
      cloudBound: false,
      message: 'Recorder setup could not finish. Check your connection and try again.',
    });
  });

  it('shows the API client safe error instead of masking the failed pairing step', async () => {
    const message = 'Plaud could not complete the device request. Try again.';
    const test = harness({
      bind: vi.fn(async () => {
        throw new ApiError(502, 'PLAUD_PROVIDER_UNAVAILABLE', message);
      }),
    });
    await found(test);
    await test.controller.connect();
    expect(test.controller.getSnapshot()).toMatchObject({ phase: 'error', message });
    expect(test.native.connectBleDevice).not.toHaveBeenCalled();
  });

  it('does not turn ready after a failure arrives while connect dispatch is pending', async () => {
    const dispatch = deferred<void>();
    const test = harness({}, { connectBleDevice: vi.fn(() => dispatch.promise) });
    await found(test);
    const connecting = test.controller.connect();
    await flush();
    test.emit('connectState', connected);
    test.emit('bind', bind);
    test.emit('penState', penState);
    await flush();
    expect(test.controller.getSnapshot().phase).toBe('connecting');
    test.emit('connectState', { connected: false, failed: true, state: -1 });
    dispatch.resolve();
    await connecting;
    expect(test.controller.getSnapshot().phase).toBe('error');
  });

  it('bounds scanning and secure handshake waits', async () => {
    const test = harness();
    const scanning = test.controller.scan();
    await flush();
    await vi.advanceTimersByTimeAsync(1001);
    await scanning;
    expect(test.controller.getSnapshot().phase).toBe('error');
    await found(test);
    const connecting = test.controller.connect();
    await flush();
    test.emit('connectState', connected);
    await vi.advanceTimersByTimeAsync(1001);
    await connecting;
    expect(test.controller.getSnapshot()).toMatchObject({ phase: 'error', cloudBound: true });
    expect(test.controller.getSnapshot().message).toContain('Secure setup was not confirmed');
  });

  it('supports retry after transient capability and permission failures', async () => {
    const capabilities = vi
      .fn<PlaudDeviceClient['capabilities']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ available: true, reason: 'ready' } as const);
    const test = harness(
      { capabilities },
      {
        startScan: vi
          .fn()
          .mockRejectedValueOnce({ code: 'ERR_PLAUD_PERMISSIONS' })
          .mockResolvedValue(undefined),
      },
    );
    await test.controller.scan();
    expect(test.controller.getSnapshot().phase).toBe('error');
    await test.controller.scan();
    expect(test.controller.getSnapshot().message).toContain('Allow Bluetooth');
    await found(test);
  });

  it('cancels an in-flight session request and ignores its late result', async () => {
    const pendingSession = deferred<PlaudDeviceSession>();
    const test = harness({ session: vi.fn(() => pendingSession.promise) });
    const scanning = test.controller.scan();
    await flush();
    test.controller.cancel();
    await scanning;
    pendingSession.resolve(session);
    await flush();
    expect(test.native.initSDK).not.toHaveBeenCalled();
    expect(test.controller.getSnapshot()).toMatchObject({ phase: 'idle', assignment: null });
  });

  it('fails closed for unavailable backend configuration and an expired SDK session', async () => {
    const unavailable = harness({
      capabilities: vi.fn(async () => ({ available: false, reason: 'not_configured' }) as const),
    });
    await unavailable.controller.scan();
    expect(unavailable.controller.getSnapshot().message).toContain('not configured');
    expect(unavailable.native.initSDK).not.toHaveBeenCalled();
    const expired = harness({
      session: vi.fn(async () => ({ ...session, expiresAt: '2000-01-01T00:00:00.000Z' })),
    });
    await expired.controller.scan();
    expect(expired.controller.getSnapshot().phase).toBe('error');
    expect(expired.native.initSDK).not.toHaveBeenCalled();
  });

  it('revokes readiness after an unsolicited disconnect while retaining the pairing', async () => {
    const test = harness();
    await ready(test);
    test.emit('connectState', disconnected);
    expect(test.controller.getSnapshot()).toMatchObject({
      phase: 'disconnected',
      cloudBound: true,
      nearby: null,
    });
    expect(test.client.unbind).not.toHaveBeenCalled();
    expect(getRecorderNotice(test.controller.getSnapshot()).tone).toBe('neutral');
  });

  it('shares live readiness across screen subscriptions without starting or ending another SDK session', async () => {
    const test = harness();
    const recorderListener = vi.fn();
    const leaveRecorder = test.controller.subscribe(recorderListener);
    await ready(test);
    let homeNotice = getRecorderNotice(test.controller.getSnapshot());
    const leaveHome = test.controller.subscribe(() => {
      homeNotice = getRecorderNotice(test.controller.getSnapshot());
    });
    leaveRecorder();
    expect(homeNotice.tone).toBe('success');
    expect(test.native.initSDK).toHaveBeenCalledTimes(1);
    expect(test.native.disconnect).not.toHaveBeenCalled();
    expect(getRecorderNotice(test.controller.getSnapshot(), true).tone).toBe('neutral');

    // Bluetooth loss must update Home even with no Recorder screen subscribed.
    test.emit('connectState', disconnected);
    expect(homeNotice.tone).toBe('neutral');
    expect(homeNotice.actionLabel).toBe('Reconnect recorder');
    leaveHome();
    test.controller.dispose();
    await flush();
    expect(test.native.disconnect).toHaveBeenCalledTimes(1);
    expect([...test.callbacks.values()].every((listeners) => listeners.size === 0)).toBe(true);
  });

  it('refreshes through a new search when the user leaves a found recorder until its session expires', async () => {
    const test = harness({
      session: vi.fn(async () => ({
        ...session,
        expiresAt: new Date(Date.now() + 5000).toISOString(),
      })),
    });
    await found(test);
    await vi.advanceTimersByTimeAsync(5001);
    await test.controller.connect();
    expect(test.controller.getSnapshot().message).toContain('session expired');
    expect(test.client.bind).not.toHaveBeenCalled();
    expect(test.native.connectBleDevice).not.toHaveBeenCalled();
    await ready(test);
  });

  it('does not claim full unpair after revoked enrollment prevents a new Bluetooth session', async () => {
    const test = harness();
    await ready(test);
    test.controller.setEnrollment({ actorId, operationId, status: 'revoked' });
    expect(getRecorderNotice(test.controller.getSnapshot()).tone).toBe('neutral');
    await test.controller.scan();
    expect(test.controller.getSnapshot().message).toContain('new valid enrollment');
    await test.controller.unpair();
    expect(test.controller.getSnapshot()).toMatchObject({
      phase: 'error',
      release: { cloud: true, device: false },
    });
    expect(test.native.unpair).not.toHaveBeenCalled();
    expect(test.controller.getSnapshot().message).toContain('do not uninstall');
  });

  it('removes the recorder and requires a new enrollment after confirmed unpair', async () => {
    const test = harness();
    await ready(test);
    const release = test.controller.unpair();
    await flush();
    test.emit('depair', { status: 0 });
    await release;
    expect(test.controller.getSnapshot()).toMatchObject({
      phase: 'unpaired',
      assignment: null,
      nearby: null,
      release: null,
      pairingAttempted: false,
      cloudBound: false,
    });
    expect(test.onUnpaired).toHaveBeenCalledWith({ actorId, operationId });
    await test.controller.scan();
    expect(test.native.initSDK).toHaveBeenCalledTimes(1);
    test.controller.setEnrollment({ actorId, operationId: 'new-operation', status: 'pending' });
    await ready(test);
    expect(test.controller.getSnapshot().release).toBeNull();
    expect(test.client.bind).toHaveBeenCalledTimes(2);
  });

  it('invalidates old listener closures and clears native state on sign-out and account change', async () => {
    const test = harness();
    await found(test);
    const connecting = test.controller.connect();
    await flush();
    const oldBind = [...test.callbacks.get('bind')!];
    const oldPen = [...test.callbacks.get('penState')!];
    const oldConnection = [...test.callbacks.get('connectState')!];
    test.controller.setEnrollment(null);
    await connecting;
    oldConnection.forEach((callback) => callback(connected));
    oldBind.forEach((callback) => callback(bind));
    oldPen.forEach((callback) => callback(penState));
    expect(test.controller.getSnapshot()).toMatchObject({
      phase: 'signed-out',
      assignment: null,
      cloudBound: false,
    });
    expect(getRecorderNotice(test.controller.getSnapshot()).tone).toBe('neutral');
    test.controller.setEnrollment({ actorId: 'other-user', operationId, status: 'pending' });
    await test.controller.scan();
    expect(test.controller.getSnapshot().phase).toBe('error'); // Backend session must match actor.
    expect(test.native.disconnect).toHaveBeenCalled();
    expect([...test.callbacks.values()].every((listeners) => listeners.size === 0)).toBe(true);
  });

  it('permits only one scan/bind operation at a time', async () => {
    const test = harness();
    const scan = test.controller.scan();
    await test.controller.scan();
    await flush();
    expect(test.client.session).toHaveBeenCalledTimes(1);
    test.emit('scanResult', { devices: [device] });
    await scan;
    const first = test.controller.connect();
    await test.controller.connect();
    await flush();
    expect(test.client.bind).toHaveBeenCalledTimes(1);
    test.controller.cancel();
    await first;
  });

  it('waits for disconnect confirmation and never cloud-unbinds on ordinary disconnect', async () => {
    const disconnectDispatch = vi.fn(async () => undefined);
    const test = harness({}, { disconnect: disconnectDispatch });
    await ready(test);
    const disconnecting = test.controller.disconnect();
    await flush();
    expect(test.controller.getSnapshot().phase).toBe('disconnecting');
    test.emit('connectState', disconnected);
    await disconnecting;
    expect(test.controller.getSnapshot()).toMatchObject({
      phase: 'disconnected',
      cloudBound: true,
    });
    expect(test.client.unbind).not.toHaveBeenCalled();
    expect(test.native.unpair).not.toHaveBeenCalled();
  });

  it('does not treat an unpair dispatch promise or disconnect callback as depair success', async () => {
    const test = harness();
    await ready(test);
    const unpairing = test.controller.unpair();
    await flush();
    test.emit('connectState', disconnected);
    await flush();
    expect(test.controller.getSnapshot()).toMatchObject({
      phase: 'unpairing',
      release: { cloud: true, device: false },
    });
    test.emit('depair', { status: 0 });
    await unpairing;
    expect(test.controller.getSnapshot()).toMatchObject({
      phase: 'unpaired',
      release: null,
      assignment: null,
    });
  });

  it('keeps native success when cloud release fails and retries only cloud release', async () => {
    const unbind = vi
      .fn<PlaudDeviceClient['unbind']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ status: 'unbound' } as const);
    const test = harness({ unbind });
    await ready(test);
    const unpairing = test.controller.unpair();
    await flush();
    test.emit('depair', { status: 0 });
    await unpairing;
    expect(test.controller.getSnapshot()).toMatchObject({
      phase: 'error',
      release: { cloud: false, device: true },
    });
    await test.controller.unpair();
    expect(test.native.unpair).toHaveBeenCalledTimes(1);
    expect(unbind).toHaveBeenCalledTimes(2);
    expect(test.controller.getSnapshot().phase).toBe('unpaired');
  });

  it.each(['callback-failure', 'timeout'] as const)(
    'disconnects after device unpair %s and reconnects to finish only that step',
    async (failure) => {
      const test = harness();
      await ready(test);
      const unpairing = test.controller.unpair();
      await flush();
      if (failure === 'callback-failure') test.emit('depair', { status: 1 });
      else await vi.advanceTimersByTimeAsync(1001);
      await unpairing;
      expect(test.controller.getSnapshot()).toMatchObject({
        phase: 'error',
        release: { cloud: true, device: false },
      });
      expect(test.native.disconnect).toHaveBeenCalled();
      expect(test.controller.getSnapshot().message).toContain('Reconnect');
      await ready(test);
      expect(test.client.bind).toHaveBeenCalledTimes(1); // Do not rebind a released cloud device.
      expect(getRecorderNotice(test.controller.getSnapshot()).tone).toBe('neutral');
      const retry = test.controller.unpair();
      await flush();
      test.emit('depair', { status: 0 });
      await retry;
      expect(test.controller.getSnapshot().phase).toBe('unpaired');
      expect(test.client.unbind).toHaveBeenCalledTimes(1);
    },
  );

  it('does not let stale cloud-unpair completion repopulate a signed-out session', async () => {
    const release = deferred<{ status: 'unbound' }>();
    const test = harness({ unbind: vi.fn(() => release.promise) });
    await ready(test);
    const unpairing = test.controller.unpair();
    await flush();
    test.emit('depair', { status: 0 });
    test.controller.setEnrollment(null);
    await unpairing;
    release.resolve({ status: 'unbound' } as const);
    await flush();
    expect(test.controller.getSnapshot()).toMatchObject({
      phase: 'signed-out',
      release: null,
      assignment: null,
    });
  });
  it('does not release the assignment or forget enrollment when disconnect is not confirmed', async () => {
    const test = harness({}, { disconnect: vi.fn(async () => undefined) });
    await ready(test);
    const unpairing = test.controller.unpair();
    await flush();
    test.emit('depair', { status: 0 });
    await vi.advanceTimersByTimeAsync(31);
    await unpairing;
    expect(test.controller.getSnapshot()).toMatchObject({
      phase: 'error',
      release: { cloud: true, device: true, assignment: false },
    });
    expect(test.client.completeUnpair).not.toHaveBeenCalled();
    expect(test.onUnpaired).not.toHaveBeenCalled();
    test.emit('connectState', disconnected);
    await test.controller.unpair();
    expect(test.native.unpair).toHaveBeenCalledTimes(1);
    expect(test.client.completeUnpair).toHaveBeenCalledTimes(1);
    expect(test.onUnpaired).toHaveBeenCalledTimes(1);
  });

  it('retries failed dashboard release without pairing or unpairing the device again', async () => {
    const completeUnpair = vi
      .fn<PlaudDeviceClient['completeUnpair']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ status: 'released' });
    const test = harness({ completeUnpair });
    await ready(test);
    const unpairing = test.controller.unpair();
    await flush();
    expect(completeUnpair).not.toHaveBeenCalled();
    test.emit('depair', { status: 0 });
    await unpairing;
    expect(test.controller.getSnapshot()).toMatchObject({
      phase: 'error',
      release: { cloud: true, device: true, assignment: false },
    });
    expect(test.onUnpaired).not.toHaveBeenCalled();
    await test.controller.scan();
    expect(test.native.initSDK).toHaveBeenCalledTimes(1);
    await test.controller.unpair();
    expect(test.native.unpair).toHaveBeenCalledTimes(1);
    expect(test.client.bind).toHaveBeenCalledTimes(1);
    expect(completeUnpair).toHaveBeenCalledTimes(2);
    expect(test.controller.getSnapshot().assignment).toBeNull();
  });

  it('keeps completed release evidence when local removal fails and retries only the remaining work', async () => {
    const complete = vi
      .fn<(identity: { actorId: string; operationId: string }) => Promise<void>>()
      .mockRejectedValueOnce(new Error('secure storage unavailable'))
      .mockResolvedValue(undefined);
    const test = harness({}, {}, complete);
    await ready(test);
    const unpairing = test.controller.unpair();
    await flush();
    test.emit('depair', { status: 0 });
    await unpairing;
    expect(test.controller.getSnapshot()).toMatchObject({
      phase: 'error',
      release: { cloud: true, device: true, assignment: true },
    });
    await test.controller.unpair();
    expect(test.native.unpair).toHaveBeenCalledTimes(1);
    expect(test.client.completeUnpair).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(test.controller.getSnapshot().assignment).toBeNull();
  });
});
