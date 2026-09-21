import { describe, expect, it } from 'vitest';

import type {
  AudioImport,
  LocalRecording,
  RecordingStore,
} from '../src/features/recordings/recording-model';
import { createRecordingsController } from '../src/features/recordings/recordings-controller';

const id = 'd3a673f4-5f4c-4e54-9a30-08cb1b06e950';
const importedAt = '2026-09-10T12:00:00.000Z';
const input: AudioImport = {
  name: 'Meeting.m4a',
  uri: 'file:///picker/Meeting.m4a',
  sizeBytes: 100,
  mimeType: 'audio/mp4',
};
const record: LocalRecording = {
  id,
  title: 'Meeting',
  originalName: input.name,
  sizeBytes: 100,
  importedAt,
  mimeType: 'audio/mp4',
  durationSeconds: null,
  transcript: null,
};

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fixture(initial: LocalRecording[] = [], overrides: Partial<RecordingStore> = {}) {
  const records = new Map(initial.map((value) => [value.id, structuredClone(value)]));
  const store: RecordingStore = {
    list: async () => Array.from(records.values()).map((value) => structuredClone(value)),
    saveAudio: async (value) => {
      records.set(value.id, structuredClone(value));
    },
    update: async (key, patch) => {
      const previous = records.get(key);
      if (!previous) throw new Error('missing recording');
      const value = { ...previous, ...patch };
      records.set(value.id, structuredClone(value));
      return structuredClone(value);
    },
    remove: async (key) => {
      records.delete(key);
    },
    openAudio: async () => ({ uri: input.uri, release: () => undefined }),
    ...overrides,
  };
  const controller = createRecordingsController({
    store,
    createId: () => id,
    now: () => importedAt,
  });
  return { controller, store, records };
}

