import { isAvailable, PlaudSdk, type PlaudSdkEvents } from '../../modules/plaud-sdk';

import type { PlaudStatusPort } from '../features/plaud-device/plaud-status-port';

export const plaudStatus: PlaudStatusPort = {
  // Older installed native builds can still pair while this new capability is absent.
  isAvailable: isAvailable && typeof PlaudSdk.getDeviceStatus === 'function',
  request: () => PlaudSdk.getDeviceStatus!(),
  addListener: (name, listener) =>
    PlaudSdk.addListener(name, listener as PlaudSdkEvents[typeof name]),
};
