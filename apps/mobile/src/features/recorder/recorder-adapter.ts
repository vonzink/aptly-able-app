import type { RecorderSummary } from '@aptly/contracts';

export type RecorderAdapterEvent = { type: 'disconnected' };

export interface RecorderAdapter {
  readonly mode: 'mock';
  scan(): Promise<RecorderSummary[]>;
  cancelScan(): void;
  connect(recorder: RecorderSummary): Promise<RecorderSummary>;
  disconnect(): Promise<void>;
  subscribe(listener: (event: RecorderAdapterEvent) => void): () => void;
}
