import { ApiError, type TranscriptionClient, type UploadRequestOptions } from '@aptly/api-client';
import type {
  ProcessingRecording,
  ProcessingStatus,
  TranscriptionCapabilities,
} from '@aptly/contracts';
import type { LocalRecording, RecordingStore } from '../recordings/recording-model';

export type PreparedAudio = { body: BodyInit; fetch?: UploadRequestOptions['fetch'] };
export type TranscriptionSnapshot = {
  actorId: string | null;
  capabilities: TranscriptionCapabilities | null;
  record: ProcessingRecording | null;
  busy: 'loading' | 'uploading' | 'retrying' | null;
  error: string | null;
};
type Dependencies = {
  client: TranscriptionClient;
  recording: Pick<LocalRecording, 'id' | 'title' | 'originalName' | 'sizeBytes'>;
  openAudio: RecordingStore['openAudio'];
  prepareAudio(uri: string, signal: AbortSignal): Promise<PreparedAudio>;
  onUnauthorized?(): void;
};
export interface TranscriptionController {
  getSnapshot(): TranscriptionSnapshot;
  subscribe(listener: () => void): () => void;
  activate(actorId: string | null): Promise<void>;
  deactivate(): void;
  setTitle(title: string): void;
  refresh(): Promise<void>;
  generate(): Promise<void>;
  retry(acknowledgeDuplicateRisk: boolean): Promise<void>;
}
export function isProcessing(status: ProcessingStatus | undefined): boolean {
  return (
    status === 'queued' ||
    status === 'uploading' ||
    status === 'submitting' ||
    status === 'transcribing'
  );
}

export function createTranscriptionController(deps: Dependencies): TranscriptionController {
  let title = deps.recording.title;
  let snapshot: TranscriptionSnapshot = {
    actorId: null,
    capabilities: null,
    record: null,
    busy: null,
    error: null,
  };
  const listeners = new Set<() => void>();
  let mounted = false;
  let epoch = 0;
  let activeRequest: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let releaseAudio: (() => void) | null = null;
  const update = (next: Partial<TranscriptionSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    listeners.forEach((listener) => listener());
  };
  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }
  function cancel() {
    epoch++;
    clearTimer();
    activeRequest?.abort();
    activeRequest = null;
    releaseAudio?.();
    releaseAudio = null;
  }
  function schedule() {
    clearTimer();
    if (mounted && snapshot.actorId && isProcessing(snapshot.record?.status))
      timer = setTimeout(() => {
        timer = null;
        void poll();
      }, 3000);
  }
  async function run(
    busy: NonNullable<TranscriptionSnapshot['busy']>,
    task: (signal: AbortSignal, alive: () => boolean) => Promise<void>,
  ) {
    if (!mounted || snapshot.busy) return;
    clearTimer();
    const requestEpoch = epoch;
    const request = new AbortController();
    activeRequest = request;
    const alive = () => mounted && requestEpoch === epoch && !request.signal.aborted;
    update({ busy, error: null });
    try {
      await task(request.signal, alive);
    } catch (error) {
      if (!alive()) return;
      if (error instanceof ApiError && error.status === 401) {
        cancel();
        update({ actorId: null, record: null, busy: null, error: error.message });
        deps.onUnauthorized?.();
        return;
      }
      update({
        error:
          error instanceof ApiError
            ? error.message
            : 'The recording could not be processed. Check your connection and try again.',
      });
    } finally {
      if (alive()) {
        activeRequest = null;
        update({ busy: null });
        schedule();
      }
    }
  }
  async function get(signal: AbortSignal): Promise<ProcessingRecording | null> {
    try {
      return await deps.client.get(deps.recording.id, { signal });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404 && error.code === 'RECORDING_NOT_FOUND')
        return null;
      throw error;
    }
  }
  async function refresh() {
    await run('loading', async (signal, alive) => {
      const capabilities = await deps.client.capabilities({ signal });
      if (!alive()) return;
      update({ capabilities });
      if (snapshot.actorId) {
        const record = await get(signal);
        if (alive()) update({ record });
      }
    });
  }
  async function poll() {
    if (!snapshot.actorId) return;
    await run('loading', async (signal, alive) => {
      const record = await get(signal);
      if (alive()) update({ record });
    });
  }
  async function generate() {
    if (!snapshot.actorId || !snapshot.capabilities?.available) return;
    await run('uploading', async (signal, alive) => {
      let record = await get(signal);
      if (!alive()) return;
      if (!record) {
        record = await deps.client.register(
          {
            id: deps.recording.id,
            title,
            fileName: deps.recording.originalName,
            sizeBytes: deps.recording.sizeBytes,
          },
          { signal },
        );
        if (!alive()) return;
      }
      update({ record });
      if (record.status !== 'awaiting_upload') return;
      const source = await deps.openAudio(deps.recording.id);
      let released = false;
      const release = () => {
        if (!released) {
          released = true;
          source.release();
        }
      };
      if (!alive()) {
        release();
        return;
      }
      releaseAudio = release;
      try {
        const prepared = await deps.prepareAudio(source.uri, signal);
        if (!alive()) return;
        const uploaded = await deps.client.upload(record.id, prepared.body, {
          signal,
          ...(prepared.fetch ? { fetch: prepared.fetch } : {}),
        });
        if (alive()) update({ record: uploaded });
      } finally {
        release();
        if (releaseAudio === release) releaseAudio = null;
      }
    });
  }
  async function retry(acknowledgeDuplicateRisk: boolean) {
    const status = snapshot.record?.status;
    if (
      !snapshot.actorId ||
      !snapshot.capabilities?.available ||
      (status !== 'failed' && status !== 'submission_uncertain') ||
      (status === 'submission_uncertain' && !acknowledgeDuplicateRisk)
    )
      return;
    await run('retrying', async (signal, alive) => {
      const current = await get(signal);
      if (!alive()) return;
      update({ record: current });
      if (
        !current ||
        (current.status !== 'failed' && current.status !== 'submission_uncertain') ||
        (current.status === 'submission_uncertain' && !acknowledgeDuplicateRisk)
      )
        return;
      const record = await deps.client.retry(current.id, acknowledgeDuplicateRisk, { signal });
      if (alive()) update({ record });
    });
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async activate(actorId) {
      cancel();
      mounted = true;
      update({
        actorId,
        record: actorId === snapshot.actorId ? snapshot.record : null,
        busy: null,
        error: null,
      });
      await refresh();
    },
    deactivate() {
      mounted = false;
      cancel();
      update({ busy: null });
    },
    setTitle(value) {
      // A local rename affects future registration, not an in-flight upload or poll.
      title = value;
    },
    refresh,
    generate,
    retry,
  };
}
