import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPlaudSyncController } from '../src/features/plaud-device/plaud-sync-controller';
import type {
  PlaudFileEvents,
  PlaudFilePort,
  PlaudRecordingFile,
} from '../src/features/plaud-device/plaud-file-port';
import { createRecordingsController } from '../src/features/recordings/recordings-controller';
import {
  applyRecordingPatch,
  type LocalRecording,
  type RecordingStore,
} from '../src/features/recordings/recording-model';

const actorId = '201b4a9f-80dd-4b9b-bdd0-ac5e907ddc08';
const serial = '88212345B6789012';
const file: PlaudRecordingFile = { sn: serial, sessionId: 42, size: 100, channels: 1, duration: 5 };
const context = { actorId, serial };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { resolve, reject, promise };
}
async function flush() {
  for (let n = 0; n < 60; n++) await Promise.resolve();
}
const disposals: Array<() => void> = [];
function fixture(overrides: Partial<PlaudFilePort> = {}) {
  const saved = new Map<string, LocalRecording>();
  const store: RecordingStore = {
    list: async () => [...saved.values()],
    saveAudio: async (record) => {
      saved.set(record.id, structuredClone(record));
    },
    update: async (id, patch) => {
      const record = applyRecordingPatch(saved.get(id)!, patch);
      saved.set(id, record);
      return record;
    },
    remove: async (id) => {
      saved.delete(id);
    },
    openAudio: async () => ({ uri: 'file:///recording.mp3', release() {} }),
  };
  const library = createRecordingsController({
    store,
    createId: randomUUID,
    now: () => new Date().toISOString(),
  });
  const listeners = new Map<keyof PlaudFileEvents, Set<(value: unknown) => void>>();
  const emit = <K extends keyof PlaudFileEvents>(name: K, event: PlaudFileEvents[K]) =>
    listeners.get(name)?.forEach((listener) => listener(event));
  const native: PlaudFilePort = {
    isAvailable: true,
    getRecordingState: vi.fn(async () => 'idle' as const),
    getFileList: vi.fn(async () => {
      emit('fileList', { files: [file] });
    }),
    exportAudio: vi.fn(async (sessionId) => ({ sessionId, outputPath: '/exports/42.mp3' })),
    readExport: async () => ({
      uri: 'file:///exports/42.mp3',
      name: '42.mp3',
      sizeBytes: 50,
      mimeType: 'audio/mpeg',
    }),
    removeExport: vi.fn(async () => {}),
    addListener: (name, listener) => {
      const set = listeners.get(name) ?? new Set();
      const callback = listener as (event: unknown) => void;
      set.add(callback);
      listeners.set(name, set);
      return {
        remove: () => {
          set.delete(callback);
        },
      };
    },
    ...overrides,
  };
  const controller = createPlaudSyncController({
    native,
    library,
    refreshMs: 1000,
    timeoutMs: 2000,
  });
  disposals.push(() => controller.dispose());
  return { controller, native, library, saved, emit };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  disposals.splice(0).forEach((dispose) => dispose());
  vi.clearAllTimers();
  vi.useRealTimers();
});

it('automatically saves and deduplicates completed recorder audio after a verified connection', async () => {
  const test = fixture();
  expect(test.native.exportAudio).not.toHaveBeenCalled();
  test.controller.setConnection(context);
  await flush();
  expect(test.saved.size).toBe(1);
  expect([...test.saved.values()][0]).toMatchObject({
    sizeBytes: 50,
    source: { kind: 'plaud', actorId, serial, sessionId: 42, sizeBytes: 100 },
    durationSeconds: 5,
  });
  await test.controller.sync();
  expect(test.native.exportAudio).toHaveBeenCalledTimes(1);
  test.controller.setConnection(null);
  test.controller.setConnection(context);
  await flush();
  expect(test.native.exportAudio).toHaveBeenCalledTimes(1);
  expect(test.controller.getSnapshot().phase).toBe('idle');
});

