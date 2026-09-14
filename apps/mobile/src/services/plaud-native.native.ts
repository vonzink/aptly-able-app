import { Platform } from 'react-native';

import { isAvailable, PlaudSdk, type PlaudSdkEvents } from '../../modules/plaud-sdk';

import type { PlaudNativePort } from '../features/plaud-device/plaud-native-port';

export const plaudNative: PlaudNativePort = {
  isAvailable,
  initSDK: (options) => PlaudSdk.initSDK(options),
  startScan: () => PlaudSdk.startScan(),
  stopScan: () => PlaudSdk.stopScan(),
  connectBleDevice: (options) => PlaudSdk.connectBleDevice(options),
  disconnect: () => PlaudSdk.disconnect(),
  unpair: () => PlaudSdk.depair({ clear: Platform.OS !== 'android' }),
  addListener: (name, listener) =>
    PlaudSdk.addListener(name, listener as PlaudSdkEvents[typeof name]),
};
