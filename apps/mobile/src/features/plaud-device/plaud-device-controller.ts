import { requiresRecorderRestart, transferRestartMessage } from './transfer-recovery';
import { ApiError, type PlaudDeviceClient } from '@aptly/api-client';
import { recorderIdentitySchema, type PlaudDeviceSession } from '@aptly/contracts';

import type { PlaudNativePort, PlaudNearbyDevice } from './plaud-native-port';
import { disconnectPlaudTransport } from './disconnect-plaud-transport';
import {
  connectionPreparationError,
  handshakeFailureMessage,
  safeConnectionDetail,
  safeConnectionStage,
  type ConnectionDiagnostics,
} from './connection-diagnostics';

export type PlaudDevicePhase =
  | 'unavailable'
  | 'signed-out'
  | 'needs-enrollment'
  | 'idle'
  | 'preparing'
  | 'scanning'
  | 'found'
  | 'binding'
  | 'connecting'
  | 'ready'
  | 'disconnecting'
  | 'disconnected'
  | 'unpairing'
  | 'unpaired'
  | 'error';

export interface PlaudDeviceEnrollment {
  actorId: string;
  operationId: string | null;
  status: string | null;
}

export interface PlaudDeviceSnapshot {
  phase: PlaudDevicePhase;
  assignment: PlaudDeviceSession['recorder'] | null;
  nearby: PlaudNearbyDevice | null;
  message: string | null;
  scanDisclosure: number | null;
  permissionDenied: boolean;
  cloudBound: boolean;
  pairingAttempted: boolean;
  connection: ConnectionDiagnostics | null;
  /** Keep each confirmed release separately so a partial unpair can be retried safely. */
  release: { cloud: boolean; device: boolean; assignment: boolean } | null;
}

export interface PlaudDeviceController {
  getSnapshot(): PlaudDeviceSnapshot;
  subscribe(listener: () => void): () => void;
  setEnrollment(enrollment: PlaudDeviceEnrollment | null): void;
  scan(): Promise<void>;
  confirmScanDisclosure(request: number): Promise<void>;
  declineScanDisclosure(request: number): void;
  connect(): Promise<void>;
  cancel(): void;
  disconnect(): Promise<void>;
  unpair(): Promise<void>;
  dispose(): void;
}

type Job = { generation: number; abort: AbortController; promise: Promise<void> };
type Pending<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
};

class Cancelled extends Error {}
class DeviceFailure extends Error {}

function pending<T>(): Pending<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  // An event can arrive synchronously during dispatch, before the caller starts waiting.
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
}

const initial: PlaudDeviceSnapshot = {
  phase: 'signed-out',
  assignment: null,
  nearby: null,
  message: null,
  scanDisclosure: null,
  permissionDenied: false,
  cloudBound: false,
  pairingAttempted: false,
  connection: null,
  release: null,
};

