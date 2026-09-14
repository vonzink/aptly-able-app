import Constants from 'expo-constants';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { createReplaySafeLifecycle } from '../../bootstrap/recorder-lifecycle';
import { plaudFiles } from '../../services/plaud-files';
import type { EnrollmentController } from '../enrollment/enrollment-controller';
import { useRecordingsController } from '../recordings/RecordingsProvider';
import type { PlaudDeviceController } from './plaud-device-controller';
import { createPlaudSyncController, type PlaudSyncController } from './plaud-sync-controller';

const Context = createContext<PlaudSyncController | null>(null);
export function PlaudSyncProvider({
  children,
  device,
  enrollment,
}: {
  children: ReactNode;
  device: PlaudDeviceController;
  enrollment: EnrollmentController;
}) {
  const library = useRecordingsController();
  const controller = useMemo(
    () => createPlaudSyncController({ native: plaudFiles, library }),
    [library],
  );
  const lifecycle = useMemo(() => createReplaySafeLifecycle(controller), [controller]);
  useEffect(() => {
    // System Wi-Fi permission sheets are inactive, not backgrounded app sessions.
    let foreground = AppState.currentState !== 'background';
    const update = () => {
      const connection = device.getSnapshot();
      const session = enrollment.getSnapshot();
      controller.setConnection(
        foreground &&
          Constants.expoConfig?.extra?.recorderMode !== 'mock' &&
          connection.phase === 'ready' &&
          !connection.release &&
          connection.assignment &&
          session.actorId &&
          session.operation?.status === 'pending'
          ? { actorId: session.actorId, serial: connection.assignment.serial }
          : null,
      );
    };
    const unsubscribeDevice = device.subscribe(update);
    const unsubscribeEnrollment = enrollment.subscribe(update);
    const appState = AppState.addEventListener('change', (state) => {
      foreground = state !== 'background';
      update();
    });
    const teardown = lifecycle.setup();
    update();
    return () => {
      unsubscribeDevice();
      unsubscribeEnrollment();
      appState.remove();
      teardown();
    };
  }, [controller, device, enrollment, lifecycle]);
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}
export function usePlaudSync() {
  const controller = useContext(Context);
  if (!controller) throw new Error('Recorder sync provider is missing.');
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return { controller, snapshot };
}
