import type { PhoneRecordingAudio } from '../phone-recording/phone-recording-model';
import { readRecordingLocation } from '../recording-location/location-model';
import type { RecordingLocationArchive } from '../recording-location/location-port';
import {
  assertLocalRecording,
  validateAudioImport,
  validateTitle,
  validateRecordingNotes,
  sourceKey,
  type PlaudRecordingSource,
  type AudioImport,
  type LocalRecording,
  type RecordingStore,
  type RecordingPatch,
} from './recording-model';
import { parseTranscript } from './transcript-parser';

export interface RecordingsSnapshot {
  recordings: LocalRecording[];
  unavailableCount: number;
  /** A failed root read must never be treated as an empty, usable library. */
  readable: boolean;
  loading: boolean;
  busy: boolean;
  error: string | null;
}
export interface RecordingsController {
  getSnapshot(): RecordingsSnapshot;
  subscribe(listener: () => void): () => void;
  initialize(): Promise<void>;
  reload(): Promise<void>;
  importAudio(input: AudioImport): Promise<string | null>;
  savePhoneRecording(audio: PhoneRecordingAudio, stillOwner: () => boolean): Promise<string | null>;
  clearAccountPhoneDrafts(actorId: string): Promise<void>;
  importDeviceAudio(input: AudioImport, source: PlaudRecordingSource): Promise<string | null>;
  isSourceDismissed(source: PlaudRecordingSource): Promise<boolean>;
  keepOnPhone(id: string): Promise<boolean>;
  restoreDeviceAudio(id: string, input: AudioImport, keep: boolean): Promise<boolean>;
  clearTemporaryAudio(): Promise<boolean>;
  rename(id: string, title: string): Promise<boolean>;
  saveDetails(id: string, details: { title: string; notes: string }): Promise<boolean>;
  remove(id: string): Promise<boolean>;
  removeLocation(id: string): Promise<boolean>;
  clearAccountLocations(actorId: string): Promise<void>;
  attachTranscript(id: string, fileName: string, text: string): Promise<boolean>;
  setDuration(id: string, seconds: number): Promise<void>;
  clearError(): void;
}

