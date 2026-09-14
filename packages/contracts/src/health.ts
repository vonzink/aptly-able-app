import { z } from 'zod';
export const healthResponseSchema = z.strictObject({ status: z.enum(['ok', 'unavailable']) });
export type HealthResponse = z.infer<typeof healthResponseSchema>;
