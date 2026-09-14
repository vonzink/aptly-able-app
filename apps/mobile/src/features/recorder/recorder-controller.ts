import type { RecorderSummary } from '@aptly/contracts';

import type { RecorderAdapter } from './recorder-adapter';

export type RecorderStatus = 'idle' | 'scanning' | 'found' | 'connecting' | 'connected' | 'error';

export interface RecorderSnapshot {
  readonly mode: 'mock';
  readonly status: RecorderStatus;
  readonly recorders: readonly RecorderSummary[];
  readonly connectedRecorder: RecorderSummary | null;
  readonly error: string | null;
}

export interface RecorderController {
  getSnapshot(): RecorderSnapshot;
  subscribe(listener: () => void): () => void;
  scan(): Promise<void>;
  cancel(): void;
  connect(recorder: RecorderSummary): Promise<void>;
  disconnect(): Promise<void>;
  dispose(): void;
}

const initialSnapshot: RecorderSnapshot = {
  mode: 'mock',
  status: 'idle',
  recorders: [],
  connectedRecorder: null,
  error: null,
};

export function createRecorderController(adapter: RecorderAdapter): RecorderController {
  let snapshot = initialSnapshot;
  let operation = 0;
  let disposed = false;
  const listeners = new Set<() => void>();

  const publish = (next: RecorderSnapshot) => {
    if (disposed) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  const unsubscribeAdapter = adapter.subscribe((event) => {
    if (event.type !== 'disconnected') return;
    operation += 1;
    publish({ ...initialSnapshot, error: 'Your recorder disconnected.' });
  });

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async scan() {
      const ownOperation = ++operation;
      publish({ ...snapshot, status: 'scanning', recorders: [], error: null });
      try {
        const recorders = await adapter.scan();
        if (disposed || ownOperation !== operation) return;
        publish({
          ...snapshot,
          status: recorders.length > 0 ? 'found' : 'error',
          recorders,
          error:
            recorders.length > 0
              ? null
              : "Couldn't find your recorder. Make sure it's nearby and powered on.",
        });
      } catch {
        if (disposed || ownOperation !== operation) return;
        publish({
          ...snapshot,
          status: 'error',
          recorders: [],
          error: "Couldn't find your recorder. Make sure it's nearby and powered on.",
        });
      }
    },
    cancel() {
      operation += 1;
      adapter.cancelScan();
      publish({ ...snapshot, status: 'idle', recorders: [], error: null });
    },
    async connect(recorder) {
      const ownOperation = ++operation;
      publish({ ...snapshot, status: 'connecting', connectedRecorder: null, error: null });
      try {
        const connectedRecorder = await adapter.connect(recorder);
        if (disposed || ownOperation !== operation) return;
        publish({
          ...snapshot,
          status: 'connected',
          connectedRecorder,
          recorders: [connectedRecorder],
          error: null,
        });
      } catch {
        if (disposed || ownOperation !== operation) return;
        publish({
          ...snapshot,
          status: 'error',
          connectedRecorder: null,
          error: "We couldn't connect to your recorder. Move it closer and try again.",
        });
      }
    },
    async disconnect() {
      const ownOperation = ++operation;
      publish({ ...initialSnapshot });
      try {
        await adapter.disconnect();
      } catch {
        if (disposed || ownOperation !== operation) return;
        publish({
          ...initialSnapshot,
          status: 'error',
          error: "We couldn't disconnect your recorder. Please try again.",
        });
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      operation += 1;
      listeners.clear();
      unsubscribeAdapter();
    },
  };
}
