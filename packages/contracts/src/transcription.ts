import { z } from 'zod';
import { transcriptSegmentSchema } from './recording.js';

const audioName = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/\.(mp3|wav|m4a)$/i);
export const registerRecordingSchema = z.strictObject({
  id: z.uuid(),
  title: z.string().trim().min(1).max(200),
  fileName: audioName,
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(250 * 1024 * 1024),
});
export const generatedTranscriptSchema = z.strictObject({
  text: z.string().max(2 * 1024 * 1024),
  segments: z.array(transcriptSegmentSchema).max(100000),
  durationSeconds: z.number().nonnegative(),
  language: z.string().min(1).nullable(),
});
export const processingStatusSchema = z.enum([
  'awaiting_upload',
  'queued',
  'uploading',
  'submitting',
  'transcribing',
  'complete',
  'failed',
  'submission_uncertain',
]);
export const processingRecordingSchema = registerRecordingSchema
  .extend({
    status: processingStatusSchema,
    attempt: z.number().int().nonnegative(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    errorCode: z.string().max(100).nullable(),
    transcript: generatedTranscriptSchema.nullable(),
  })
  .refine((r) => (r.status === 'complete') === (r.transcript !== null), {
    message: 'Only completed jobs have a transcript.',
  });
export const transcriptionCapabilitiesSchema = z.strictObject({
  available: z.boolean(),
  provider: z.literal('plaud'),
  reason: z.enum(['ready', 'not_configured', 'storage_unavailable']),
});
export const retryTranscriptionSchema = z.strictObject({
  acknowledgeDuplicateRisk: z.boolean().default(false),
});
export type RegisterRecordingInput = z.infer<typeof registerRecordingSchema>;
export type GeneratedTranscript = z.infer<typeof generatedTranscriptSchema>;
export type ProcessingRecording = z.infer<typeof processingRecordingSchema>;
export type ProcessingStatus = z.infer<typeof processingStatusSchema>;
export type TranscriptionCapabilities = z.infer<typeof transcriptionCapabilitiesSchema>;
