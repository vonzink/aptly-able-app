import type { PlaudNativePort } from '../features/plaud-device/plaud-native-port';

const unavailable = async (): Promise<never> => {
  throw new Error('Install a native phone build to connect a Plaud recorder.');
};

export const plaudNative: PlaudNativePort = {
  isAvailable: false,
  initSDK: unavailable,
  startScan: unavailable,
  stopScan: unavailable,
  connectBleDevice: unavailable,
  disconnect: unavailable,
  unpair: unavailable,
  addListener: () => ({ remove() {} }),
};
