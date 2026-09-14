import {
  claimEnrollmentRequestSchema,
  createAssignmentRequestSchema,
  endAssignmentRequestSchema,
  enrollmentTokenSchema,
  issueEnrollmentRequestSchema,
  type CreateAssignmentInput,
  type EnrollmentPreview,
  type RecorderAssignment,
  type SetupOperation,
} from '@aptly/contracts';
import type pg from 'pg';
import { z } from 'zod';
import type { ActorContext } from '../identity/development-identity.js';
import { EnrollmentError } from './errors.js';
import { createPostgresEnrollmentRepository } from './postgres-repository.js';

export { EnrollmentError } from './errors.js';

export interface EnrollmentService {
  createAssignment(actor: ActorContext, input: CreateAssignmentInput): Promise<RecorderAssignment>;
  issueToken(
    actor: ActorContext,
    assignmentId: string,
    expiresInSeconds: number,
  ): Promise<{ id: string; assignmentId: string; expiresAt: string; rawToken: string }>;
  revokeToken(actor: ActorContext, tokenId: string): Promise<void>;
  endAssignment(
    actor: ActorContext,
    assignmentId: string,
    status: 'released' | 'revoked',
  ): Promise<RecorderAssignment>;
  resolve(actor: ActorContext, rawToken: string): Promise<EnrollmentPreview>;
  claim(actor: ActorContext, rawToken: string, idempotencyKey: string): Promise<SetupOperation>;
  getClaimOperation(actor: ActorContext, idempotencyKey: string): Promise<SetupOperation>;
  getOperation(actor: ActorContext, operationId: string): Promise<SetupOperation>;
}

const uuidSchema = z.uuid();
const invalidInput = () =>
  new EnrollmentError('INVALID_INPUT', 400, 'The enrollment request is invalid.');
const validateActor = (actor: ActorContext) => {
  if (!uuidSchema.safeParse(actor.userId).success) throw invalidInput();
};
const requireAdmin = (actor: ActorContext) => {
  validateActor(actor);
  if (actor.role !== 'admin' && !actor.selfService) {
    throw new EnrollmentError('FORBIDDEN', 403, 'Administrator access is required.');
  }
};
const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) throw invalidInput();
  return result.data;
};

export function createEnrollmentService(pool: pg.Pool): EnrollmentService {
  const repository = createPostgresEnrollmentRepository(pool);
  return {
    async createAssignment(actor, input) {
      requireAdmin(actor);
      const parsed = parse(createAssignmentRequestSchema, input);
      if (actor.role !== 'admin' && parsed.userId !== actor.userId)
        throw new EnrollmentError('FORBIDDEN', 403, 'You can only assign a recorder to yourself.');
      return repository.createAssignment(actor, parsed);
    },
    async issueToken(actor, assignmentId, expiresInSeconds) {
      requireAdmin(actor);
      const id = parse(uuidSchema, assignmentId);
      const request = parse(issueEnrollmentRequestSchema, { expiresInSeconds });
      return repository.issueToken(actor, id, request.expiresInSeconds);
    },
    async revokeToken(actor, tokenId) {
      requireAdmin(actor);
      return repository.revokeToken(actor, parse(uuidSchema, tokenId));
    },
    async endAssignment(actor, assignmentId, status) {
      requireAdmin(actor);
      const request = parse(endAssignmentRequestSchema, { status });
      return repository.endAssignment(actor, parse(uuidSchema, assignmentId), request.status);
    },
    async resolve(actor, rawToken) {
      validateActor(actor);
      return repository.resolve(actor, parse(enrollmentTokenSchema, rawToken));
    },
    async claim(actor, rawToken, idempotencyKey) {
      validateActor(actor);
      const request = parse(claimEnrollmentRequestSchema, { token: rawToken, idempotencyKey });
      return repository.claim(actor, request.token, request.idempotencyKey);
    },
    async getClaimOperation(actor, key) {
      validateActor(actor);
      return repository.getClaimOperation(actor, parse(uuidSchema, key));
    },
    async getOperation(actor, operationId) {
      validateActor(actor);
      return repository.getOperation(actor, parse(uuidSchema, operationId));
    },
  };
}
