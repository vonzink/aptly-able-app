import {
  unavailableLocationStatus,
  type LocationContext,
  type LocationStatus,
  type RecordingLocationPort,
} from './location-port';
export type LocationSnapshot = LocationStatus &
  LocationContext & { available: boolean; busy: boolean; error: string | null };
export function createRecordingLocationController(port: RecordingLocationPort) {
  let generation = 0;
  let snapshot: LocationSnapshot = {
    ...unavailableLocationStatus,
    actorId: null,
    serial: null,
    available: port.available,
    busy: false,
    error: null,
  };
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<LocationSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };
  async function refresh() {
    const own = generation;
    if (!port.available || snapshot.busy) return;
    try {
      const status = await port.getStatus();
      if (own === generation && !snapshot.busy)
        publish(snapshot.actorId ? status : { ...unavailableLocationStatus, reason: 'off' });
    } catch {
      if (own === generation) publish({ error: "Couldn't check location access. Try again." });
    }
  }
  async function change(operation: () => Promise<LocationStatus>) {
    if (!port.available || !snapshot.actorId || snapshot.busy) return false;
    const own = ++generation;
    publish({ busy: true, error: null });
    try {
      const status = await operation();
      if (own !== generation) return false;
      publish(status);
      if (status.reason === 'storage') {
        publish({
          error:
            'Your location preference could not be saved. Capture is stopped. Free up phone storage and retry turning this off before restarting the app.',
        });
        return false;
      }
      return true;
    } catch {
      if (own === generation)
        publish({
          error: "Couldn't update location access. Check phone permissions and try again.",
        });
      return false;
    } finally {
      if (own === generation) publish({ busy: false });
    }
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async setContext(context: LocationContext) {
      const own = ++generation;
      publish({ ...unavailableLocationStatus, ...context, busy: port.available, error: null });
      if (!port.available) return;
      try {
        await port.setContext(context);
        const status = await port.getStatus();
        if (own === generation)
          publish(context.actorId ? status : { ...unavailableLocationStatus, reason: 'off' });
      } catch {
        if (own === generation)
          publish({ error: "Location capture isn't ready. Open Settings and try again." });
      } finally {
        if (own === generation) publish({ busy: false });
      }
    },
    setEnabled: (enabled: boolean) => change(() => port.setEnabled(enabled)),
    requestBackground: () => change(() => port.requestBackground()),
    refresh,
    // Read current native state instead of trusting delayed event payloads from a prior account.
    listen: () =>
      port.subscribe(() => {
        void refresh();
      }),
  };
}
export type RecordingLocationController = ReturnType<typeof createRecordingLocationController>;
