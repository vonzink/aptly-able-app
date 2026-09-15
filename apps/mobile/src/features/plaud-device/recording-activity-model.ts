import type { PlaudSyncSnapshot } from './plaud-sync-model';

type Activity = PlaudSyncSnapshot['activity'];
export type RecordingActivityMemory = {
  actorId: string | null;
  observedRecorder: boolean;
  lastActive: Extract<Activity, 'recording' | 'paused'> | null;
};
export const initialRecordingActivityMemory: RecordingActivityMemory = {
  actorId: null,
  observedRecorder: false,
  lastActive: null,
};

export type RecordingActivityBannerModel = {
  kind: 'active' | 'uncertain';
  label: string;
  detail: string;
};

export function updateRecordingActivity(
  previous: RecordingActivityMemory,
  input: { actorId: string | null; connected: boolean; activity: Activity },
): { memory: RecordingActivityMemory; banner: RecordingActivityBannerModel | null } {
  if (!input.actorId) return { memory: initialRecordingActivityMemory, banner: null };
  const sameActor = previous.actorId === input.actorId;
  const lastActive =
    input.activity === 'recording' || input.activity === 'paused'
      ? input.activity
      : sameActor
        ? previous.lastActive
        : null;
  const memory = {
    actorId: input.actorId,
    observedRecorder: input.connected || (sameActor && previous.observedRecorder),
    lastActive,
  };
  if (input.connected && input.activity === 'recording')
    return {
      memory,
      banner: {
        kind: 'active',
        label: 'Recording',
        detail: 'Your Plaud recorder confirms it is recording.',
      },
    };
  if (input.connected && input.activity === 'paused')
    return {
      memory,
      banner: {
        kind: 'active',
        label: 'Paused',
        detail: 'Your Plaud recorder confirms the recording is paused.',
      },
    };
  if (input.connected && input.activity === 'idle')
    return {
      memory: { actorId: input.actorId, observedRecorder: true, lastActive: null },
      banner: null,
    };
  if (!memory.observedRecorder) return { memory, banner: null };
  const last = lastActive === 'paused' ? 'Paused' : lastActive === 'recording' ? 'Recording' : null;
  return {
    memory,
    banner: {
      kind: 'uncertain',
      label: 'Recording status unknown',
      detail: last
        ? `Bluetooth is disconnected or still checking. Last known state: ${last}. Check the recorder before assuming it stopped.`
        : 'Aptly Able cannot confirm whether the Plaud recorder is recording. Check the recorder directly.',
    },
  };
}
