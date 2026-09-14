import type { RecordingServerPort } from '../features/recordings/recording-server-port';

/** Deliberate integration stub: no HTTP, storage upload, or simulated transcript. */
const notConfigured = async (): Promise<never> => {
  throw new Error('Aptly Able server integration is not connected yet.');
};
export const recordingServer: RecordingServerPort = {
  configured: false,
  upload: notConfigured,
  getProcessing: notConfigured,
};