describe('local recordings controller', () => {
  it('persists device identity with audio and deduplicates it after controller recreation', async () => {
    const { controller, store, records } = fixture();
    const source = {
      kind: 'plaud' as const,
      actorId: '201b4a9f-80dd-4b9b-bdd0-ac5e907ddc08',
      serial: '882123456789',
      sessionId: 42,
      sizeBytes: 80,
    };
    await controller.initialize();
    expect(await controller.importDeviceAudio(input, source)).toBe(id);
    expect(records.get(id)?.source).toEqual(source);
    const reopened = createRecordingsController({
      store,
      createId: () => {
        throw new Error('duplicate');
      },
      now: () => importedAt,
    });
    await reopened.initialize();
    expect(await reopened.importDeviceAudio(input, source)).toBe(id);
    expect(reopened.getSnapshot().recordings).toHaveLength(1);
  });

  it('only publishes an import after its persistent write succeeds', async () => {
    const pending = deferred();
    const { controller } = fixture([], { saveAudio: () => pending.promise });
    await controller.initialize();
    const importing = controller.importAudio(input);
    expect(controller.getSnapshot().busy).toBe(true);
    expect(controller.getSnapshot().recordings).toEqual([]);
    pending.resolve();
    expect(await importing).toBe(id);
    expect(controller.getSnapshot().recordings).toEqual([record]);
    expect(controller.getSnapshot().busy).toBe(false);
  });

  it('retains data after failed writes and allows a later retry', async () => {
    let fail = true;
    const { controller } = fixture([record], {
      update: async (_key, patch) => {
        if (fail) throw new Error('disk full');
        return { ...record, ...patch };
      },
    });
    await controller.initialize();
    expect(await controller.rename(id, 'New name')).toBe(false);
    expect(controller.getSnapshot().recordings[0]?.title).toBe('Meeting');
    expect(controller.getSnapshot().error).toBeTruthy();
    fail = false;
    expect(await controller.rename(id, 'New name')).toBe(true);
    expect(controller.getSnapshot().recordings[0]?.title).toBe('New name');
  });

  it('does not report failed imports or removals as successful', async () => {
    const failure = async () => {
      throw new Error('storage unavailable');
    };
    const { controller } = fixture([record], { saveAudio: failure, remove: failure });
    await controller.initialize();
    expect(await controller.importAudio(input)).toBeNull();
    expect(await controller.remove(id)).toBe(false);
    expect(controller.getSnapshot().recordings).toEqual([record]);
    expect(controller.getSnapshot().busy).toBe(false);
  });

  it('serializes edits against the last saved version without losing transcript or duration', async () => {
    const firstWrite = deferred();
    const saved: LocalRecording[] = [];
    const { controller } = fixture([record], {
      update: async (_key, patch) => {
        if (!saved.length) await firstWrite.promise;
        const value = { ...(saved.at(-1) ?? record), ...patch };
        saved.push(structuredClone(value));
        return value;
      },
    });
    await controller.initialize();
    const renaming = controller.rename(id, 'Renamed');
    const attaching = controller.attachTranscript(id, 'notes.txt', 'Actual words.');
    const timing = controller.setDuration(id, 91);
    firstWrite.resolve();
    await Promise.all([renaming, attaching, timing]);
    expect(saved.at(-1)).toMatchObject({
      title: 'Renamed',
      durationSeconds: 91,
      transcript: { text: 'Actual words.', segments: [] },
    });
    expect(controller.getSnapshot().recordings[0]).toEqual(saved.at(-1));
  });

  it('does not resurrect a recording when queued edits follow removal', async () => {
    const { controller, records } = fixture([record]);
    await controller.initialize();
    const removing = controller.remove(id);
    const renaming = controller.rename(id, 'Ghost');
    await removing;
    expect(await renaming).toBe(false);
    expect(records.size).toBe(0);
    expect(controller.getSnapshot().recordings).toEqual([]);
  });

  it.each([
    { ...input, name: 'document.pdf' },
    { ...input, sizeBytes: 0 },
    { ...input, sizeBytes: 250 * 1024 * 1024 + 1 },
    { ...input, sizeBytes: Number.NaN },
  ])('rejects unsupported or invalid audio before publishing it', async (audio) => {
    const { controller, records } = fixture();
    expect(await controller.importAudio(audio)).toBeNull();
    expect(records.size).toBe(0);
    expect(controller.getSnapshot().error).toBeTruthy();
  });

  it('rejects blank/oversize names, invalid duration, and invalid transcript without changing saved data', async () => {
    const { controller, records } = fixture([record]);
    await controller.initialize();
    expect(await controller.rename(id, '   ')).toBe(false);
    expect(await controller.rename(id, 'a'.repeat(201))).toBe(false);
    expect(await controller.attachTranscript(id, 'notes.srt', 'invalid timestamps')).toBe(false);
    await controller.setDuration(id, Number.NaN);
    expect(records.get(id)).toEqual(record);
  });

  it('keeps a stable snapshot between notifications and reloads persisted metadata', async () => {
    const { controller, store } = fixture([record]);
    expect(controller.getSnapshot()).toBe(controller.getSnapshot());
    await controller.initialize();
    await controller.rename(id, 'Persisted');
    const reopened = createRecordingsController({
      store,
      createId: () => id,
      now: () => importedAt,
    });
    await reopened.initialize();
    expect(reopened.getSnapshot().recordings[0]?.title).toBe('Persisted');
    expect(reopened.getSnapshot()).toBe(reopened.getSnapshot());
  });
});

describe('phone recording library commits', () => {
  const actorId = '11111111-1111-4111-8111-111111111111';
  const audio = { id, actorId, createdAt: importedAt, uri: input.uri, input, durationSeconds: 20 };
  it('saves ownership and keeps the same identity on retry', async () => {
    const { controller, records } = fixture();
    expect(await controller.savePhoneRecording(audio, () => true)).toBe(id);
    expect(await controller.savePhoneRecording(audio, () => true)).toBe(id);
    expect(records.size).toBe(1);
    expect(records.get(id)?.phoneCapture).toEqual({ actorId, createdAt: importedAt });
    expect(records.get(id)?.source).toBeUndefined();
  });
  it('does not save after the signed-in owner has changed', async () => {
    const { controller, records } = fixture();
    expect(await controller.savePhoneRecording(audio, () => false)).toBeNull();
    expect(records.size).toBe(0);
  });
  it('rejects a duplicate identity belonging to a different recording', async () => {
    const { controller, records } = fixture([record]);
    expect(await controller.savePhoneRecording(audio, () => true)).toBeNull();
    expect(records.get(id)).toEqual(record);
  });
});
