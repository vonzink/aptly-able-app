import type { PlaudFilePort, PlaudRecorderCommand } from './plaud-file-port';

/** A dispatch acknowledgement is not proof that the recorder changed state. */
export function sendRecorderCommand(
  port: PlaudFilePort,
  command: PlaudRecorderCommand,
  sessionId: number | null,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!port.controlRecorder || signal.aborted) {
      reject(new Error('Reconnect with an updated phone app to use recorder controls.'));
      return;
    }
    let settled = false;
    const subscriptions: Array<{ remove(): void }> = [];
    const finish = (message?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      subscriptions.forEach((subscription) => subscription.remove());
      if (message) reject(new Error(message));
      else resolve();
    };
    const abort = () => finish('Recorder control was interrupted. Reconnect to read its state.');
    const timer = setTimeout(
      () => finish('The recorder did not confirm this action. Refresh its state before trying again.'),
      15_000,
    );
    signal.addEventListener('abort', abort, { once: true });
    const confirm = (event: { sessionId: number; status?: number }) => {
      if (command !== 'start' && sessionId !== null && event.sessionId !== sessionId) return;
      finish(event.status !== undefined && event.status !== 0
        ? 'The recorder could not perform this action.' : undefined);
    };
    try {
      const event = {
        start: 'recordStart',
        stop: 'recordStop',
        pause: 'recordPause',
        resume: 'recordResume',
      } as const;
      subscriptions.push(port.addListener(event[command], confirm));
      void port.controlRecorder(command, sessionId).catch(() =>
        finish('The recorder command could not be sent. Check its connection and try again.'),
      );
    } catch {
      finish('The recorder command could not be sent.');
    }
  });
}
