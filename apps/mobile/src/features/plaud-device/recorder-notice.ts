import type { PlaudDeviceSnapshot } from './plaud-device-controller';

interface RecorderNotice {
  tone: 'success' | 'neutral';
  message: string;
  actionLabel: string;
}

export function getRecorderNotice(
  snapshot: PlaudDeviceSnapshot,
  simulation = false,
): RecorderNotice {
  const neutral = (message: string, actionLabel = 'View recorder'): RecorderNotice => ({
    tone: 'neutral',
    message,
    actionLabel,
  });
  if (simulation) {
    return neutral(
      'Recorder simulation is enabled. No physical recorder is connected.',
      'Open simulation',
    );
  }
  if (snapshot.phase === 'unavailable') {
    return neutral('Use Aptly Able on your phone to connect your recorder with Bluetooth.');
  }
  if (snapshot.phase === 'signed-out') {
    return neutral('Sign in to set up your assigned recorder.', 'Set up recorder');
  }
  if (snapshot.phase === 'needs-enrollment') {
    return neutral(
      'Open your enrollment invitation to set up your assigned recorder.',
      'Set up recorder',
    );
  }
  if (snapshot.phase === 'unpaired') {
    return neutral('Your recorder is unpaired.', 'Pair recorder');
  }
  if (snapshot.release !== null && snapshot.phase !== 'unpairing') {
    return neutral(
      'Recorder unpairing is incomplete. Open Recorder to finish.',
      'Finish unpairing',
    );
  }
  const name = snapshot.assignment
    ? snapshot.assignment.model === 'notepins'
      ? 'Plaud NotePin S'
      : 'Plaud Note Pro'
    : 'recorder';
  switch (snapshot.phase) {
    case 'ready':
      // Only the controller's complete handshake can report a connected recorder.
      return {
        tone: 'success',
        message: `Your ${name} is connected.`,
        actionLabel: 'View recorder',
      };
    case 'disconnected':
      return neutral(
        `Your ${name} is disconnected. Reconnect when you're ready.`,
        'Reconnect recorder',
      );
    case 'error':
      return neutral('Your recorder needs attention. Open Recorder for details.');
    case 'idle':
      return neutral('Connect your assigned recorder with Bluetooth.', 'Connect recorder');
    case 'found':
      return neutral(
        `Your ${name} is nearby. Open Recorder to finish connecting.`,
        'Connect recorder',
      );
    case 'preparing':
    case 'scanning':
    case 'binding':
    case 'connecting':
      return neutral('Recorder setup is in progress. Keep your recorder nearby.');
    case 'disconnecting':
      return neutral('Disconnecting your recorder. Your pairing will stay saved.');
    case 'unpairing':
      return neutral('Unpairing your recorder. Keep it nearby until this finishes.');
  }
}
