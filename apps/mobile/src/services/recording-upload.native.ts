import { ApiError } from '@aptly/api-client';
import { fetch as expoFetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import type { PreparedAudio } from '../features/transcription/transcription-controller';

export async function prepareRecordingUpload(
  uri: string,
  signal: AbortSignal,
): Promise<PreparedAudio> {
  if (signal.aborted) throw new ApiError(0, 'CANCELLED', 'The request was cancelled.');
  const file = new File(uri);
  if (!file.exists || file.size === 0)
    throw new ApiError(
      0,
      'LOCAL_AUDIO_UNAVAILABLE',
      'The saved audio could not be opened. Import the original file again.',
    );
  // Expo normalizes File/Blob bodies by replacing Content-Type with body.type.
  // An ArrayBuffer preserves the API's application/octet-stream header. Expo's
  // File path already reads the entire file into an ArrayBuffer before upload.
  const body = await file.arrayBuffer();
  if (signal.aborted) throw new ApiError(0, 'CANCELLED', 'The request was cancelled.');
  return { body, fetch: expoFetch };
}
