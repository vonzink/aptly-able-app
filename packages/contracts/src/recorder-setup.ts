import { z } from 'zod';
import { recorderIdentitySchema, recorderModelSchema } from './recorder-identity.js';
import { setupOperationSchema } from './enrollment.js';

export const accountRecorderSchema = z.strictObject({
  assignmentId: z.uuid(),
  recorder: z.strictObject({
    id: z.uuid(),
    model: recorderModelSchema,
    serialSuffix: z.string().regex(/^[0-9]{4}$/),
  }),
  operation: setupOperationSchema.nullable(),
  setupBlocked: z.boolean(),
});
export type AccountRecorder = z.infer<typeof accountRecorderSchema>;
export const accountRecordersSchema = z.strictObject({
  recorders: z.array(accountRecorderSchema),
  canAdd: z.boolean(),
});
export type AccountRecorders = z.infer<typeof accountRecordersSchema>;

export type RecorderSetupInput = z.infer<typeof recorderIdentitySchema>;
