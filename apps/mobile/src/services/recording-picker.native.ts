import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import type { AudioImport } from '../features/recordings/recording-model';

export async function pickAudio(): Promise<AudioImport | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['audio/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  const info = await FileSystem.getInfoAsync(asset.uri);
  if (!info.exists || info.isDirectory)
    throw new Error('The selected audio file could not be opened.');
  return { name: asset.name, uri: asset.uri, sizeBytes: info.size, mimeType: asset.mimeType ?? '' };
}
export function releasePickedAudio(_uri: string) {
  /* Picker cache is managed by the operating system. */
}
export async function pickTranscript() {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  const info = await FileSystem.getInfoAsync(asset.uri);
  if (!info.exists || info.isDirectory)
    throw new Error('The selected transcript could not be opened.');
  if (info.size > 2 * 1024 * 1024) throw new Error('Choose a transcript smaller than 2 MB.');
  return { name: asset.name, text: await FileSystem.readAsStringAsync(asset.uri) };
}
