import { Directory, File, Paths } from 'expo-file-system';
import { isAvailable, PlaudSdk, type PlaudSdkEvents } from '../../modules/plaud-sdk';
import type { PlaudFilePort, PlaudRecorderCommand } from '../features/plaud-device/plaud-file-port';
import { createPlaudStateReader } from '../features/plaud-device/plaud-state-reader';

const getRecordingState = createPlaudStateReader({
  request: async () => {
    if (!PlaudSdk.getState) throw new Error('Update the phone app to check recorder state.');
    await PlaudSdk.getState();
  },
  subscribe: (answer, disconnected) => {
    const state = PlaudSdk.addListener('penState', (event) => answer(event.recordingState));
    const connection = PlaudSdk.addListener('connectState', (event) => {
      if (!event.connected) disconnected();
    });
    return () => {
      state.remove();
      connection.remove();
    };
  },
});

function exportedFile(outputPath: string): File {
  const file = new File(outputPath.startsWith('/') ? `file://${outputPath}` : outputPath);
  const directory = new Directory(Paths.document, 'PlaudExports');
  if (file.parentDirectory.uri !== directory.uri || file.extension.toLowerCase() !== '.mp3') {
    throw new Error('The recorder export was outside its expected audio folder.');
  }
  return file;
}
export const plaudFiles: PlaudFilePort = {
  isAvailable,
  ...(isAvailable && typeof PlaudSdk.controlRecorder === 'function'
    ? {
        controlRecorder: (command: PlaudRecorderCommand, sessionId: number | null) =>
          PlaudSdk.controlRecorder!({ command, ...(sessionId === null ? {} : { sessionId }) }),
      }
    : {}),
  ...(isAvailable &&
  PlaudSdk.wifiTransferEnabled !== false &&
  typeof PlaudSdk.startWifiTransfer === 'function' &&
  typeof PlaudSdk.stopWifiTransfer === 'function' &&
  typeof PlaudSdk.exportAudioViaWifi === 'function'
    ? {
        wifi: {
          start: () => PlaudSdk.startWifiTransfer!(),
          stop: () => PlaudSdk.stopWifiTransfer!(),
          exportAudio: (sessionId: number) => PlaudSdk.exportAudioViaWifi!({ sessionId }),
        },
      }
    : {}),
  getRecordingState,
  getFileList: () => PlaudSdk.getFileList({ startSessionId: 0 }),
  exportAudio: (sessionId) => PlaudSdk.exportAudio({ sessionId, format: 'mp3', channels: 1 }),
  addListener: (name, listener) =>
    PlaudSdk.addListener(name, listener as PlaudSdkEvents[typeof name]),
  async readExport(outputPath) {
    const file = exportedFile(outputPath);
    if (!file.exists || file.size <= 0) throw new Error('The recorder export is empty or missing.');
    return { uri: file.uri, name: file.name, sizeBytes: file.size, mimeType: 'audio/mpeg' };
  },
  async removeExport(outputPath) {
    const file = exportedFile(outputPath);
    if (file.exists) file.delete();
  },
};
