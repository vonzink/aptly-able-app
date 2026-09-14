import { useRef, useState } from 'react';
import { pickAudio, releasePickedAudio } from '../../services/recording-picker';
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
    try {
      const input = await pickAudio();
      if (!input) return;
      uri = input.uri;
      const id = await controller.importAudio(input);
      if (id) onImported(id);
    } catch {
      setError(
        'The file could not be imported. Choose an MP3, WAV or M4A recording and try again.',
      );
    } finally {
      if (uri) releasePickedAudio(uri);
      importing.current = false;
      setPicking(false);
    }
  }
  return { picking, error, clearError: () => setError(null), importRecording };
}
