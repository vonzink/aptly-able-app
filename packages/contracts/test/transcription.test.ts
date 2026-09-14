import { expect, test } from 'vitest';
import { registerRecordingSchema, processingRecordingSchema } from '../src/transcription.js';

test('registration rejects unsupported files and invalid byte counts', () => {
  const input = {
    id: '12823338-1535-4a49-b7f7-55d6a35bcb11',
    title: 'Call',
    fileName: 'call.mp3',
    sizeBytes: 123,
  };
  expect(registerRecordingSchema.parse(input)).toEqual(input);
  for (const patch of [
    { fileName: 'call.txt' },
    { sizeBytes: 0 },
    { sizeBytes: 262144001 },
    { title: ' ' },
  ])
    expect(registerRecordingSchema.safeParse({ ...input, ...patch }).success).toBe(false);
});
test('complete responses require a valid generated transcript', () => {
  const input = {
    id: '12823338-1535-4a49-b7f7-55d6a35bcb11',
    title: 'Call',
    fileName: 'call.mp3',
    sizeBytes: 123,
    status: 'complete',
    attempt: 1,
    createdAt: '2026-09-11T00:00:00.000Z',
    updatedAt: '2026-09-11T00:00:00.000Z',
    errorCode: null,
    transcript: null,
  };
  expect(processingRecordingSchema.safeParse(input).success).toBe(false);
  expect(
    processingRecordingSchema.safeParse({
      ...input,
      transcript: {
        text: 'Hello',
        segments: [{ startSeconds: 1, endSeconds: 2, text: 'Hello' }],
        durationSeconds: 3,
        language: 'en',
      },
    }).success,
  ).toBe(true);
});