export function createPlaudDeviceController({
  client,
  native,
  onUnpaired,
  requireScanDisclosure = false,
  timeouts = {},
}: {
  client: PlaudDeviceClient;
  native: PlaudNativePort;
  onUnpaired(enrollment: { actorId: string; operationId: string }): Promise<void>;
  requireScanDisclosure?: boolean;
  timeouts?: { requestMs?: number; scanMs?: number; handshakeMs?: number; cleanupMs?: number };
}): PlaudDeviceController {
  const requestMs = timeouts.requestMs ?? 20_000;
  const scanMs = timeouts.scanMs ?? 20_000;
  const handshakeMs = timeouts.handshakeMs ?? 30_000;
  const cleanupMs = timeouts.cleanupMs ?? 5_000;
  let snapshot: PlaudDeviceSnapshot = {
    ...initial,
    phase: native.isAvailable ? 'signed-out' : 'unavailable',
  };
  let enrollment: PlaudDeviceEnrollment | null = null;
  let generation = 0;
  let disclosureSequence = 0;
  let job: Job | null = null;
  let disposed = false;
  let nativeStarted = false;
  let sessionExpiresAt: number | null = null;
  let cleanup: Promise<void> = Promise.resolve();
  let subscriptions: { remove(): void }[] = [];
  let scanned: Pending<PlaudNearbyDevice> | null = null;
  let handshake: Pending<void> | null = null;
  let depaired: Pending<void> | null = null;
  let disconnected: Pending<void> | null = null;
  let connectionAttempt = false;
  let bleConnected = false;
  let boundSerial = false;
  let penStateReceived = false;
  let handshakeFailure: DeviceFailure | null = null;
  const listeners = new Set<() => void>();

  const publish = (next: Partial<PlaudDeviceSnapshot>) => {
    if (disposed) return;
    snapshot = { ...snapshot, ...next };
    listeners.forEach((listener) => listener());
  };
  const current = (own: Job) =>
    !disposed && generation === own.generation && !own.abort.signal.aborted;

  function wait<T>(
    promise: Promise<T>,
    own: Job,
    ms: number,
    message: string | (() => string),
  ): Promise<T> {
    if (!current(own)) {
      void promise.catch(() => undefined);
      return Promise.reject(new Cancelled());
    }
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => finish(() => reject(new Cancelled()));
      const timer = setTimeout(
        () =>
          finish(() =>
            reject(new DeviceFailure(typeof message === 'function' ? message() : message)),
          ),
        ms,
      );
      const finish = (settle: () => void) => {
        clearTimeout(timer);
        own.abort.signal.removeEventListener('abort', onAbort);
        settle();
      };
      own.abort.signal.addEventListener('abort', onAbort, { once: true });
      promise.then(
        (value) => finish(() => (current(own) ? resolve(value) : reject(new Cancelled()))),
        (error: unknown) => finish(() => reject(current(own) ? error : new Cancelled())),
      );
    });
  }

  // Native dispatch promises are not connection confirmations. Cleanup is bounded, serial,
  // and happens before a replacement SDK session is initialized.
  function queueCleanup() {
    if (!nativeStarted || !native.isAvailable) return;
    nativeStarted = false;
    cleanup = cleanup.then(async () => {
      for (const stop of [() => native.stopScan(), () => native.disconnect()]) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, cleanupMs);
          Promise.resolve()
            .then(stop)
            .catch(() => undefined)
            .finally(() => {
              clearTimeout(timer);
              resolve();
            });
        });
      }
    });
  }

  function clearEvents() {
    subscriptions.forEach((subscription) => subscription.remove());
    subscriptions = [];
    scanned = null;
    handshake = null;
    depaired = null;
    disconnected = null;
    connectionAttempt = false;
    bleConnected = false;
    boundSerial = false;
    penStateReceived = false;
    sessionExpiresAt = null;
  }

  function invalidate() {
    generation += 1;
    job?.abort.abort();
    job = null;
    clearEvents();
    queueCleanup();
  }

  function run(work: (own: Job) => Promise<void>): Promise<void> {
    if (disposed) return Promise.resolve();
    if (job) return job.promise;
    const own: Job = { generation, abort: new AbortController(), promise: Promise.resolve() };
    job = own;
    own.promise = Promise.resolve()
      .then(() => {
        if (!current(own)) throw new Cancelled();
        return work(own);
      })
      .catch((error: unknown) => {
        if (!current(own) || error instanceof Cancelled) return;
        publish({
          phase: 'error',
          permissionDenied: permissionError(error),
          message: requiresRecorderRestart(error)
            ? transferRestartMessage
            : error instanceof DeviceFailure || error instanceof ApiError
              ? error.message
              : permissionError(error)
                ? requireScanDisclosure
                  ? 'Allow Nearby devices / Bluetooth and Location with Precise location in phone settings, then search again. Approximate-only location cannot complete Plaud setup. You can keep using your local recordings without these permissions.'
                  : 'Allow Bluetooth and Nearby devices access in phone settings, then try again.'
                : (connectionPreparationError(error) ??
                  'Recorder setup could not finish. Check your connection and try again.'),
        });
        invalidate();
      })
      .finally(() => {
        if (job === own) job = null;
      });
    return own.promise;
  }

  function attachEvents(ownGeneration: number) {
    const isCurrent = () => !disposed && ownGeneration === generation;
    const ready = () => {
      if (connectionAttempt && bleConnected && boundSerial && penStateReceived)
        handshake?.resolve();
    };
    subscriptions = [
      native.addListener('scanResult', ({ devices }) => {
        if (!isCurrent() || snapshot.phase !== 'scanning' || !snapshot.assignment) return;
        const assignment = snapshot.assignment;
        const found = devices.find(
          (device) => device.uuid.length > 0 && device.serialNumber === assignment.serial,
        );
        if (found) scanned?.resolve({ ...found });
      }),
      native.addListener('scanTimeout', ({ reason }) => {
        if (!isCurrent() || snapshot.phase !== 'scanning') return;
        scanned?.reject(
          new DeviceFailure(
            reason === 'bluetoothNotPoweredOn'
              ? 'Turn on Bluetooth and allow recorder access, then search again.'
              : 'Your assigned recorder was not found. Keep it nearby and powered on, then search again.',
          ),
        );
      }),
      native.addListener('connectState', ({ connected, failed }) => {
        if (!isCurrent() || !connectionAttempt) return;
        bleConnected = connected;
        if (snapshot.phase === 'connecting' && snapshot.connection && connected)
          publish({ connection: { ...snapshot.connection, bluetooth: true } });
        if (snapshot.phase === 'unpairing') return; // Depair confirmation may follow disconnect.
        if (snapshot.phase === 'disconnecting') {
          if (!connected && !failed) disconnected?.resolve();
          else if (failed)
            disconnected?.reject(
              new DeviceFailure('Disconnect could not be confirmed. Try again.'),
            );
          return;
        }
        if (failed || !connected) {
          const message = failed
            ? (handshakeFailureMessage(snapshot.connection) ??
              'The recorder handshake failed. Keep the recorder awake and nearby, check internet access, then search again. If it repeats, share setup details from Settings with support.')
            : 'Your recorder disconnected. Its pairing is saved; reconnect when ready.';
          if (snapshot.phase === 'connecting') {
            handshakeFailure = new DeviceFailure(message);
            handshake?.reject(handshakeFailure);
          } else if (snapshot.phase === 'ready' || snapshot.phase === 'error') {
            publish({ phase: 'disconnected', message, nearby: null });
            invalidate();
          }
          return;
        }
        ready();
      }),
      native.addListener('connectStage', ({ stage, detail }) => {
        if (
          !isCurrent() ||
          !connectionAttempt ||
          snapshot.phase !== 'connecting' ||
          !snapshot.connection
        )
          return;
        const safeStage = safeConnectionStage(stage);
        if (!safeStage) return;
        publish({
          connection: {
            ...snapshot.connection,
            stage: safeStage,
            detail: safeConnectionDetail(detail),
          },
        });
      }),
      native.addListener('bind', ({ sn, status }) => {
        if (!isCurrent() || !connectionAttempt || snapshot.phase !== 'connecting') return;
        if (sn !== snapshot.assignment?.serial || status !== 0) {
          boundSerial = false;
          handshakeFailure = new DeviceFailure(
            sn !== snapshot.assignment?.serial
              ? 'The connected recorder did not match your assignment. Search again.'
              : 'The recorder rejected pairing. If it belongs to another app, unpair it there first.',
          );
          handshake?.reject(handshakeFailure);
          return;
        }
        boundSerial = true;
        if (snapshot.connection) publish({ connection: { ...snapshot.connection, binding: true } });
        ready();
      }),
      native.addListener('penState', () => {
        if (!isCurrent() || !connectionAttempt || snapshot.phase !== 'connecting') return;
        penStateReceived = true;
        if (snapshot.connection)
          publish({ connection: { ...snapshot.connection, deviceReady: true } });
        ready();
      }),
      native.addListener('depair', ({ status }) => {
        if (!isCurrent() || snapshot.phase !== 'unpairing') return;
        if (status === 0) depaired?.resolve();
        else depaired?.reject(new DeviceFailure('The recorder did not confirm unpairing.'));
      }),
    ];
  }

  function canScan() {
    return (
      native.isAvailable &&
      enrollment?.operationId &&
      enrollment.status === 'pending' &&
      !snapshot.release?.device &&
      !job &&
      !disposed
    );
  }

  function scan() {
    if (!canScan()) return Promise.resolve();
    if (requireScanDisclosure) {
      if (snapshot.scanDisclosure === null) publish({ scanDisclosure: ++disclosureSequence });
      return Promise.resolve();
    }
    return beginScan();
  }

  function beginScan() {
    if (!canScan()) return Promise.resolve();
    invalidate();
    return run(async (own) => {
      publish({
        phase: 'preparing',
        nearby: null,
        message: null,
        permissionDenied: false,
        connection: null,
      });
      await wait(
        cleanup,
        own,
        cleanupMs * 3,
        'The previous Bluetooth session is still closing. Try again.',
      );
      const capability = await wait(
        client.capabilities({ signal: own.abort.signal }),
        own,
        requestMs,
        'The recorder service did not respond. Check your connection and try again.',
      );
      if (!capability.available)
        throw new DeviceFailure(
          capability.reason === 'not_configured'
            ? 'Recorder connection is not configured on the server yet. Try again after setup is complete.'
            : 'The recorder service is temporarily unavailable. Try again.',
        );
      const session = await wait(
        client.session(enrollment!.operationId!, { signal: own.abort.signal }),
        own,
        requestMs,
        'Your recorder session could not be prepared. Check your connection and try again.',
      );
      if (session.userId !== enrollment?.actorId || Date.parse(session.expiresAt) <= Date.now())
        throw new DeviceFailure(
          'Your recorder session is no longer valid. Sign in again and retry.',
        );
      const recorder = recorderIdentitySchema.safeParse(session.recorder);
      if (!recorder.success)
        throw new DeviceFailure(
          'The assigned recorder’s model and serial do not match a supported device. Check the recorder details in the dashboard or ask your administrator to correct the assignment before trying again.',
        );
      // Discovery must still match the entire serial exactly, including letter case.
      publish({ assignment: recorder.data });
      sessionExpiresAt = Date.parse(session.expiresAt);
      nativeStarted = true;
      await wait(
        native.initSDK({
          userAccessToken: session.userAccessToken,
          customDomain: session.customDomain,
          userId: session.userId,
        }),
        own,
        requestMs,
        'Bluetooth setup did not finish. Check permissions and try again.',
      );
      attachEvents(own.generation);
      scanned = pending<PlaudNearbyDevice>();
      publish({ phase: 'scanning' });
      const [, found] = await wait(
        Promise.all([native.startScan(), scanned.promise]),
        own,
        scanMs,
        'Your assigned recorder was not found. Keep it nearby and powered on, then search again.',
      );
      await wait(native.stopScan(), own, requestMs, 'Bluetooth search could not stop. Try again.');
      publish({ phase: 'found', nearby: found });
      scanned = null;
    });
  }

  function connect() {
    if (snapshot.phase !== 'found' || !snapshot.nearby || !enrollment?.operationId || job)
      return Promise.resolve();
    const device = snapshot.nearby;
    const operationId = enrollment.operationId;
    const actorId = enrollment.actorId;
    return run(async (own) => {
      if (sessionExpiresAt === null || sessionExpiresAt <= Date.now())
        throw new DeviceFailure(
          'Your recorder session expired. Search again to prepare a fresh connection.',
        );
      publish({ phase: 'binding', message: null, pairingAttempted: true });
      // Once cloud release succeeded, reconnect only to finish device unpairing.
      if (!snapshot.release?.cloud) {
        await wait(
          client.bind(operationId, { signal: own.abort.signal }),
          own,
          requestMs,
          'Cloud pairing could not be confirmed. Try again, or unpair to release the recorder.',
        );
        publish({ cloudBound: true });
      }
      bleConnected = false;
      boundSerial = false;
      penStateReceived = false;
      handshakeFailure = null;
      handshake = pending<void>();
      connectionAttempt = true;
      publish({
        phase: 'connecting',
        connection: {
          stage: null,
          detail: null,
          bluetooth: false,
          binding: false,
          deviceReady: false,
        },
      });
      await wait(
        Promise.all([
          native.connectBleDevice({ uuid: device.uuid, deviceToken: actorId }),
          handshake.promise,
        ]),
        own,
        handshakeMs,
        () =>
          handshakeFailureMessage(snapshot.connection) ??
          'Secure setup was not confirmed within 30 seconds. Keep the recorder awake and nearby, check your internet connection, then search again. If it repeats, open Settings and copy setup details for support.',
      );
      if (handshakeFailure) throw handshakeFailure;
      if (!bleConnected || !boundSerial || !penStateReceived)
        throw new DeviceFailure('Secure setup was interrupted. Reconnect and try again.');
      publish({
        phase: 'ready',
        message: snapshot.release ? 'Reconnected. Finish unpairing below.' : null,
      });
      handshake = null;
    });
  }

  function disconnect() {
    if (!native.isAvailable || disposed || job || !connectionAttempt) return Promise.resolve();
    return run(async (own) => {
      publish({ phase: 'disconnecting', message: null });
      disconnected = pending<void>();
      await wait(
        Promise.all([native.disconnect(), disconnected.promise]),
        own,
        requestMs,
        'Disconnect was not confirmed. Keep the recorder nearby and try again.',
      );
      clearEvents();
      nativeStarted = false;
      publish({
        phase: 'disconnected',
        nearby: null,
        message: 'Pairing is saved. Reconnect when ready.',
      });
    });
  }

  function unpair() {
    if (!native.isAvailable || disposed || job || !enrollment?.operationId)
      return Promise.resolve();
    const operationId = enrollment.operationId;
    const actorId = enrollment.actorId;
    return run(async (own) => {
      const previous = snapshot.release ?? { cloud: false, device: false, assignment: false };
      let transportClosed = false;
      publish({ phase: 'unpairing', message: null, release: { ...previous } });
      depaired = pending<void>();
      const releaseCloud = async () => {
        if (previous.cloud) return;
        await wait(
          client.unbind(operationId, { signal: own.abort.signal }),
          own,
          requestMs,
          'Cloud release was not confirmed.',
        );
        publish({ cloudBound: false, release: { ...snapshot.release!, cloud: true } });
      };
      const closeTransport = async () => {
        if (!current(own)) return;
        try {
          await disconnectPlaudTransport(native, (promise) =>
            wait(promise, own, cleanupMs, 'Bluetooth disconnect was not confirmed.'),
          );
          if (current(own)) {
            transportClosed = true;
            nativeStarted = false;
            bleConnected = false;
            connectionAttempt = false;
          }
        } catch {
          // Keep confirmed release steps for a retry; never call dispatch alone a success.
        }
      };
      const releaseDevice = async () => {
        if (previous.device) {
          await closeTransport();
          return;
        }
        if (!connectionAttempt || !bleConnected)
          throw new DeviceFailure('Reconnect the recorder to finish device unpairing.');
        try {
          await wait(
            Promise.all([native.unpair(), depaired!.promise]),
            own,
            requestMs,
            'Device unpairing was not confirmed.',
          );
          publish({ release: { ...snapshot.release!, device: true } });
        } finally {
          // Android requires a disconnect after depair, including timeout/failure.
          await closeTransport();
        }
      };
      // Try both sides even if one fails. Confirmations, including a device callback that
      // precedes the cloud response, remain visible and only unfinished work is retried.
      await Promise.allSettled([releaseCloud(), releaseDevice()]);
      if (!current(own)) return;
      depaired = null;
      clearEvents();
      if (snapshot.release?.cloud && snapshot.release.device) {
        if (!transportClosed)
          throw new DeviceFailure(
            'Pairing is released, but Bluetooth disconnection is not confirmed. Retry to finish removing the recorder.',
          );
        if (!snapshot.release.assignment) {
          try {
            await wait(
              client.completeUnpair(operationId, { signal: own.abort.signal }),
              own,
              requestMs,
              'Dashboard release was not confirmed.',
            );
          } catch (error) {
            if (!current(own)) throw error;
            throw new DeviceFailure(
              'The recorder is disconnected, but its dashboard assignment could not be released. Retry to finish unpairing.',
            );
          }
          publish({ release: { ...snapshot.release!, assignment: true } });
        }
        try {
          await wait(
            onUnpaired({ actorId, operationId }),
            own,
            requestMs,
            'Recorder removal could not be saved. Retry to finish removing it from this phone.',
          );
        } catch (error) {
          if (!current(own)) throw error;
          throw new DeviceFailure(
            'The recorder is disconnected, but its saved enrollment could not be removed. Retry to finish removing it from this phone.',
          );
        }
        if (!current(own)) return;
        // The app's enrollment subscription normally clears this controller synchronously.
        // Also prevent this controller from reusing the old enrollment on its own.
        enrollment = { actorId, operationId: null, status: null };
        publish({
          ...initial,
          phase: 'unpaired',
          message: 'Recorder unpaired and removed from this phone.',
        });
      } else {
        const cloud = snapshot.release?.cloud;
        const device = snapshot.release?.device;
        publish({
          phase: 'error',
          message: cloud
            ? enrollment?.status === 'pending'
              ? 'Cloud release is complete. Reconnect your recorder, then retry device unpairing.'
              : 'Cloud release is complete. Device unpairing is not confirmed. Ask for a new valid enrollment to reconnect and finish; do not uninstall yet.'
            : device
              ? 'The recorder is unpaired locally. Retry cloud release when your internet connection is available.'
              : 'Unpairing is incomplete. Reconnect your recorder, then retry the unfinished steps.',
        });
      }
    });
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setEnrollment(next) {
      if (
        enrollment?.actorId === next?.actorId &&
        enrollment?.operationId === next?.operationId &&
        enrollment?.status === next?.status
      )
        return;
      invalidate();
      enrollment = next ? { ...next } : null;
      publish({
        ...initial,
        phase: !native.isAvailable
          ? 'unavailable'
          : !next
            ? 'signed-out'
            : !next.operationId
              ? 'needs-enrollment'
              : next.status === 'pending'
                ? 'idle'
                : 'error',
        message:
          next?.operationId && next.status !== 'pending'
            ? 'This enrollment is no longer active. You can request cloud release, but device unpairing needs a new valid enrollment to reconnect. Do not uninstall until both releases are confirmed.'
            : null,
      });
    },
    scan,
    confirmScanDisclosure(request) {
      // Only the current dialog may authorize a scan. Enrollment changes reset this
      // request, and every retry gets a new one before SDK permissions can be asked.
      if (snapshot.scanDisclosure !== request || !canScan()) return Promise.resolve();
      publish({ scanDisclosure: null });
      return beginScan();
    },
    declineScanDisclosure(request) {
      if (snapshot.scanDisclosure === request) publish({ scanDisclosure: null });
    },
    connect,
    cancel() {
      const wasUnpairing = snapshot.phase === 'unpairing';
      invalidate();
      publish({
        phase: wasUnpairing ? 'error' : 'idle',
        scanDisclosure: null,
        nearby: null,
        message: wasUnpairing
          ? 'Unpairing was interrupted. Some release steps may have completed; reconnect and retry to confirm.'
          : snapshot.cloudBound
            ? 'Connection cancelled. Cloud pairing is saved; reconnect or unpair when ready.'
            : 'Recorder setup cancelled.',
      });
    },
    disconnect,
    unpair,
    dispose() {
      invalidate();
      disposed = true;
      enrollment = null;
      snapshot = { ...initial };
      listeners.clear();
    },
  };
}

function permissionError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ERR_PLAUD_PERMISSIONS'
  );
}
