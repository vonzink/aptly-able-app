import * as Crypto from 'expo-crypto';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { phoneRecorder } from '../../services/phone-recorder';
import { recordingActivity } from '../../services/recording-activity';
import { createRecordingActivityCoordinator } from './recording-activity';
import { useEnrollmentController } from '../../bootstrap/AppProviders';
import { useRecordingsController } from '../recordings/RecordingsProvider';
import {
  createPhoneRecordingController,
  type PhoneRecordingController,
} from './phone-recording-controller';
const Context = createContext<PhoneRecordingController | null>(null);
export function PhoneRecordingProvider({ children }: { children: ReactNode }) {
  const library = useRecordingsController();
  const enrollment = useEnrollmentController();
  const controller = useMemo(
    () =>
      createPhoneRecordingController({
        port: phoneRecorder,
        save: (audio, stillOwner) =>
          library.savePhoneRecording(
            audio,
            () => stillOwner() && enrollment.getSnapshot().actorId === audio.actorId,
          ),
        createId: Crypto.randomUUID,
        now: () => new Date().toISOString(),
      }),
    [library, enrollment],
  );
  useEffect(() => {
    const activity = createRecordingActivityCoordinator(recordingActivity);
    const display = () => {
      void activity.update(controller.getSnapshot());
    };
    const removeDisplay = controller.subscribe(display);
    let actor = enrollment.getSnapshot().actorId;
    void controller.activate(actor);
    const remove = enrollment.subscribe(() => {
      const next = enrollment.getSnapshot().actorId;
      if (next !== actor) {
        actor = next;
        void controller.activate(next);
      }
    });
    const timer = setInterval(() => controller.refresh(), 500);
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        controller.refresh();
        display();
      }
    });
    return () => {
      remove();
      clearInterval(timer);
      app.remove();
      void controller.activate(null).then(removeDisplay);
    };
  }, [controller, enrollment]);
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}
export function usePhoneRecording() {
  const controller = useContext(Context);
  if (!controller) throw new Error('Phone recording provider is missing.');
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return {
    controller,
    snapshot,
    available: phoneRecorder.available,
    microphoneInUse: snapshot.busy || snapshot.phase === 'recording' || snapshot.phase === 'paused',
  };
}

export function useHasPhoneRecordingDraft() {
  const controller = useContext(Context);
  if (!controller) throw new Error('Phone recording provider is missing.');
  const snapshot = () => !!controller.getSnapshot().draft;
  return useSyncExternalStore(controller.subscribe, snapshot, snapshot);
}
