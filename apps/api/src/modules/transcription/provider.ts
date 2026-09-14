import type { GeneratedTranscript } from '@aptly/contracts';

export interface TranscriptionProvider {
  uploadAudio(input: {
    userId: string;
    path: string;
    fileType: 'mp3' | 'wav' | 'm4a';
    sizeBytes: number;
  }): Promise<{ downloadUrl: string }>;
  submit(downloadUrl: string): Promise<string>;
  poll(
    taskId: string,
  ): Promise<
    | { status: 'pending' }
    | { status: 'failed' }
    | { status: 'complete'; transcript: GeneratedTranscript }
  >;
}

/** Safe to persist or present; never carries upstream content or a raw cause. */
export class ProviderError extends Error {
  constructor(
    readonly code: string,
    readonly ambiguous = false,
  ) {
    super('Transcription provider request failed.');
    this.name = 'ProviderError';
  }
}
