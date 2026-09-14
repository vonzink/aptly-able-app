import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import QRCode from 'qrcode';
import {
  assignmentSchema,
  claimEnrollmentRequestSchema,
  createAssignmentRequestSchema,
  endAssignmentRequestSchema,
  enrollmentInvitationSchema,
  enrollmentPreviewSchema,
  issueEnrollmentRequestSchema,
  resolveEnrollmentRequestSchema,
  setupOperationSchema,
} from '@aptly/contracts';
import type { SessionVerifier } from '../../modules/identity/development-identity.js';
import type { EnrollmentService } from '../../modules/enrollments/service.js';
import { HttpError } from './errors.js';

const idParams = z.strictObject({ id: z.uuid() });
const emptyObject = z.strictObject({});
function input<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new HttpError(400, 'INVALID_REQUEST', 'The request could not be accepted.');
  }
  return parsed.data;
}

type Dependencies = {
  identity: SessionVerifier;
  enrollments: EnrollmentService | undefined;
  enrollmentBaseUrl: string | undefined;
};
export function registerEnrollmentRoutes(app: FastifyInstance, dependencies: Dependencies) {
  const { identity, enrollments, enrollmentBaseUrl } = dependencies;
  const authenticate = async (request: FastifyRequest, admin = false, selfService = false) => {
    const actor = await identity.verify(request.headers.authorization);
    if (!actor) throw new HttpError(401, 'UNAUTHORIZED', 'A valid session is required.');
    if (admin && actor.role !== 'admin' && !(selfService && actor.selfService)) {
      throw new HttpError(403, 'FORBIDDEN', 'Administrator access is required.');
    }
    // Tokens and identity claims belong in the authenticated body, never in a URL.
    input(emptyObject, request.query);
    return actor;
  };
  const service = () => {
    if (!enrollments) {
      throw new HttpError(503, 'ENROLLMENT_UNAVAILABLE', 'Enrollment is temporarily unavailable.');
    }
    return enrollments;
  };
  for (const prefix of ['/v1/admin', '/v1/workspace']) {
    app.post(`${prefix}/recorder-assignments`, async (request, reply) => {
      const actor = await authenticate(request, true, prefix === '/v1/workspace');
      const body = input(createAssignmentRequestSchema, request.body);
      const result = await service().createAssignment(actor, body);
      return reply.code(201).send(assignmentSchema.parse(result));
    });
    app.post(`${prefix}/recorder-assignments/:id/enrollment-tokens`, async (request, reply) => {
      const actor = await authenticate(request, true, prefix === '/v1/workspace');
      const { id } = input(idParams, request.params);
      const { expiresInSeconds, platform } = input(
        issueEnrollmentRequestSchema,
        request.body ?? {},
      );
      if (!enrollmentBaseUrl) {
        throw new HttpError(
          503,
          'ENROLLMENT_NOT_CONFIGURED',
          'Enrollment links are not configured.',
        );
      }
      const issued = await service().issueToken(actor, id, expiresInSeconds);
      const url = new URL(enrollmentBaseUrl);
      if (platform && url.protocol !== 'aptlyable:') url.searchParams.set('platform', platform);
      url.hash = new URLSearchParams({ token: issued.rawToken }).toString();
      const enrollmentUrl = url.toString();
      const qrSvg = await QRCode.toString(enrollmentUrl, {
        type: 'svg',
        margin: 4,
        errorCorrectionLevel: 'M',
      });
      return reply.code(201).send(
        enrollmentInvitationSchema.parse({
          id: issued.id,
          assignmentId: issued.assignmentId,
          expiresAt: issued.expiresAt,
          enrollmentUrl,
          qrSvg,
        }),
      );
    });
    app.post(`${prefix}/enrollment-tokens/:id/revoke`, async (request, reply) => {
      const actor = await authenticate(request, true, prefix === '/v1/workspace');
      const { id } = input(idParams, request.params);
      input(emptyObject, request.body ?? {});
      await service().revokeToken(actor, id);
      return reply.code(204).send();
    });
    app.post(`${prefix}/recorder-assignments/:id/end`, async (request) => {
      const actor = await authenticate(request, true, prefix === '/v1/workspace');
      const { id } = input(idParams, request.params);
      const { status } = input(endAssignmentRequestSchema, request.body);
      return assignmentSchema.parse(await service().endAssignment(actor, id, status));
    });
  }
  app.post('/v1/enrollments/resolve', async (request) => {
    const actor = await authenticate(request);
    const { token } = input(resolveEnrollmentRequestSchema, request.body);
    return enrollmentPreviewSchema.parse(await service().resolve(actor, token));
  });
  app.post('/v1/enrollments/claim', async (request) => {
    const actor = await authenticate(request);
    const { token, idempotencyKey } = input(claimEnrollmentRequestSchema, request.body);
    return setupOperationSchema.parse(await service().claim(actor, token, idempotencyKey));
  });
  app.get('/v1/enrollments/claims/:id', async (request) => {
    const actor = await authenticate(request);
    const { id } = input(idParams, request.params);
    return setupOperationSchema.parse(await service().getClaimOperation(actor, id));
  });
  app.get('/v1/enrollments/operations/:id', async (request) => {
    const actor = await authenticate(request);
    const { id } = input(idParams, request.params);
    return setupOperationSchema.parse(await service().getOperation(actor, id));
  });
}
