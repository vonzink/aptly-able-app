import { ApiError } from '@aptly/api-client';
import type { PreparedAudio } from '../features/transcription/transcription-controller';

export async function prepareRecordingUpload(
  uri: string,
  signal: AbortSignal,
): Promise<PreparedAudio> {
  const response = await fetch(uri, { signal });
  if (!response.ok)
    throw new ApiError(
      0,
      'LOCAL_AUDIO_UNAVAILABLE',
      'The saved audio could not be opened. Import the original file again.',
    );
  const body = await response.blob();
  if (body.size === 0)
    throw new ApiError(
      0,
      'LOCAL_AUDIO_UNAVAILABLE',
      'The saved audio is empty. Import the original file again.',
    );
  return { body };
}
