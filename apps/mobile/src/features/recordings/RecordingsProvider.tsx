import { recordingLocation } from '../../services/recording-location';
import * as Crypto from 'expo-crypto';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createRecordingsController, type RecordingsController } from './recordings-controller';
import { recordingStore } from '../../services/recordings/recording-store';
import type { EnrollmentController } from '../enrollment/enrollment-controller';

const Context = createContext<RecordingsController | null>(null);
const OwnerContext = createContext<string | null>(null);
export function RecordingsProvider({
  children,
  enrollment,
}: {
  children: ReactNode;
  enrollment: EnrollmentController;
}) {
  const session = useSyncExternalStore(
    enrollment.subscribe,
    enrollment.getSnapshot,
    enrollment.getSnapshot,
  );
  const controller = useMemo(
    () =>
      createRecordingsController({
        store: recordingStore,
        locations: recordingLocation,
        createId: Crypto.randomUUID,
        now: () => new Date().toISOString(),
      }),
    [],
  );
  useEffect(() => {
    void controller.initialize();
  }, [controller]);
  return (
    <Context.Provider value={controller}>
      <OwnerContext.Provider value={session.actorId}>{children}</OwnerContext.Provider>
    </Context.Provider>
  );
}
export function useRecordingsController() {
  const controller = useContext(Context);
  if (!controller) throw new Error('Recording library is unavailable.');
  return controller;
}
function useLibrarySnapshot() {
  const controller = useRecordingsController();
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}
export function useRecordings() {
  const snapshot = useLibrarySnapshot();
  const actorId = useContext(OwnerContext);
  const recordings = useMemo(
    () =>
      snapshot.recordings.filter((record) => !record.source || record.source.actorId === actorId),
    [snapshot.recordings, actorId],
  );
  return useMemo(() => ({ ...snapshot, recordings }), [snapshot, recordings]);
}

// Cache clearing applies to this installation, including audio from earlier sign-ins.
// Expose totals without exposing other accounts' recording entries to the UI.
export function useRecordingStorageUsage() {
  const snapshot = useLibrarySnapshot();
  const usage = useMemo(() => {
    let temporaryBytes = 0;
    let retainedBytes = 0;
    for (const recording of snapshot.recordings) {
      if (recording.audioAvailable === false) continue;
      if (recording.retention === 'temporary') temporaryBytes += recording.sizeBytes;
      else retainedBytes += recording.sizeBytes;
    }
    return { temporaryBytes, retainedBytes };
  }, [snapshot.recordings]);
  return {
    ...usage,
    loading: snapshot.loading,
    busy: snapshot.busy,
    error: snapshot.error,
    incomplete: snapshot.unavailableCount > 0,
  };
}
