import { describe, expect, it } from 'vitest';

import type { LocalRecording } from '../src/features/recordings/recording-model';
import { createWebRecordingStore } from '../src/services/recordings/recording-store.web';

const record: LocalRecording = {
  id: 'd3a673f4-5f4c-4e54-9a30-08cb1b06e950',
  title: 'Meeting',
  originalName: 'meeting.wav',
  importedAt: '2026-09-10T12:00:00.000Z',
  sizeBytes: 3,
  mimeType: 'audio/wav',
  durationSeconds: null,
  transcript: null,
};

describe('browser recording storage boundaries', () => {
  it('reports unavailable browser storage instead of silently using memory', async () => {
    const store = createWebRecordingStore();
    await expect(store.list()).rejects.toThrow(/unavailable/);
  });

  it('rejects temporary URLs without file bytes and mismatched blob sizes', async () => {
    const store = createWebRecordingStore();
    const input = {
      name: 'meeting.wav',
      uri: 'blob:temporary-picker-url',
      sizeBytes: 3,
      mimeType: 'audio/wav',
    };
    await expect(store.saveAudio(record, input)).rejects.toThrow(/Select it again/);
    await expect(
      store.saveAudio(record, { ...input, blob: new Blob(['incomplete']) }),
    ).rejects.toThrow(/Select it again/);
  });
});
