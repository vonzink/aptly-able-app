import type { PlaudStatusPort } from '../features/plaud-device/plaud-status-port';

export const plaudStatus: PlaudStatusPort = {
  isAvailable: false,
  request: async () => {
    throw new Error('Recorder status requires a supported phone build.');
  },
  addListener: () => ({ remove() {} }),
};
