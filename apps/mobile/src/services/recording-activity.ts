import type { RecordingActivityPort } from '../features/phone-recording/recording-activity';
// Android uses expo-audio's native recording notification and Stop action.
export const recordingActivity: RecordingActivityPort = {
  show: async () => {},
  end: async () => {},
};
