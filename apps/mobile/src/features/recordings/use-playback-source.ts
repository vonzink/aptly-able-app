import { useEffect, useState } from 'react';
import { recordingStore } from '../../services/recordings/recording-store';
export function usePlaybackSource(id: string, active: boolean, storageVersion = '') {
  const [state, setState] = useState<{ uri: string | null; error: string | null }>({
    uri: null,
    error: null,
  });
  useEffect(() => {
    let alive = true;
    let release: (() => void) | undefined;
    setState({ uri: null, error: null });
    if (active)
      void recordingStore.openAudio(id).then(
        (source) => {
          if (!alive) {
            source.release();
            return;
          }
          release = source.release;
          setState({ uri: source.uri, error: null });
        },
        (error: unknown) => {
          if (alive)
            setState({
              uri: null,
              error:
                error instanceof Error
                  ? error.message
                  : 'The audio could not be opened. Try loading it again.',
            });
        },
      );
    return () => {
      alive = false;
      release?.();
    };
  }, [id, active, storageVersion]);
  return state;
}
