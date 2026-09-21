import {
  MAX_PHONE_RECORDING_SECONDS,
  type PhoneRecorderPort,
  type PhoneRecordingAudio,
  type PhoneRecordingDraft,
} from './phone-recording-model';

export interface PhoneRecordingSnapshot {
  actorId: string | null;
  phase: 'idle' | 'recording' | 'paused' | 'review';
  busy: boolean;
  draft: PhoneRecordingDraft | null;
  seconds: number;
  savedId: string | null;
  error: string | null;
  ready: boolean;
}
export function createPhoneRecordingController(deps: {
  port: PhoneRecorderPort;
  save(audio: PhoneRecordingAudio, stillOwner: () => boolean): Promise<string | null>;
  createId(): string;
  now(): string;
}) {
  const { port } = deps;
  let state: PhoneRecordingSnapshot = {
    actorId: null,
    phase: 'idle',
    busy: false,
    draft: null,
    seconds: 0,
    savedId: null,
    error: null,
    ready: false,
  };
  const listeners = new Set<() => void>();
  let epoch = 0;
  let pending: Promise<unknown> = Promise.resolve();
  const update = (patch: Partial<PhoneRecordingSnapshot>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  async function run<T>(work: (alive: () => boolean) => Promise<T>, fallback: T): Promise<T> {
    if (state.busy || !state.actorId || !state.ready) return fallback;
    const version = epoch;
    const alive = () => version === epoch;
    update({ busy: true, error: null });
    const task = (async () => {
      try {
        return await work(alive);
      } catch (error) {
        if (alive())
          update({
            ...(state.draft && state.phase === 'idle' ? { phase: 'review' as const } : {}),
            error:
              error instanceof Error
                ? error.message
                : 'Recording could not be completed. Try again.',
          });
        return fallback;
      } finally {
        if (alive()) update({ busy: false });
      }
    })();
    pending = task;
    return task;
  }
  const api = {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async activate(actorId: string | null) {
      const version = ++epoch;
      const previous = pending;
      update({
        actorId,
        draft: null,
        phase: 'idle',
        seconds: 0,
        savedId: null,
        busy: true,
        ready: false,
        error: null,
      });
      const task = (async () => {
        await previous;
        try {
          await port.stop(); // Stop the old account's microphone before restoring another draft.
          if (version !== epoch) return;
          const draft = actorId && port.available ? await port.recover(actorId) : null;
          if (version !== epoch) return;
          if (draft && draft.actorId !== actorId)
            throw new Error('This unfinished recording belongs to a different account.');
          update({
            draft,
            phase: draft ? 'review' : 'idle',
            ready: true,
            error: draft
              ? 'An unfinished recording was recovered. Save it or discard it before starting another.'
              : null,
          });
        } catch {
          if (version === epoch)
            update({ error: 'Recording storage is not ready. Retry before making a recording.' });
        } finally {
          if (version === epoch) update({ busy: false });
        }
      })();
      pending = task;
      await task;
    },
    start: () =>
      run(async (alive) => {
        if (!port.available || state.draft || state.phase !== 'idle') return;
        if (!(await port.requestPermission()))
          throw new Error(
            'Microphone permission is needed. Allow it in your phone settings, then try again.',
          );
        if (!alive()) return;
        const draft = await port.prepare({
          id: deps.createId(),
          actorId: state.actorId!,
          createdAt: deps.now(),
        });
        if (!alive()) {
          await port.discard(draft);
          return;
        }
        update({ draft, seconds: 0, savedId: null });
        port.record(MAX_PHONE_RECORDING_SECONDS);
        update({ phase: 'recording' });
      }, undefined),
    pause: () =>
      run(async () => {
        if (state.phase !== 'recording') return;
        port.pause();
        update({ phase: 'paused', seconds: port.status().durationSeconds });
      }, undefined),
    resume: () =>
      run(async () => {
        if (state.phase !== 'paused') return;
        const remaining = MAX_PHONE_RECORDING_SECONDS - state.seconds;
        if (remaining <= 0) {
          await port.stop();
          update({ phase: 'review' });
          return;
        }
        port.record(remaining);
        update({ phase: 'recording' });
      }, undefined),
    stop: () =>
      run(async (alive) => {
        if (!state.draft) return;
        let seconds = state.seconds;
        try {
          seconds = Math.max(seconds, port.status().durationSeconds);
        } catch {
          /* Still attempt native stop when status is unavailable. */
        }
        await port.stop();
        if (alive()) update({ phase: 'review', seconds });
      }, undefined),
    save: () =>
      run(async (alive) => {
        if (!state.draft || state.phase !== 'review') return null;
        const draft = state.draft;
        let id = state.savedId;
        if (!id) {
          const audio = await port.audio(draft);
          if (!alive()) return null;
          id = await deps.save(
            { ...audio, durationSeconds: Math.max(state.seconds, audio.durationSeconds) },
            alive,
          );
          if (!alive()) return null;
          if (!id)
            throw new Error(
              'The recording could not be saved. Your unfinished audio is kept here; retry saving it.',
            );
          update({ savedId: id });
        }
        try {
          await port.discard(draft);
        } catch {
          throw new Error(
            'Your recording is saved. Retry to remove the extra temporary copy before continuing.',
          );
        }
        if (!alive()) return null;
        update({ draft: null, phase: 'idle', seconds: 0, savedId: null });
        return id;
      }, null),
    discard: () =>
      run(async (alive) => {
        if (!state.draft) return;
        await port.stop();
        await port.discard(state.draft);
        if (alive()) update({ draft: null, phase: 'idle', seconds: 0, savedId: null });
      }, undefined),
    refresh() {
      if (state.busy || !['recording', 'paused'].includes(state.phase)) return;
      let status;
      try {
        status = port.status();
      } catch {
        const version = epoch;
        void api.stop().then(() => {
          if (version === epoch)
            update({
              error: 'The microphone stopped responding. Save the available audio or discard it.',
            });
        });
        return;
      }
      update({ seconds: Math.max(state.seconds, status.durationSeconds) });
      if (status.error || status.finished || !status.canRecord) {
        const version = epoch;
        void api.stop().then(() => {
          if (version === epoch && status.error)
            update({
              error:
                'Recording ended after an audio interruption. Save the available audio or discard it.',
            });
        });
      } else if (!status.recording && state.phase === 'recording') {
        update({
          phase: 'paused',
          error: 'Recording was interrupted. Resume when you are ready, or stop and save it.',
        });
      }
    },
  };
  return api;
}
export type PhoneRecordingController = ReturnType<typeof createPhoneRecordingController>;
