import { PlaudSdk, isAvailable } from '../../modules/plaud-sdk';
import {
  unavailableLocationStatus,
  type RecordingLocationPort,
} from '../features/recording-location/location-port';
const available = isAvailable && typeof PlaudSdk.getRecordingLocationStatus === 'function';
export const recordingLocation: RecordingLocationPort = {
  available,
  getStatus: () =>
    available ? PlaudSdk.getRecordingLocationStatus!() : Promise.resolve(unavailableLocationStatus),
  setContext: (context) =>
    available ? PlaudSdk.setRecordingLocationContext!(context) : Promise.resolve(),
  setEnabled: (enabled) =>
    available
      ? PlaudSdk.setRecordingLocationEnabled!({ enabled })
      : Promise.resolve(unavailableLocationStatus),
  requestBackground: () =>
    available
      ? PlaudSdk.requestRecordingLocationBackgroundPermission!()
      : Promise.resolve(unavailableLocationStatus),
  read: (source) => (available ? PlaudSdk.getRecordingLocation!(source) : Promise.resolve(null)),
  remove: (source) => (available ? PlaudSdk.removeRecordingLocation!(source) : Promise.resolve()),
  clearActor: (actorId) =>
    available ? PlaudSdk.clearRecordingLocations!({ actorId }) : Promise.resolve(),
  subscribe: (listener) => {
    if (!available) return () => {};
    const subscription = PlaudSdk.addListener('recordingLocationChanged', listener);
    return () => subscription.remove();
  },
};
