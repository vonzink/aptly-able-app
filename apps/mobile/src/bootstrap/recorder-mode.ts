import type { RecorderAdapter } from '../features/recorder/recorder-adapter';
import { createMockRecorderAdapter } from '../features/recorder/mock-recorder-adapter';

export type RecorderMode = 'mock';

export function resolveRecorderMode(configuredMode: string | undefined): RecorderMode {
  if (configuredMode === undefined || configuredMode === 'mock') return 'mock';
  throw new Error('Real recorder support is not available in this build.');
}

export function createRecorderAdapter(configuredMode: string | undefined): RecorderAdapter {
  resolveRecorderMode(configuredMode);
  return createMockRecorderAdapter();
}
