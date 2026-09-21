import type { PhoneRecorderPort } from '../features/phone-recording/phone-recording-model';
const unsupported = async (): Promise<never> => {
  throw new Error('Phone recording requires the updated iPhone or Android app.');
};
export const phoneRecorder: PhoneRecorderPort = {
  available: false,
  requestPermission: async () => false,
  prepare: unsupported,
  record() {},
  pause() {},
  stop: async () => {},
  status: () => ({
    recording: false,
    canRecord: false,
    durationSeconds: 0,
    finished: false,
    error: false,
  }),
  audio: unsupported,
  recover: async () => null,
  discard: async () => {},
  clearActor: async () => {},
};