export function createRecordingsController({
  store,
  createId,
  now,
  locations,
  phoneDrafts,
}: {
  store: RecordingStore;
  createId: () => string;
  now: () => string;
  locations?: RecordingLocationArchive;
  phoneDrafts?: { clearActor(actorId: string): Promise<void> };
}): RecordingsController {
  let snapshot: RecordingsSnapshot = {
    recordings: [],
    unavailableCount: 0,
    readable: false,
    loading: false,
    busy: false,
    error: null,
  };
  const listeners = new Set<() => void>();
  let queue = Promise.resolve();
  let pending = 0;
  let initialized = false;
  let initialization: Promise<void> | undefined;

  function publish(update: Partial<RecordingsSnapshot>) {
    snapshot = { ...snapshot, ...update };
    for (const listener of listeners) listener();
  }

  function run<T>(
    operation: () => Promise<T>,
    fallback: T,
    message: string,
    exposeError = false,
  ): Promise<T> {
    pending += 1;
    publish({ busy: true, error: null });
    const next = queue.then(async () => {
      try {
        return await operation();
      } catch (error) {
        publish({ error: exposeError && error instanceof Error ? error.message : message });
        return fallback;
      } finally {
        pending -= 1;
        publish({ busy: pending > 0 });
      }
    });
    queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  function find(id: string) {
    const record = snapshot.recordings.find((item) => item.id === id);
    if (!record) throw new Error('This recording is no longer in your local library.');
    return record;
  }

  async function update(id: string, patch: RecordingPatch) {
    find(id);
    const next = await store.update(id, patch);
    assertLocalRecording(next);
    publish({
      recordings: snapshot.recordings.map((record) => (record.id === id ? next : record)),
    });
    return true;
  }

  async function refreshLibrary() {
    try {
      const result = store.readLibrary
        ? await store.readLibrary()
        : { recordings: await store.list(), unavailableCount: 0 };
      result.recordings.forEach(assertLocalRecording);
      result.recordings.sort((left, right) => right.importedAt.localeCompare(left.importedAt));
      publish({ ...result, readable: true });
      initialized = true;
    } catch (error) {
      initialized = false;
      publish({ readable: false });
      throw error;
    }
  }

  function reload(): Promise<void> {
    return run(
      async () => {
        publish({ loading: true });
        try {
          await refreshLibrary();
          // Import order need not match capture order: newer offline imports must
          // not strand an older recording whose metadata write failed.
          if (locations) {
            for (const record of snapshot.recordings) await attachLocation(record);
          }
          initialized = true;
        } finally {
          publish({ loading: false });
        }
      },
      undefined,
      "Couldn't load your local recordings. Try again.",
    );
  }

  async function attachLocation(record: LocalRecording) {
    if (!record.source || !locations) return;
    // Only completed audio enters this path: Plaud sync verifies idle (including
    // not paused) and an unchanged session revision before committing the export.
    // "interrupted" describes GPS coverage, not recorder terminality; a recorder
    // stopped while disconnected legitimately has no native final-stop callback.
    // The audio is already durable. Coordinate failure must never invalidate it.
    try {
      const pending = await locations.read(record.source);
      if (!pending) return;
      if (record.location === undefined) {
        const captured = readRecordingLocation(pending, record.source.sessionId);
        if (!captured || !['complete', 'interrupted'].includes(captured.status)) return;
        await update(record.id, { location: captured });
      }
      await locations.remove(record.source);
    } catch {
      // Keep pending data for a later import/reload; explicit removal has a visible failure path.
    }
  }

  function importAudio(input: AudioImport, source?: PlaudRecordingSource) {
    return run(
      async () => {
        if (source) {
          // A previous save may have committed even if its following read failed.
          // Reconcile persisted identities before deciding to write another record.
          await refreshLibrary();
          if (await store.deviceAudio?.isDismissed(source))
            throw new Error('This recording was deleted from the app.');
          const existing = snapshot.recordings.find(
            (record) => record.source && sourceKey(record.source) === sourceKey(source),
          );
          if (existing) {
            await attachLocation(existing);
            return existing.id;
          }
          if (snapshot.unavailableCount > 0)
            throw new Error(
              'Some saved recordings could not be read. Refresh your library before receiving new recordings.',
            );
        }
        const mimeType = validateAudioImport(input);
        const record: LocalRecording = {
          id: createId(),
          title: validateTitle(input.name.replace(/\.[^.]+$/, '').slice(0, 200)),
          originalName: input.name,
          importedAt: now(),
          sizeBytes: input.sizeBytes,
          mimeType,
          durationSeconds: null,
          transcript: null,
          ...(source ? { source, retention: 'temporary' as const } : {}),
        };
        assertLocalRecording(record);
        await store.saveAudio(record, input);
        if (source) {
          await refreshLibrary();
          await attachLocation(record);
        } else publish({ recordings: [record, ...snapshot.recordings] });
        return record.id;
      },
      null,
      "Couldn't save the received recording. Try again.",
      true,
    );
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    initialize() {
      if (initialized) return Promise.resolve();
      initialization ??= reload().finally(() => {
        initialization = undefined;
      });
      return initialization;
    },
    reload,
    importAudio: (input) => importAudio(input),
    savePhoneRecording(audio, stillOwner) {
      return run(
        async () => {
          await refreshLibrary();
          if (!stillOwner())
            throw new Error('Sign in to the recording owner account before saving.');
          const existing = snapshot.recordings.find((record) => record.id === audio.id);
          if (existing) {
            if (
              existing.phoneCapture?.actorId !== audio.actorId ||
              existing.sizeBytes !== audio.input.sizeBytes
            )
              throw new Error('The saved recording does not match this phone recording.');
            return existing.id;
          }
          const record: LocalRecording = {
            id: audio.id,
            title: `Phone recording ${new Date(audio.createdAt).toLocaleString()}`,
            originalName: audio.input.name,
            importedAt: audio.createdAt,
            mimeType: validateAudioImport(audio.input),
            sizeBytes: audio.input.sizeBytes,
            durationSeconds: audio.durationSeconds,
            transcript: null,
            phoneCapture: { actorId: audio.actorId, createdAt: audio.createdAt },
          };
          assertLocalRecording(record);
          await store.saveAudio(record, audio.input);
          publish({ recordings: [record, ...snapshot.recordings] });
          return record.id;
        },
        null,
        'The recording could not be saved. Retry without discarding it.',
      );
    },
    clearAccountPhoneDrafts: (actorId) => {
      // Share the library queue with saves: deletion cannot race a pending commit.
      const task = queue.then(() => phoneDrafts?.clearActor(actorId));
      queue = task.then(
        () => undefined,
        () => undefined,
      );
      return task.then(() => undefined);
    },
    importDeviceAudio: (input, source) => importAudio(input, source),
    isSourceDismissed: (source) => store.deviceAudio?.isDismissed(source) ?? Promise.resolve(false),
    keepOnPhone(id) {
      return run(
        async () => {
          find(id);
          if (!store.deviceAudio)
            throw new Error('Keeping recorder audio offline requires the phone app.');
          await store.deviceAudio.keep(id);
          await refreshLibrary();
          return true;
        },
        false,
        "Couldn't keep this recording offline. Try again.",
        true,
      );
    },
    restoreDeviceAudio(id, input, keep) {
      return run(
        async () => {
          find(id); // A deletion queued during transfer must not recreate the recording.
          if (!store.deviceAudio) throw new Error('Loading recorder audio requires the phone app.');
          await store.deviceAudio.restore(id, input, keep);
          await refreshLibrary();
          return true;
        },
        false,
        "Couldn't receive this recording.",
        true,
      );
    },
    clearTemporaryAudio() {
      return run(
        async () => {
          if (!store.deviceAudio) return false;
          await store.deviceAudio.clearTemporary();
          await refreshLibrary();
          return true;
        },
        false,
        "Couldn't clear temporary audio. Try again.",
      );
    },
    rename(id, title) {
      return run(
        () => update(id, { title: validateTitle(title) }),
        false,
        "Couldn't rename this recording.",
        true,
      );
    },
    saveDetails(id, details) {
      return run(
        () =>
          update(id, {
            title: validateTitle(details.title),
            notes: validateRecordingNotes(details.notes),
          }),
        false,
        "Couldn't save your title and notes. Your edits are still here; try again.",
      );
    },
    remove(id) {
      return run(
        async () => {
          const record = find(id);
          if (record.source) await locations?.remove(record.source);
          await store.remove(id);
          publish({ recordings: snapshot.recordings.filter((record) => record.id !== id) });
          return true;
        },
        false,
        "Couldn't remove this recording. Try again.",
      );
    },
    removeLocation(id) {
      return run(
        async () => {
          const record = find(id);
          if (record.source) await locations?.remove(record.source);
          return update(id, { location: null });
        },
        false,
        "Couldn't remove this location. Try again.",
      );
    },
    clearAccountLocations: (actorId) => locations?.clearActor(actorId) ?? Promise.resolve(),
    attachTranscript(id, fileName, source) {
      return run(
        () =>
          update(id, {
            transcript: { fileName, ...parseTranscript(fileName, source), importedAt: now() },
          }),
        false,
        "Couldn't save this transcript.",
        true,
      );
    },
    setDuration(id, seconds) {
      return run(
        async () => {
          if (!Number.isFinite(seconds) || seconds < 0) return;
          const record = snapshot.recordings.find((item) => item.id === id);
          if (!record || record.durationSeconds === seconds) return;
          await update(id, { durationSeconds: seconds });
        },
        undefined,
        "Couldn't save the recording duration.",
      );
    },
    clearError() {
      if (snapshot.error) publish({ error: null });
    },
  };
}
