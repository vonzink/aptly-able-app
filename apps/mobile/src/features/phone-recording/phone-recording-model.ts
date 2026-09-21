import { isRecordingId, type AudioImport } from '../recordings/recording-model';

export const MAX_PHONE_RECORDING_SECONDS = 2 * 60 * 60;
export interface PhoneRecordingDraft {
  id: string;
  actorId: string;
  createdAt: string;
  uri: string;
}
export interface PhoneRecordingAudio extends PhoneRecordingDraft {
  input: AudioImport;
  durationSeconds: number;
}
export interface PhoneRecorderStatus {
  recording: boolean;
  canRecord: boolean;
  durationSeconds: number;
  finished: boolean;
  error: boolean;
}
export interface PhoneRecorderPort {
  available: boolean;
  requestPermission(): Promise<boolean>;
  prepare(draft: Omit<PhoneRecordingDraft, 'uri'>): Promise<PhoneRecordingDraft>;
  record(seconds: number): void;
  pause(): void;
  stop(): Promise<void>;
  status(): PhoneRecorderStatus;
  audio(draft: PhoneRecordingDraft): Promise<PhoneRecordingAudio>;
  recover(actorId: string): Promise<PhoneRecordingDraft | null>;
  discard(draft: PhoneRecordingDraft): Promise<void>;
  clearActor(actorId: string): Promise<void>;
}
export function assertPhoneDraft(value: unknown): asserts value is PhoneRecordingDraft {
  const draft = value as PhoneRecordingDraft | null;
  if (
    !draft ||
    typeof draft.id !== 'string' ||
    !isRecordingId(draft.id) ||
    typeof draft.actorId !== 'string' ||
    !isRecordingId(draft.actorId) ||
    typeof draft.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(draft.createdAt)) ||
    typeof draft.uri !== 'string' ||
    !draft.uri
  )
    throw new Error('The unfinished phone recording could not be read.');
}
