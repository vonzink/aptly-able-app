import { useRef, useState } from 'react';
import { pickAudio, releasePickedAudio } from '../../services/recording-picker';
import { pickerFailureMessage, pickerCleanupWarning } from '../../services/recording-picker-errors';
import { useRecordingsController } from './RecordingsProvider';

export function useImportRecording(onImported: (id: string) => void) {
  const controller = useRecordingsController();
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const importing = useRef(false);
  async function importRecording() {
    if (importing.current || controller.getSnapshot().busy) return;
    importing.current = true;
    setPicking(true);
    setError(null);
    controller.clearError();
    let uri: string | null = null;
    let importedId: string | null = null;
    let cleanupFailed = false;
    try {
      const input = await pickAudio();
      if (!input) return;
      uri = input.uri;
      importedId = await controller.importAudio(input);
    } catch (error) {
      setError(
        pickerFailureMessage(
          error,
          'The file could not be imported. Choose an MP3, WAV or M4A recording and try again.',
        ),
      );
    } finally {
      if (uri) {
        try {
          await releasePickedAudio(uri);
        } catch {
          cleanupFailed = true;
          setError(`Any saved recording is available in your library. ${pickerCleanupWarning}`);
        }
      }
      importing.current = false;
      setPicking(false);
    }
    // Keep cleanup feedback visible in the library instead of navigating away.
    if (importedId && !cleanupFailed) onImported(importedId);
  }
  return { picking, error, clearError: () => setError(null), importRecording };
}
