import type { PlaudStatusPort, RecorderStorage } from './plaud-status-port';

export interface PlaudStatusSnapshot {
  available: boolean;
  batteryPercent: number | null;
  charging: boolean | null;
  storage: RecorderStorage | null;
  refreshing: boolean;
  message: string | null;
}

export function createPlaudStatusController(port: PlaudStatusPort, timeoutMs = 8000) {
  const empty = (): PlaudStatusSnapshot => ({
    available: port.isAvailable,
    batteryPercent: null,
    charging: null,
    storage: null,
    refreshing: false,
    message: null,
  });
  let snapshot = empty();
  let connection: string | null = null;
  let generation = 0;
  let paused = false;
  let requestId = 0;
  let receivedBattery = false;
  let receivedStorage = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let subscriptions: { remove(): void }[] = [];
  const listeners = new Set<() => void>();
  const update = (patch: Partial<PlaudStatusSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  };
  const stopTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const finishIfComplete = () => {
    if (receivedBattery && receivedStorage) {
      stopTimer();
      update({ refreshing: false, message: null });
    }
  };
  const refresh = () => {
    if (!connection || !port.isAvailable || snapshot.refreshing || paused) return;
    const currentGeneration = generation;
    const currentRequest = ++requestId;
    receivedBattery = false;
    receivedStorage = false;
    update({ refreshing: true, message: null });
    const failed = () => {
      if (currentGeneration !== generation || currentRequest !== requestId || !snapshot.refreshing)
        return;
      stopTimer();
      const hasReadings = snapshot.batteryPercent !== null || snapshot.storage !== null;
      update({
        refreshing: false,
        message: hasReadings
          ? 'Some readings are unavailable. Showing the last readings received; tap refresh to try again.'
          : 'Recorder readings are unavailable. Tap refresh to try again.',
      });
    };
    timer = setTimeout(failed, timeoutMs);
    try {
      void port.request().catch(failed);
    } catch {
      failed();
    }
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Null detaches safely; the same instance may be attached again by React Strict Mode. */
    setConnection(key: string | null) {
      if (key === connection) return;
      generation += 1;
      connection = key;
      stopTimer();
      subscriptions.forEach((subscription) => subscription.remove());
      subscriptions = [];
      update(empty());
      if (!key || !port.isAvailable) return;
      const currentGeneration = generation;
      subscriptions = [
        port.addListener('batteryState', (event) => {
          if (
            currentGeneration !== generation ||
            !Number.isInteger(event.batteryPercent) ||
            event.batteryPercent < 0 ||
            event.batteryPercent > 100
          )
            return;
          receivedBattery = true;
          update({
            batteryPercent: event.batteryPercent,
            charging: typeof event.charging === 'boolean' ? event.charging : snapshot.charging,
          });
          finishIfComplete();
        }),
        port.addListener('storageState', (event) => {
          if (
            currentGeneration !== generation ||
            !Number.isSafeInteger(event.totalBytes) ||
            !Number.isSafeInteger(event.freeBytes) ||
            event.totalBytes <= 0 ||
            event.freeBytes < 0 ||
            event.freeBytes > event.totalBytes
          )
            return;
          receivedStorage = true;
          update({ storage: { totalBytes: event.totalBytes, freeBytes: event.freeBytes } });
          finishIfComplete();
        }),
      ];
      refresh();
    },
    setPaused(next: boolean) {
      if (paused === next) return;
      paused = next;
      if (paused) {
        requestId++;
        stopTimer();
        update({ refreshing: false });
      } else refresh();
    },
    refresh,
  };
}
