import type { PlaudSyncSnapshot } from './plaud-sync-model';

type Recovery = { action: 'retry' | 'restart-app'; message: string };
export const transferRestartMessage =
  'Transfer stopped responding. Close Aptly Able completely, reopen it, then reconnect your recorder. Recordings already saved remain in your library.';

/** Retry is safe only after the SDK has released the previous export. */
export function transferRecovery(
  snapshot: Pick<PlaudSyncSnapshot, 'phase' | 'busy' | 'restartRequired' | 'message'>,
): Recovery | null {
  if (snapshot.restartRequired) return { action: 'restart-app', message: transferRestartMessage };
  if (snapshot.phase === 'error' && !snapshot.busy)
    return {
      action: 'retry',
      message:
        snapshot.message ??
        'Transfer was interrupted. Keep your recorder nearby and retry. Recordings already saved will be skipped.',
    };
  return null;
}