it('does not overlap exports or import a late completion after sign-out', async () => {
  const exportResult = deferred<{ sessionId: number; outputPath: string }>();
  const test = fixture({ exportAudio: vi.fn(() => exportResult.promise) });
  test.controller.setConnection(context);
  await flush();
  test.controller.setConnection(null);
  test.controller.setConnection({ actorId: '301b4a9f-80dd-4b9b-bdd0-ac5e907ddc08', serial });
  await flush();
  expect(test.native.exportAudio).toHaveBeenCalledTimes(1);
  test.controller.setConnection(null);
  exportResult.resolve({ sessionId: 42, outputPath: '/exports/42.mp3' });
  await flush();
  expect(test.saved.size).toBe(0);
});

it('ignores other recorders and invalid or empty device files', async () => {
  const test = fixture({
    getFileList: vi.fn(async () => {
      test.emit('fileList', {
        files: [
          { ...file, sn: '882999999999' },
          { ...file, size: 0 },
          { ...file, sessionId: -1 },
        ],
      });
    }),
  });
  test.controller.setConnection(context);
  await flush();
  expect(test.saved.size).toBe(0);
  expect(test.native.exportAudio).not.toHaveBeenCalled();
});

it('waits until recording stops, then discovers newly completed audio', async () => {
  const test = fixture({
    getFileList: vi.fn(async () => {
      test.emit('fileList', { files: [] });
    }),
  });
  test.controller.setConnection(context);
  await flush();
  test.emit('recordStart', { sessionId: 43, status: 0 });
  await vi.advanceTimersByTimeAsync(1000);
  expect(test.native.getFileList).toHaveBeenCalledTimes(1);
  vi.mocked(test.native.getFileList).mockImplementation(async () => {
    test.emit('fileList', { files: [{ ...file, sessionId: 43 }] });
  });
  test.emit('recordPause', { sessionId: 43, fileExist: true, fileSize: 100 });
  await flush();
  expect(test.saved.size).toBe(0);
  test.emit('recordStop', { sessionId: 43, fileExist: true, fileSize: 100 });
  vi.mocked(test.native.exportAudio).mockResolvedValue({
    sessionId: 43,
    outputPath: '/exports/43.mp3',
  });
  await vi.advanceTimersByTimeAsync(1000);
  expect(test.saved.size).toBe(1);
});

it('reports a missing file-list callback and permits a later retry', async () => {
  const test = fixture({ getFileList: vi.fn(async () => {}) });
  test.controller.setConnection(context);
  await vi.advanceTimersByTimeAsync(2001);
  expect(test.controller.getSnapshot().phase).toBe('error');
  vi.mocked(test.native.getFileList).mockImplementation(async () => {
    test.emit('fileList', { files: [file] });
  });
  await test.controller.sync();
  expect(test.saved.size).toBe(1);
});

it('reports a stalled export without starting a second native export or saving late audio', async () => {
  const exportResult = deferred<{ sessionId: number; outputPath: string }>();
  const test = fixture({ exportAudio: vi.fn(() => exportResult.promise) });
  test.controller.setConnection(context);
  await flush();
  await vi.advanceTimersByTimeAsync(2001);
  expect(test.controller.getSnapshot().phase).toBe('error');
  void test.controller.sync();
  await flush();
  expect(test.native.exportAudio).toHaveBeenCalledTimes(1);
  test.controller.setConnection(null);
  exportResult.resolve({ sessionId: 42, outputPath: '/exports/42.mp3' });
  await flush();
  expect(test.saved.size).toBe(0);
});

it('surfaces the actual save failure without assuming disk space or repeating failed transfers', async () => {
  const test = fixture();
  test.library.importDeviceAudio = async () => null;
  const originalSnapshot = test.library.getSnapshot;
  test.library.getSnapshot = () => ({
    ...originalSnapshot(),
    error: 'The audio copy was incomplete.',
  });
  test.controller.setConnection(context);
  await flush();
  expect(test.controller.getSnapshot()).toMatchObject({
    phase: 'error',
    message: 'The audio copy was incomplete.',
  });
  await vi.advanceTimersByTimeAsync(30_000);
  expect(test.native.exportAudio).toHaveBeenCalledTimes(1);
});

it('does not transfer a dismissed recording again after reconnecting', async () => {
  const test = fixture();
  test.library.isSourceDismissed = async () => true;
  test.controller.setConnection(context);
  await flush();
  test.controller.setConnection(null);
  test.controller.setConnection(context);
  await flush();
  expect(test.saved.size).toBe(0);
  expect(test.native.exportAudio).not.toHaveBeenCalled();
});

