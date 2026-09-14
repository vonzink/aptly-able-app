import type { PlaudRecordingState } from './plaud-file-port';

/** The SDK state callback has no request ID. Never overlap unanswered reads. */
export function createPlaudStateReader(port: {
  request(): Promise<void>;
  subscribe(answer: (state: unknown) => void, disconnected: () => void): () => void;
}) {
  let pending = false;
  return (signal: AbortSignal): Promise<PlaudRecordingState> => {
    if (signal.aborted) return Promise.reject(new Error('Recorder state check cancelled.'));
    if (pending)
      return Promise.reject(
        new Error(
          'Waiting for the previous recorder state check. Reconnect if it does not recover.',
        ),
      );
    pending = true;
    return new Promise((resolve, reject) => {
      let settled = false;
      let finished = false;
      let unsubscribe = () => {};
      const abort = () => {
        if (settled) return;
        settled = true;
        reject(new Error('Recorder state check cancelled.'));
        // Keep ownership until the reply/disconnect; a late reply must not satisfy
        // the next caller. The controller owns the user-visible deadline.
      };
      const cleanup = () => {
        if (finished) return false;
        finished = true;
        pending = false;
        signal.removeEventListener('abort', abort);
        unsubscribe();
        return true;
      };
      const fail = () => {
        if (!cleanup()) return;
        if (!settled)
          reject(new Error('The recorder state could not be read. Reconnect and try again.'));
        settled = true;
      };
      try {
        unsubscribe = port.subscribe((state) => {
          if (!cleanup()) return;
          if (!settled) resolve(state === 'idle' || state === 'recording' ? state : 'unknown');
          settled = true;
        }, fail);
        if (finished) {
          unsubscribe();
          return;
        }
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) {
          abort();
          cleanup();
          return;
        }
        void port.request().catch(fail);
      } catch {
        fail();
      }
    });
  };
}
