import Constants from 'expo-constants';

import PlaudDeviceScreen from '../plaud-device/PlaudDeviceScreen';
import RecorderSimulationScreen from './RecorderSimulationScreen';

export default function RecorderScreen() {
  return Constants.expoConfig?.extra?.recorderMode === 'mock' ? (
    <RecorderSimulationScreen />
  ) : (
    <PlaudDeviceScreen />
  );
}
