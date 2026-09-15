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
function fixture(overrides: Partial<PlaudFilePort> = {}, storage: Partial<RecordingStore> = {}) {
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
    ...storage,
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

it('does not start a transfer against an unreadable library and can retry after storage recovers', async () => {
  let readable = false;
  const test = fixture(
    {},
    {
      list: async () => {
        if (!readable) throw new Error('storage unavailable');
        return [...test.saved.values()];
      },
    },
  );
  test.controller.setConnection(context);
  await flush();
  expect(test.native.exportAudio).not.toHaveBeenCalled();
  expect(test.controller.getSnapshot()).toMatchObject({ phase: 'error', busy: false });
  readable = true;
  await test.controller.sync();
  expect(test.saved.size).toBe(1);
});

it('does not export repeated entries in one recorder list more than once', async () => {
  const test = fixture({ getFileList: async () => test.emit('fileList', { files: [file, file] }) });
  test.controller.setConnection(context);
  await flush();
  expect(test.native.exportAudio).toHaveBeenCalledTimes(1);
  expect(test.controller.getSnapshot()).toMatchObject({ total: 1, completed: 1, phase: 'idle' });
});

it('discards an export if recording started and stopped before its completion', async () => {
  const pending = deferred<{ sessionId: number; outputPath: string }>();
  const test = fixture({ exportAudio: vi.fn(() => pending.promise) });
  test.controller.setConnection(context);
  await flush();
  test.emit('recordStart', { sessionId: 43, status: 0 });
  test.emit('recordStop', { sessionId: 43, fileExist: true, fileSize: 100 });
  pending.resolve({ sessionId: 42, outputPath: '/exports/42.mp3' });
  await flush();
  expect(test.saved.size).toBe(0);
  expect(test.native.removeExport).toHaveBeenCalledWith('/exports/42.mp3');
});

it('rechecks the file list after a start/stop arrives during list discovery', async () => {
  const test = fixture({ getFileList: vi.fn(async () => {}) });
  test.controller.setConnection(context);
  await flush();
  test.emit('recordStart', { sessionId: 43, status: 0 });
  test.emit('recordStop', { sessionId: 43, fileExist: true, fileSize: 100 });
  test.emit('fileList', { files: [file] });
  await flush();
  expect(test.native.exportAudio).not.toHaveBeenCalled();
  vi.mocked(test.native.getFileList).mockImplementation(async () =>
    test.emit('fileList', { files: [file] }),
  );
  await vi.advanceTimersByTimeAsync(1001);
  expect(test.saved.size).toBe(1);
});

it('does not let repeated progress values hide a stalled native transfer', async () => {
  const pending = deferred<{ sessionId: number; outputPath: string }>();
  const test = fixture({ exportAudio: vi.fn(() => pending.promise) });
  test.controller.setConnection(context);
  await flush();
  test.emit('exportProgress', { sessionId: 42, progress: 20, message: '' });
  for (let n = 0; n < 3; n++) {
    await vi.advanceTimersByTimeAsync(800);
    test.emit('exportProgress', { sessionId: 42, progress: 20, message: '' });
  }
  expect(test.controller.getSnapshot()).toMatchObject({ phase: 'error', busy: true });
  expect(test.native.exportAudio).toHaveBeenCalledTimes(1);
  pending.resolve({ sessionId: 42, outputPath: '/exports/42.mp3' });
  await flush();
  expect(test.saved.size).toBe(0);
});

it('keeps a stalled old exporter blocked across reconnect and clears restart guidance only after it settles', async () => {
  const pending = deferred<{ sessionId: number; outputPath: string }>();
  const test = fixture({ exportAudio: vi.fn(() => pending.promise) });
  test.controller.setConnection(context);
  await flush();
  test.controller.setConnection(null);
  test.controller.setConnection(context);
  await vi.advanceTimersByTimeAsync(2001);
  expect(test.controller.getSnapshot()).toMatchObject({ restartRequired: true, busy: true });
  expect(test.native.exportAudio).toHaveBeenCalledTimes(1);
  pending.resolve({ sessionId: 42, outputPath: '/exports/42.mp3' });
  await flush();
  expect(test.saved.size).toBe(0);
  expect(test.controller.getSnapshot()).toMatchObject({ restartRequired: false, busy: false });
  vi.mocked(test.native.exportAudio).mockResolvedValue({
    sessionId: 42,
    outputPath: '/exports/42.mp3',
  });
  await test.controller.sync();
  expect(test.saved.size).toBe(1);
});

it('allows advancing transfers to finish even when the whole transfer exceeds the inactivity limit', async () => {
  const pending = deferred<{ sessionId: number; outputPath: string }>();
  const test = fixture({ exportAudio: vi.fn(() => pending.promise) });
  test.controller.setConnection(context);
  await flush();
  for (const progress of [20, 40, 60]) {
    await vi.advanceTimersByTimeAsync(1500);
    test.emit('exportProgress', { sessionId: 42, progress, message: '' });
  }
  expect(test.controller.getSnapshot()).toMatchObject({ phase: 'syncing', progress: 60 });
  pending.resolve({ sessionId: 42, outputPath: '/exports/42.mp3' });
  await flush();
  expect(test.saved.size).toBe(1);
});

it('retries only the unsaved files after a batch is interrupted', async () => {
  let failed = false;
  const test = fixture({
    getFileList: async () => test.emit('fileList', { files: [file, { ...file, sessionId: 43 }] }),
    exportAudio: vi.fn(async (sessionId) => {
      if (sessionId === 43 && !failed) {
        failed = true;
        throw new Error('disconnected');
      }
      return { sessionId, outputPath: `/exports/${sessionId}.mp3` };
    }),
  });
  test.controller.setConnection(context);
  await test.controller.sync();
  expect(test.saved.size).toBe(1);
  expect(test.controller.getSnapshot()).toMatchObject({ phase: 'error', busy: false });
  await test.controller.sync();
  expect(test.saved.size).toBe(2);
  expect(vi.mocked(test.native.exportAudio).mock.calls.map(([id]) => id)).toEqual([42, 43, 43]);
  expect(test.controller.getSnapshot()).toMatchObject({ phase: 'idle', total: 1, completed: 1 });
});

it('cleans up failed Wi-Fi transfer and allows retry over Bluetooth', async () => {
  const test = fixture({
    getFileList: vi.fn(async () => test.emit('fileList', { files: [] })),
    wifi: {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      exportAudio: vi.fn(async () => {
        throw new Error('Wi-Fi disconnected');
      }),
    },
  });
  test.controller.setConnection(context);
  await test.controller.sync();
  vi.mocked(test.native.getFileList).mockImplementation(async () =>
    test.emit('fileList', { files: [file] }),
  );
  await test.controller.syncWifi();
  expect(test.saved.size).toBe(0);
  expect(test.controller.getSnapshot()).toMatchObject({ phase: 'error', busy: false });
  expect(test.native.wifi!.stop).toHaveBeenCalled();
  await test.controller.sync();
  expect(test.saved.size).toBe(1);
  expect(test.controller.getSnapshot()).toMatchObject({ phase: 'idle', transport: 'bluetooth' });
});

it('ignores late SDK progress once export completed while the local save is still pending', async () => {
  const saving = deferred<void>();
  const test = fixture(
    {},
    {
      saveAudio: async (record) => {
        await saving.promise;
        test.saved.set(record.id, record);
      },
    },
  );
  test.controller.setConnection(context);
  await flush();
  expect(test.library.getSnapshot().busy).toBe(true);
  test.emit('exportProgress', { sessionId: 42, progress: 100, message: '' });
  await vi.advanceTimersByTimeAsync(2001);
  expect(test.controller.getSnapshot()).toMatchObject({ phase: 'saving', restartRequired: false });
  saving.resolve();
  await flush();
  expect(test.saved.size).toBe(1);
  expect(test.controller.getSnapshot()).toMatchObject({ phase: 'idle', busy: false });
});

it.each(['disconnect', 'stall'] as const)(
  'releases a queued Load audio request after a %s without overlapping the SDK',
  async (reason) => {
    const test = fixture();
    test.controller.setConnection(context);
    await test.controller.sync();
    const id = [...test.saved.keys()][0]!;
    const pending = deferred<{ sessionId: number; outputPath: string }>();
    vi.mocked(test.native.exportAudio).mockImplementation(() => pending.promise);
    vi.mocked(test.native.getFileList).mockImplementation(async () =>
      test.emit('fileList', { files: [{ ...file, sessionId: 43 }] }),
    );
    void test.controller.sync();
    await flush();
    let received: boolean | undefined;
    void test.controller.receive(id, false).then((value) => {
      received = value;
    });
    if (reason === 'disconnect') test.controller.setConnection(null);
    else await vi.advanceTimersByTimeAsync(2001);
    await flush();
    expect(received).toBe(false);
    expect(test.native.exportAudio).toHaveBeenCalledTimes(2);
    pending.resolve({ sessionId: 43, outputPath: '/exports/43.mp3' });
    await flush();
  },
);