it('reloads cleared audio on request without creating another library entry', async () => {
  const test = fixture();
  test.controller.setConnection(context);
  await flush();
  const existing = [...test.saved.values()][0]!;
  test.saved.set(existing.id, { ...existing, audioAvailable: false });
  await test.library.reload();
  test.library.restoreDeviceAudio = async (id, input, keep) => {
    expect(input.name).toBe(existing.originalName);
    test.saved.set(id, {
      ...existing,
      audioAvailable: true,
      retention: keep ? 'downloaded' : 'temporary',
    });
    await test.library.reload();
    return true;
  };
  expect(await test.controller.receive(existing.id, true)).toBe(true);
  expect(test.saved.size).toBe(1);
  expect(test.library.getSnapshot().recordings[0]).toMatchObject({
    id: existing.id,
    retention: 'downloaded',
    audioAvailable: true,
  });
});

it('requires the matching connected recorder for an audio request', async () => {
  const test = fixture();
  test.controller.setConnection(context);
  await flush();
  const id = [...test.saved.values()][0]!.id;
  test.controller.setConnection(null);
  expect(await test.controller.receive(id, false)).toBe(false);
  expect(test.controller.getSnapshot().message).toMatch(/connect/i);
  expect(test.native.exportAudio).toHaveBeenCalledTimes(1);
});

it('reconciles a recording that continues across background and foreground before exporting', async () => {
  const test = fixture({ getFileList: vi.fn(async () => test.emit('fileList', { files: [] })) });
  test.controller.setConnection(context);
  await flush();
  test.emit('recordStart', { sessionId: 43, status: 0 });
  test.controller.setConnection(null);
  vi.mocked(test.native.getRecordingState).mockResolvedValue('recording');
  vi.mocked(test.native.getFileList).mockImplementation(async () =>
    test.emit('fileList', { files: [file] }),
  );
  test.controller.setConnection(context);
  await flush();
  expect(test.native.exportAudio).not.toHaveBeenCalled();
  expect(test.controller.getSnapshot().phase).toBe('recording');
  vi.mocked(test.native.getRecordingState).mockResolvedValue('idle');
  test.emit('recordStop', { sessionId: 43, fileExist: true, fileSize: 100 });
  await vi.advanceTimersByTimeAsync(1000);
  expect(test.saved.size).toBe(1);
});

it('waits for current state on first connection and ignores a late idle reply after a start event', async () => {
  const state = deferred<'idle' | 'recording' | 'unknown'>();
  const test = fixture({ getRecordingState: vi.fn(() => state.promise) });
  test.controller.setConnection(context);
  await flush();
  expect(test.native.exportAudio).not.toHaveBeenCalled();
  test.emit('recordStart', { sessionId: 43, status: 0 });
  state.resolve('idle');
  await flush();
  expect(test.native.exportAudio).not.toHaveBeenCalled();
  expect(test.controller.getSnapshot().phase).toBe('recording');
});

it('blocks unknown state and allows a fresh state request to recover without reconnecting', async () => {
  const test = fixture({ getRecordingState: vi.fn(async () => 'unknown' as const) });
  test.controller.setConnection(context);
  await flush();
  expect(test.native.exportAudio).not.toHaveBeenCalled();
  expect(test.controller.getSnapshot().phase).toBe('error');
  vi.mocked(test.native.getRecordingState).mockResolvedValue('idle');
  await test.controller.sync();
  expect(test.saved.size).toBe(1);
});

it('bounds an unanswered state request and does not accept a late answer from an older connection', async () => {
  const state = deferred<'idle' | 'recording' | 'unknown'>();
  const test = fixture({ getRecordingState: vi.fn(() => state.promise) });
  test.controller.setConnection(context);
  await vi.advanceTimersByTimeAsync(2001);
  expect(test.controller.getSnapshot().phase).toBe('error');
  expect(test.native.exportAudio).not.toHaveBeenCalled();
  test.controller.setConnection(null);
  state.resolve('idle');
  await flush();
  expect(test.saved.size).toBe(0);
});
