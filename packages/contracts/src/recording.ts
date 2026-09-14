import { z } from 'zod';
export const recordingSummarySchema = z.strictObject({
  id: z.uuid(),
  title: z.string().trim().min(1).max(200),
  recordedAt: z.iso.datetime().nullable(),
  durationSeconds: z.number().nonnegative().nullable(),
  status: z.enum(['awaiting_upload', 'uploaded', 'transcribing', 'complete', 'failed']),
});
export const transcriptSegmentSchema = z
  .strictObject({
    startSeconds: z.number().nonnegative(),
    endSeconds: z.number().nonnegative(),
    text: z.string(),
    speakerId: z.string().min(1).optional(),
    language: z.string().min(1).optional(),
  })
  .refine((segment) => segment.endSeconds >= segment.startSeconds, {
    message: 'Segment end must not precede its start.',
  });
export const recorderSummarySchema = z
  .strictObject({
    id: z.uuid(),
    name: z.string().trim().min(1).max(200),
    model: z.enum(['notepro', 'notepins']),
    serialSuffix: z.string().regex(/^\d{4}$/),
    batteryPercent: z.number().min(0).max(100),
    storageFreeBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    storageTotalBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .refine((recorder) => recorder.storageFreeBytes <= recorder.storageTotalBytes, {
    message: 'Free storage cannot exceed total storage.',
  });
export type RecordingSummary = z.infer<typeof recordingSummarySchema>;
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;
export type RecorderSummary = z.infer<typeof recorderSummarySchema>;
