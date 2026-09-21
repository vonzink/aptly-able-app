import type { PhoneRecordingSnapshot } from './phone-recording-controller';

// Only status and timing reach the lock screen, never account IDs, titles or audio.
export interface RecordingActivityContent {
  paused: boolean;
  elapsedSeconds: number;
  timerStart: number;
  timerEnd: number;
}
export interface RecordingActivityPort {
  show(content: RecordingActivityContent, staleAt: number): Promise<void>;
  end(): Promise<void>;
}

export function createRecordingActivityCoordinator(port: RecordingActivityPort, now = Date.now) {
  let previousKey = '';
  let lastUpdate = 0;
  let retry = false;
  let queue = Promise.resolve();
  // Serialize native updates so a delayed start cannot resurrect an activity after sign-out.
  function update(state: PhoneRecordingSnapshot) {
    const active = state.actorId && state.draft && ['recording', 'paused'].includes(state.phase);
    const key = active ? `${state.actorId}:${state.draft!.id}:${state.phase}` : 'off';
    const time = now();
    if (key === previousKey && ((!active && !retry) || time - lastUpdate < 30_000)) return queue;
    previousKey = key;
    lastUpdate = time;
    retry = false;
    const content = {
      paused: state.phase === 'paused',
      elapsedSeconds: Math.floor(state.seconds),
      timerStart: time - state.seconds * 1000,
      timerEnd: time + Math.max(0, 7200 - state.seconds) * 1000,
    };
    queue = queue
      .then(() => (active ? port.show(content, time + 60_000) : port.end()))
      .catch(() => {
        // Live Activities can be disabled by the user. Audio recording must remain usable.
        // Retry on a later refresh, not on every half-second timer tick.
        retry = true;
      });
    return queue;
  }
  return { update };
}
