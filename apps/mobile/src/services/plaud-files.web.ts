import type { PlaudFilePort } from '../features/plaud-device/plaud-file-port';
const unavailable = async (): Promise<never> => {
  throw new Error('Use the installed phone app to transfer recorder audio.');
};
export const plaudFiles: PlaudFilePort = {
  isAvailable: false,
  getRecordingState: unavailable,
  getFileList: unavailable,
  exportAudio: unavailable,
  readExport: unavailable,
  removeExport: unavailable,
  addListener: () => ({ remove() {} }),
};
