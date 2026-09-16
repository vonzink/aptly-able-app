import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { recordingLocation } from '../../services/recording-location';
import type { EnrollmentController } from '../enrollment/enrollment-controller';
import type { PlaudDeviceController } from '../plaud-device/plaud-device-controller';
import {
  createRecordingLocationController,
  type RecordingLocationController,
} from './location-controller';
const Context = createContext<RecordingLocationController | null>(null);
export function RecordingLocationProvider({
  children,
  device,
  enrollment,
}: {
  children: ReactNode;
  device: PlaudDeviceController;
  enrollment: EnrollmentController;
}) {
  const controller = useMemo(() => createRecordingLocationController(recordingLocation), []);
  useEffect(() => {
    let key = '';
    const update = (force = false) => {
      const session = enrollment.getSnapshot();
      const connection = device.getSnapshot();
      const actorId = session.actorId;
      const serial =
        actorId &&
        connection.phase === 'ready' &&
        !connection.release &&
        session.operation?.status === 'pending'
          ? (connection.assignment?.serial ?? null)
          : null;
      const nextKey = `${actorId ?? ''}:${serial ?? ''}`;
      if (!force && nextKey === key) return;
      key = nextKey;
      // No foreground gate: native capture remains eligible during a locked-screen recording.
      void controller.setContext({ actorId, serial });
    };
    const unsubDevice = device.subscribe(() => update());
    const unsubEnrollment = enrollment.subscribe(() => update());
    const unlisten = controller.listen();
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !controller.getSnapshot().busy) update(true);
    });
    update(true);
    return () => {
      unsubDevice();
      unsubEnrollment();
      unlisten();
      foreground.remove();
      void controller.setContext({ actorId: null, serial: null });
    };
  }, [controller, device, enrollment]);
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}
export function useRecordingLocation() {
  const controller = useContext(Context);
  if (!controller) throw new Error('Recording location provider is missing.');
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return { controller, snapshot };
}
