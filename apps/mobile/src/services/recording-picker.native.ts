import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import type { AudioImport } from '../features/recordings/recording-model';
import type { TranscriptImport } from './recording-picker-types';
import { PickerCleanupError, pickerCleanupWarning } from './recording-picker-errors';

// Only copies returned by our picker may be removed. Failed releases remain owned
// for a later retry; active imports are never swept by another picker operation.
const ownedCopies = new Set<string>();
const pendingCleanup = new Set<string>();
function claimCopy(uri: string) {
  const url = new URL(uri);
  const cache = FileSystem.cacheDirectory;
  if (!cache || url.protocol !== 'file:' || url.host || url.search || url.hash)
    throw new Error('The selected file was not copied into the app cache.');
  const directory = decodeURIComponent(new URL('DocumentPicker/', cache).pathname);
  const path = decodeURIComponent(url.pathname);
  const name = path.slice(directory.length);
  if (!path.startsWith(directory) || !name || name === '.' || name === '..' || /[/\\\0]/.test(name))
    throw new Error('The selected file was outside the picker cache.');
  ownedCopies.add(uri);
}
export async function releasePickedAudio(uri: string): Promise<void> {
  if (!ownedCopies.has(uri)) return;
  pendingCleanup.add(uri);
  const info = await FileSystem.getInfoAsync(uri);
  if (info.exists) {
    if (info.isDirectory) throw new Error('The picker copy is not a file.');
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }
  pendingCleanup.delete(uri);
  ownedCopies.delete(uri);
}
async function retryCleanup() {
  for (const uri of [...pendingCleanup]) await releasePickedAudio(uri).catch(() => undefined);
}
async function rejectCopy(uri: string, error: unknown): Promise<never> {
  try {
    await releasePickedAudio(uri);
  } catch {
    throw new PickerCleanupError(error);
  }
  throw error;
}
async function selectCopy(type: string | string[]) {
  await retryCleanup();
  const result = await DocumentPicker.getDocumentAsync({
    type,
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  claimCopy(asset.uri);
  return asset;
}
export async function pickAudio(): Promise<AudioImport | null> {
  const asset = await selectCopy(['audio/*']);
  if (!asset) return null;
  try {
    const info = await FileSystem.getInfoAsync(asset.uri);
    if (!info.exists || info.isDirectory)
      throw new Error('The selected audio file could not be opened.');
    return {
      name: asset.name,
      uri: asset.uri,
      sizeBytes: info.size,
      mimeType: asset.mimeType ?? '',
    };
  } catch (error) {
    return rejectCopy(asset.uri, error);
  }
}
export async function pickTranscript(): Promise<TranscriptImport | null> {
  const asset = await selectCopy('*/*');
  if (!asset) return null;
  let text: string;
  try {
    const info = await FileSystem.getInfoAsync(asset.uri);
    if (!info.exists || info.isDirectory)
      throw new Error('The selected transcript could not be opened.');
    if (info.size > 2 * 1024 * 1024) throw new Error('Choose a transcript smaller than 2 MB.');
    text = await FileSystem.readAsStringAsync(asset.uri);
  } catch (error) {
    return rejectCopy(asset.uri, error);
  }
  try {
    await releasePickedAudio(asset.uri);
    return { name: asset.name, text };
  } catch {
    return {
      name: asset.name,
      text,
      cleanupWarning: pickerCleanupWarning,
    };
  }
}
