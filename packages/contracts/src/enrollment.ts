import { z } from 'zod';

export const enrollmentTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const recorderModelSchema = z.enum(['notepro', 'notepins']);
export const assignmentStatusSchema = z.enum(['active', 'released', 'revoked']);
export const assignmentSchema = z.strictObject({
  id: z.uuid(),
  userId: z.uuid(),
  recorderId: z.uuid(),
  assignedAt: z.iso.datetime(),
  status: assignmentStatusSchema,
});
export type RecorderAssignment = z.infer<typeof assignmentSchema>;
export const createAssignmentRequestSchema = z.strictObject({
  userId: z.uuid(),
  serial: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{2,60}[0-9]{4}$/),
  model: recorderModelSchema,
});
export type CreateAssignmentInput = z.infer<typeof createAssignmentRequestSchema>;
export const enrollmentPlatformSchema = z.enum(['android', 'ios']);
export type EnrollmentPlatform = z.infer<typeof enrollmentPlatformSchema>;
export const issueEnrollmentRequestSchema = z.strictObject({
  platform: enrollmentPlatformSchema.optional(),
  expiresInSeconds: z.number().int().min(60).max(604_800).default(86_400),
});
export const resolveEnrollmentRequestSchema = z.strictObject({ token: enrollmentTokenSchema });
export const claimEnrollmentRequestSchema = z.strictObject({
  token: enrollmentTokenSchema,
  idempotencyKey: z.uuid(),
});
export const endAssignmentRequestSchema = z.strictObject({
  status: z.enum(['released', 'revoked']),
});
export const enrollmentPreviewSchema = z.strictObject({
  assignmentId: z.uuid(),
  recorder: z.strictObject({
    id: z.uuid(),
    model: recorderModelSchema,
    serialSuffix: z.string().regex(/^[0-9]{4}$/),
  }),
  expiresAt: z.iso.datetime(),
});
export type EnrollmentPreview = z.infer<typeof enrollmentPreviewSchema>;
export const setupOperationSchema = z.strictObject({
  id: z.uuid(),
  assignmentId: z.uuid(),
  status: z.enum(['pending', 'revoked']),
  createdAt: z.iso.datetime(),
});
export type SetupOperation = z.infer<typeof setupOperationSchema>;
export const enrollmentInvitationSchema = z.strictObject({
  id: z.uuid(),
  assignmentId: z.uuid(),
  expiresAt: z.iso.datetime(),
  enrollmentUrl: z.url(),
  qrSvg: z.string().min(1),
});

export const adminUserSchema = z.strictObject({
  id: z.uuid(),
  displayName: z.string().min(1).max(120),
});
export type AdminUser = z.infer<typeof adminUserSchema>;
export const adminUsersResponseSchema = z.strictObject({
  users: z.array(adminUserSchema),
  hasMore: z.boolean(),
});
export const adminAssignmentSchema = assignmentSchema.extend({
  user: adminUserSchema,
  recorder: z.strictObject({
    id: z.uuid(),
    model: recorderModelSchema,
    serialSuffix: z.string().regex(/^[0-9]{4}$/),
  }),
  latestInvitation: z
    .strictObject({
      id: z.uuid(),
      expiresAt: z.iso.datetime(),
      createdAt: z.iso.datetime(),
      usedAt: z.iso.datetime().nullable(),
      revokedAt: z.iso.datetime().nullable(),
    })
    .nullable(),
  latestOperation: setupOperationSchema.nullable(),
});
export type AdminAssignment = z.infer<typeof adminAssignmentSchema>;
export const adminAssignmentsResponseSchema = z.strictObject({
  assignments: z.array(adminAssignmentSchema),
  hasMore: z.boolean(),
});
export type EnrollmentInvitation = z.infer<typeof enrollmentInvitationSchema>;
