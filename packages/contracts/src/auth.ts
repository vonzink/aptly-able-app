import { z } from 'zod';
import { sessionResponseSchema } from './session.js';
const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
const passwordSchema = z.string().min(12).max(128);
export const registerAccountSchema = z.strictObject({
  displayName: z.string().trim().min(1).max(120),
  email: emailSchema,
  password: passwordSchema,
});
export const loginAccountSchema = z.strictObject({ email: emailSchema, password: passwordSchema });
export const authResponseSchema = z.strictObject({
  credential: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  expiresAt: z.iso.datetime(),
  session: sessionResponseSchema.extend({ mode: z.literal('pilot') }),
});
export const authConfigSchema = z.strictObject({
  pilotEnabled: z.boolean(),
  developmentEnabled: z.boolean(),
});
export type RegisterAccount = z.infer<typeof registerAccountSchema>;
export type LoginAccount = z.infer<typeof loginAccountSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type AuthConfig = z.infer<typeof authConfigSchema>;
