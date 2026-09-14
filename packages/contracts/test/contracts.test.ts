import { describe, expect, it } from 'vitest';
import {
  recordingSummarySchema,
  recorderSummarySchema,
  transcriptSegmentSchema,
} from '../src/index.js';
const recording = {
  id: 'c8c29340-793e-4ad3-bf3e-53bf7b63f1f4',
  title: 'Conversation',
  recordedAt: null,
  durationSeconds: null,
  status: 'awaiting_upload',
};
describe('recording contracts', () => {
  it('rejects blank titles without rejecting unknown recording metadata', () => {
    expect(recordingSummarySchema.safeParse({ ...recording, title: '  ' }).success).toBe(false);
    expect(recordingSummarySchema.parse(recording).durationSeconds).toBeNull();
  });
  it('rejects invalid identities and negative duration', () => {
    expect(recordingSummarySchema.safeParse({ ...recording, id: '../another-user' }).success).toBe(
      false,
    );
    expect(recordingSummarySchema.safeParse({ ...recording, durationSeconds: -1 }).success).toBe(
      false,
    );
  });
  it('rejects unknown public fields so secrets cannot leak through serialization', () => {
    expect(recordingSummarySchema.safeParse({ ...recording, apiKey: 'not-public' }).success).toBe(
      false,
    );
  });
  it('rejects impossible transcript timing without requiring a speaker', () => {
    expect(
      transcriptSegmentSchema.safeParse({ startSeconds: 9, endSeconds: 2, text: 'hello' }).success,
    ).toBe(false);
    expect(
      transcriptSegmentSchema.safeParse({ startSeconds: -1, endSeconds: 2, text: 'hello' }).success,
    ).toBe(false);
    expect(
      transcriptSegmentSchema.parse({ startSeconds: 0.5, endSeconds: 2.25, text: 'hello' })
        .speakerId,
    ).toBeUndefined();
  });
  it('rejects impossible storage and battery values', () => {
    const recorder = {
      id: recording.id,
      name: 'Example recorder',
      model: 'notepro',
      serialSuffix: '4812',
      batteryPercent: 80,
      storageFreeBytes: 1,
      storageTotalBytes: 10,
    };
    expect(recorderSummarySchema.safeParse(recorder).success).toBe(true);
    expect(recorderSummarySchema.safeParse({ ...recorder, storageFreeBytes: 11 }).success).toBe(
      false,
    );
    expect(recorderSummarySchema.safeParse({ ...recorder, batteryPercent: 101 }).success).toBe(
      false,
    );
    expect(recorderSummarySchema.safeParse({ ...recorder, storageFreeBytes: -1 }).success).toBe(
      false,
    );
  });
});
