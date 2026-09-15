import type { RecordingsController } from '../recordings/recordings-controller';
import { sourceKey, type PlaudRecordingSource } from '../recordings/recording-model';
import type { PlaudFilePort, PlaudRecordingFile, PlaudRecorderCommand } from './plaud-file-port';
import { sendRecorderCommand } from './recorder-command';
import { receivePlaudAudio, TransferFailure } from './plaud-audio-transfer';
import { transferRestartMessage } from './transfer-recovery';
import type { PlaudSyncSnapshot } from './plaud-sync-model';
export type { PlaudSyncSnapshot } from './plaud-sync-model';

type Connection = { actorId: string; serial: string };

export function createPlaudSyncController({
  native,
  library,
  refreshMs = 30_000,
  timeoutMs = 60_000,
}: {
  native: PlaudFilePort;
  library: RecordingsController;
  refreshMs?: number;
  timeoutMs?: number;
}) {
  let snapshot: PlaudSyncSnapshot = {
    phase: native.isAvailable ? 'waiting' : 'unavailable',
    progress: null,
    message: null,
    activity: 'unknown',
    sessionId: null,
    command: null,
    transport: 'bluetooth',
    wifiAvailable: !!native.wifi,
    controlsAvailable: !!native.controlRecorder,
    completed: 0,
    total: 0,
    cancelling: false,
    busy: false,
    wifiQueued: false,
    restartRequired: false,
  };
  const listeners = new Set<() => void>();
  let connection: Connection | null = null;
  let generation = 0;
  let disposed = false;
  let recording: boolean | null = null;
  let recordingRevision = 0;
  let cancelled = false;
  let cancelControl: (() => void) | undefined;
  let cancelState: (() => void) | undefined;
  let running: Promise<void> | null = null;
  let rescan = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let subscriptions: Array<{ remove(): void }> = [];
  let cancelList: (() => void) | undefined;
  const publish = (change: Partial<PlaudSyncSnapshot>) => {
    if (disposed) return;
    snapshot = { ...snapshot, ...change };
    listeners.forEach((listener) => listener());
  };
  const connected = (own: number) => !disposed && own === generation && connection !== null;
  const alive = (own: number) => connected(own) && !cancelled;
  const schedule = (delay = refreshMs) => {
    clearTimeout(timer);
    if (connection && !disposed && !cancelled)
      timer = setTimeout(() => {
        void sync(snapshot.wifiQueued);
      }, delay);
  };
  function fileList(): Promise<PlaudRecordingFile[]> {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (files?: PlaudRecordingFile[]) => {
        if (done) return;
        done = true;
        clearTimeout(deadline);
        subscription.remove();
        cancelList = undefined;
        if (files) resolve(files);
        else
          reject(
            new TransferFailure(
              'The recorder did not return its recording list. Keep it nearby and try again.',
            ),
          );
      };
      const deadline = setTimeout(() => finish(), timeoutMs);
      cancelList = () => finish();
      const subscription = native.addListener('fileList', ({ files }) => finish(files));
      void Promise.resolve()
        .then(() => native.getFileList())
        .catch(() => finish());
    });
  }
  const eligible = (file: PlaudRecordingFile, serial: string) =>
    file.sn === serial &&
    Number.isSafeInteger(file.sessionId) &&
    file.sessionId >= 0 &&
    Number.isSafeInteger(file.size) &&
    file.size > 0 &&
    Number.isFinite(file.duration) &&
    file.duration >= 0;

  async function reconcileState(own: number) {
    if (recording !== null) return;
    const revision = recordingRevision;
    const abort = new AbortController();
    cancelState = () => abort.abort();
    const deadline = setTimeout(() => abort.abort(), timeoutMs);
    let onAbort!: () => void;
    const cancelled = new Promise<never>((_resolve, reject) => {
      onAbort = () =>
        reject(
          new TransferFailure(
            'The recorder did not confirm its current state. Keep it nearby and try syncing again.',
          ),
        );
      abort.signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      const state = await Promise.race([native.getRecordingState(abort.signal), cancelled]);
      if (!alive(own) || revision !== recordingRevision) return;
      if (state !== 'idle' && state !== 'recording')
        throw new TransferFailure(
          'The recorder state is not ready. Stop any recording and try syncing again.',
        );
      recording = state === 'recording';
      publish({ activity: state });
      if (recording) publish({ phase: 'recording', progress: null, message: null });
    } finally {
      clearTimeout(deadline);
      abort.signal.removeEventListener('abort', onAbort);
      cancelState = undefined;
    }
  }

  async function transfer(
    file: PlaudRecordingFile,
    source: PlaudRecordingSource,
    own: number,
    restore?: { id: string; keep: boolean; name: string },
  ) {
    const revision = recordingRevision;
    const current = () => alive(own) && recording === false && revision === recordingRevision;
    publish({ phase: 'syncing', progress: 0, message: null });
    return receivePlaudAudio({
      native,
      library,
      file,
      source,
      current,
      timeoutMs,
      transport: snapshot.transport,
      ...(restore ? { restore } : {}),
      onProgress: (progress) => publish({ progress }),
      onSaving: () => publish({ phase: 'saving', progress: null }),
      onStalled: (restartRequired) =>
        publish({
          phase: 'error',
          progress: null,
          restartRequired,
          wifiQueued: false,
          message: restartRequired
            ? transferRestartMessage
            : 'The interrupted transfer has stopped. Keep your recorder nearby and retry. Recordings already saved will be skipped.',
        }),
    });
  }
  async function cycle(own: number, selected: Connection, wifi: boolean) {
    await library.initialize();
    if (!alive(own)) return;
    if (!library.getSnapshot().readable || library.getSnapshot().unavailableCount > 0)
      throw new TransferFailure(
        'Sync is paused because your saved recordings could not be read. Refresh your library, then retry the transfer.',
      );
    publish({ phase: 'checking', progress: null, message: null });
    await reconcileState(own);
    if (!alive(own) || recording !== false) return;
    const revision = recordingRevision;
    const current = () => alive(own) && recording === false && revision === recordingRevision;
    const files = await fileList();
    const pending: Array<{ file: PlaudRecordingFile; source: PlaudRecordingSource }> = [];
    const seen = new Set<string>();
    for (const file of files) {
      if (!current()) return;
      if (!eligible(file, selected.serial)) continue;
      const source: PlaudRecordingSource = {
        kind: 'plaud',
        actorId: selected.actorId,
        serial: selected.serial,
        sessionId: file.sessionId,
        sizeBytes: file.size,
      };
      const key = sourceKey(source);
      if (seen.has(key)) continue;
      seen.add(key);
      if (
        library
          .getSnapshot()
          .recordings.some((record) => record.source && sourceKey(record.source) === key)
      )
        continue;
      if (await library.isSourceDismissed(source)) continue;
      pending.push({ file, source });
    }
    if (!current()) return;
    publish({ total: pending.length, completed: 0 });
    if (wifi && pending.length) {
      publish({ phase: 'connecting-wifi' });
      await native.wifi!.start();
    }
    for (const { file, source } of pending) {
      if (!current()) return;
      if (!wifi && snapshot.wifiQueued) break;
      if (await transfer(file, source, own)) {
        if (alive(own)) publish({ completed: snapshot.completed + 1 });
      }
      if (snapshot.phase === 'error') return;
    }
    if (current()) publish({ phase: 'idle', progress: null, message: null });
  }
  function sync(wifi = false): Promise<void> {
    if (!connection || !native.isAvailable || disposed) return Promise.resolve();
    if (recording) {
      schedule();
      return Promise.resolve();
    }
    if (running) {
      if (snapshot.restartRequired) return running;
      if (wifi && native.wifi && snapshot.transport === 'bluetooth')
        publish({
          wifiQueued: true,
          message: 'Wi-Fi will start after the current operation finishes.',
        });
      rescan = true;
      return running;
    }
    if (wifi && !native.wifi) {
      publish({ message: 'Wi-Fi transfer requires an updated phone app.' });
      return Promise.resolve();
    }
    cancelled = false;
    publish({
      transport: wifi ? 'wifi' : 'bluetooth',
      cancelling: false,
      completed: 0,
      total: 0,
      busy: true,
      wifiQueued: false,
    });
    clearTimeout(timer);
    const own = generation;
    running = cycle(own, connection, wifi)
      .catch((error) => {
        if (alive(own) && recording) {
          publish({
            phase: 'recording',
            progress: null,
            message: 'Transfer paused while your recorder is recording.',
          });
          return;
        }
        if (alive(own))
          publish({
            phase: 'error',
            progress: null,
            message:
              error instanceof TransferFailure
                ? error.message
                : snapshot.phase === 'connecting-wifi'
                  ? 'Wi-Fi could not connect. Check Wi-Fi permissions and keep the recorder nearby, or use Bluetooth.'
                  : 'Recording transfer failed. Keep your recorder nearby and try syncing again.',
          });
      })
      .finally(async () => {
        if (wifi) await native.wifi!.stop().catch(() => undefined);
        running = null;
        publish({ busy: false });
        if (own === generation && cancelled) {
          publish({
            phase: recording ? 'recording' : 'idle',
            progress: null,
            cancelling: false,
            message: 'Wi-Fi transfer stopped. Recordings already saved remain in your library.',
          });
        }
        if (connection && !disposed) {
          const immediate = rescan || snapshot.wifiQueued;
          rescan = false;
          if ((snapshot.phase !== 'error' || snapshot.wifiQueued) && !cancelled)
            schedule(immediate ? 0 : refreshMs);
        }
      });
    return running;
  }
  async function receive(id: string, keep: boolean): Promise<boolean> {
    const record = library.getSnapshot().recordings.find((item) => item.id === id);
    const source = record?.source;
    if (
      !native.isAvailable ||
      !source ||
      source.actorId !== connection?.actorId ||
      source.serial !== connection.serial
    ) {
      publish({ message: 'Connect this recording’s recorder to load its audio.' });
      return false;
    }
    const own = generation;
    while (running) {
      if (!connected(own) || snapshot.restartRequired) return false;
      let onChange = () => {};
      const interrupted = new Promise<void>((resolve) => {
        onChange = () => {
          if (!connected(own) || snapshot.restartRequired) resolve();
        };
        listeners.add(onChange);
      });
      try {
        // Release this UI request on interruption, but retain ownership of the
        // native export until its terminal callback. Never open a second lane.
        await Promise.race([running, interrupted]);
      } finally {
        listeners.delete(onChange);
      }
      if (!connected(own) || snapshot.restartRequired) return false;
    }
    if (recording) {
      publish({ message: 'Stop the current recording before loading audio.' });
      return false;
    }
    clearTimeout(timer);
    cancelled = false;
    publish({ transport: 'bluetooth', cancelling: false, busy: true });
    let received = false;
    running = (async () => {
      if (
        !library.getSnapshot().recordings.some((item) => item.id === id) ||
        (await library.isSourceDismissed(source))
      )
        throw new TransferFailure('This recording was deleted from the app.');
      if (!alive(own)) return;
      publish({ phase: 'checking', progress: null, message: null });
      await reconcileState(own);
      if (!alive(own) || recording !== false) return;
      const revision = recordingRevision;
      const files = await fileList();
      if (!alive(own) || recording !== false || revision !== recordingRevision) return;
      const file = files.find(
        (item) =>
          eligible(item, source.serial) &&
          item.sessionId === source.sessionId &&
          item.size === source.sizeBytes,
      );
      if (!file)
        throw new TransferFailure('The original audio is no longer available on this recorder.');
      received =
        (await transfer(file, source, own, { id, keep, name: record.originalName })) === true;
      if (alive(own) && received) publish({ phase: 'idle', progress: null, message: null });
    })()
      .catch((error) => {
        if (alive(own))
          publish({
            phase: 'error',
            progress: null,
            message:
              error instanceof TransferFailure
                ? error.message
                : 'Audio could not be loaded. Keep your recorder nearby and try again.',
          });
      })
      .finally(() => {
        running = null;
        publish({ busy: false });
        if (snapshot.phase !== 'error' || snapshot.wifiQueued)
          schedule(snapshot.wifiQueued ? 0 : refreshMs);
      });
    await running;
    return received;
  }
  function setConnection(next: Connection | null) {
    if (disposed || (connection?.actorId === next?.actorId && connection?.serial === next?.serial))
      return;
    generation++;
    if (snapshot.transport === 'wifi') void native.wifi?.stop().catch(() => undefined);
    cancelControl?.();
    cancelled = false;
    connection = next;
    recording = null;
    recordingRevision++;
    rescan = false;
    clearTimeout(timer);
    cancelState?.();
    cancelList?.();
    subscriptions.forEach((subscription) => subscription.remove());
    subscriptions = [];
    publish({
      phase: native.isAvailable ? 'waiting' : 'unavailable',
      progress: null,
      message: null,
      activity: 'unknown',
      sessionId: null,
      command: null,
      cancelling: false,
      wifiQueued: false,
      busy: running !== null,
    });
    if (!next || !native.isAvailable) return;
    const own = generation;
    const started = (event: { sessionId: number; status: number }) => {
      if (!connected(own)) return;
      if (event.status !== 0) return;
      recordingRevision++;
      recording = true;
      publish({
        phase: 'recording',
        activity: 'recording',
        sessionId: event.sessionId,
        progress: null,
        message: null,
      });
      if (snapshot.transport === 'wifi') void native.wifi?.stop().catch(() => undefined);
    };
    subscriptions = [
      native.addListener('recordStart', started),
      native.addListener('recordResume', started),
      native.addListener('recordPause', (event) => {
        if (!connected(own)) return;
        recordingRevision++;
        recording = true;
        publish({
          phase: 'recording',
          activity: 'paused',
          sessionId: event.sessionId,
          progress: null,
        });
        if (snapshot.transport === 'wifi') void native.wifi?.stop().catch(() => undefined);
      }),
      native.addListener('recordStop', () => {
        if (!connected(own)) return;
        recordingRevision++;
        recording = false;
        publish({ phase: 'idle', activity: 'idle', sessionId: null });
        schedule(750);
      }),
    ];
    void sync();
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setConnection,
    sync: () => sync(),
    syncWifi: () => sync(true),
    cancelWifi() {
      if (snapshot.wifiQueued) {
        publish({
          wifiQueued: false,
          message: 'Wi-Fi request cancelled. Bluetooth sync will continue.',
        });
        return;
      }
      if (!running || snapshot.transport !== 'wifi' || snapshot.cancelling) return;
      cancelled = true;
      cancelState?.();
      cancelList?.();
      publish({ cancelling: true, message: 'Stopping Wi-Fi transfer…' });
      void native.wifi?.stop().catch(() => undefined);
    },
    async control(command: PlaudRecorderCommand) {
      if (!connection || running || !native.controlRecorder) return;
      const { activity, sessionId } = snapshot;
      const allowed =
        command === 'start'
          ? activity === 'idle'
          : command === 'stop'
            ? activity === 'recording' || activity === 'paused'
            : command === 'pause'
              ? activity === 'recording' && sessionId !== null
              : activity === 'paused' && sessionId !== null;
      if (!allowed) return;
      cancelled = false;
      clearTimeout(timer);
      const own = generation;
      const abort = new AbortController();
      cancelControl = () => abort.abort();
      publish({ command, busy: true, message: null });
      running = sendRecorderCommand(native, command, sessionId, abort.signal)
        .catch((error) => {
          if (!alive(own)) return;
          recording = null;
          publish({
            activity: 'unknown',
            sessionId: null,
            message: error instanceof Error ? error.message : 'Recorder action failed.',
          });
        })
        .finally(() => {
          running = null;
          publish({ busy: false });
          cancelControl = undefined;
          if (own === generation) publish({ command: null });
          if (connection && !disposed) schedule(750);
        });
      await running;
    },
    receive,
    dispose() {
      setConnection(null);
      disposed = true;
      listeners.clear();
    },
  };
}
export type PlaudSyncController = ReturnType<typeof createPlaudSyncController>;
