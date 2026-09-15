import { z } from 'zod';
import { recorderModelSchema, recorderSerialSchema } from './recorder-identity.js';

export const plaudDeviceCapabilitiesSchema = z.discriminatedUnion('available', [
  z.strictObject({ available: z.literal(true), reason: z.literal('ready') }),
  z.strictObject({
    available: z.literal(false),
    reason: z.enum(['not_configured', 'storage_unavailable']),
  }),
]);
export type PlaudDeviceCapabilities = z.infer<typeof plaudDeviceCapabilitiesSchema>;
export const plaudDeviceOperationRequestSchema = z.strictObject({ operationId: z.uuid() });
export const plaudDeviceSessionSchema = z.strictObject({
  userAccessToken: z
    .string()
    .min(1)
    .max(16384)
    .regex(/^[\x21-\x7e]+$/),
  expiresAt: z.iso.datetime(),
  customDomain: z.enum(['platform-us.plaud.ai', 'platform-jp.plaud.ai']),
  userId: z.uuid(),
  // Keep old assignments readable so the phone can explain a model mismatch
  // before initializing the SDK, rather than reporting an unreadable API response.
  recorder: z.strictObject({
    serial: recorderSerialSchema,
    model: recorderModelSchema,
  }),
});
export type PlaudDeviceSession = z.infer<typeof plaudDeviceSessionSchema>;
export const plaudDeviceBindSchema = z.strictObject({ status: z.literal('bound') });
export const plaudDeviceUnbindSchema = z.strictObject({ status: z.literal('unbound') });
export type PlaudDeviceBind = z.infer<typeof plaudDeviceBindSchema>;
export type PlaudDeviceUnbind = z.infer<typeof plaudDeviceUnbindSchema>;
export const plaudDeviceReleaseSchema = z.strictObject({ status: z.literal('released') });
export type PlaudDeviceRelease = z.infer<typeof plaudDeviceReleaseSchema>;
