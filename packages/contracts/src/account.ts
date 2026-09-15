import { z } from 'zod';
// Owner-approved service commitment, September 15, 2026. Snapshot it per request.
export const ACCOUNT_DELETION_MAX_DAYS = 7;
export const requestAccountDeletionSchema = z
  .object({
    password: z.string().min(1).max(1024),
    confirmation: z.literal('DELETE'),
  })
  .strict();
export const accountDeletionReceiptSchema = z
  .object({
    requestId: z.uuid(),
    status: z.enum(['pending', 'complete']),
    requestedAt: z.iso.datetime(),
    expectedCompletionAt: z.iso.datetime().nullable().optional(),
    completedAt: z.iso.datetime().nullable().optional(),
    pendingWork: z.array(z.enum(['service_data', 'provider_erasure', 'backup_retention'])),
  })
  .refine(
    (value) => value.status !== 'complete' || value.pendingWork.length === 0,
    'Completed deletion cannot have pending work.',
  );
export type RequestAccountDeletion = z.infer<typeof requestAccountDeletionSchema>;
export type AccountDeletionReceipt = z.infer<typeof accountDeletionReceiptSchema>;
