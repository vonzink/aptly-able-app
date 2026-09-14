import type { GeneratedTranscript } from '@aptly/contracts';
import type { PlaudRecordingSource } from './recording-model';

/** Replace the stub adapter when Aptly Able's server API is available. */
export interface RecordingServerPort {
  readonly configured: boolean;
  upload(input: {
    recordingId: string;
    title: string;
    fileName: string;
    sizeBytes: number;
    mimeType: string;
    source: PlaudRecordingSource;
    localAudioUri: string;
    signal: AbortSignal;
  }): Promise<{ serverRecordingId: string }>;
  getProcessing(
    serverRecordingId: string,
    signal: AbortSignal,
  ): Promise<
    | { status: 'pending' | 'transcribing'; transcript: null }
    | { status: 'complete'; transcript: GeneratedTranscript }
    | { status: 'failed'; transcript: null; message: string }
  >;
}
