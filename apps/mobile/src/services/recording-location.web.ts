import {
  unavailableLocationStatus,
  type RecordingLocationPort,
} from '../features/recording-location/location-port';
export const recordingLocation: RecordingLocationPort = {
  available: false,
  getStatus: async () => unavailableLocationStatus,
  setContext: async () => {},
  setEnabled: async () => unavailableLocationStatus,
  requestBackground: async () => unavailableLocationStatus,
  read: async () => null,
  remove: async () => {},
  clearActor: async () => {},
  subscribe: () => () => {},
};
