import { z } from 'zod';
export const sessionResponseSchema = z.strictObject({
  user: z.strictObject({ id: z.uuid(), role: z.enum(['user', 'admin']) }),
  mode: z.enum(['development', 'pilot']),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
