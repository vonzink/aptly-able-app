import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  adminAssignmentSchema,
  adminAssignmentsResponseSchema,
  adminUsersResponseSchema,
} from '@aptly/contracts';
import type { SessionVerifier } from '../../modules/identity/development-identity.js';
import type { AdminEnrollmentQueries } from '../../modules/enrollments/admin-queries.js';
import { HttpError } from './errors.js';

export function registerAdminRoutes(
  app: FastifyInstance,
  identity: SessionVerifier,
  queries: AdminEnrollmentQueries | undefined,
) {
  const authenticate = async (request: FastifyRequest, selfService: boolean) => {
    const actor = await identity.verify(request.headers.authorization);
    if (!actor) throw new HttpError(401, 'UNAUTHORIZED', 'A valid session is required.');
    if (actor.role !== 'admin' && !(selfService && actor.selfService))
      throw new HttpError(403, 'FORBIDDEN', 'Administrator access is required.');
    return actor;
  };
  const repository = () => {
    if (!queries)
      throw new HttpError(503, 'ENROLLMENT_UNAVAILABLE', 'Enrollment is temporarily unavailable.');
    return queries;
  };
  const parse = <T>(schema: z.ZodType<T>, value: unknown) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success)
      throw new HttpError(400, 'INVALID_REQUEST', 'The request could not be accepted.');
    return parsed.data;
  };
  const page = z.strictObject({ page: z.coerce.number().int().min(1).max(100000).default(1) });
  for (const prefix of ['/v1/admin', '/v1/workspace']) {
    app.get(`${prefix}/users`, async (request) => {
      const actor = await authenticate(request, prefix === '/v1/workspace');
      const input = parse(page, request.query);
      return adminUsersResponseSchema.parse(await repository().users(actor, input.page));
    });
    app.get(`${prefix}/recorder-assignments`, async (request) => {
      const actor = await authenticate(request, prefix === '/v1/workspace');
      const input = parse(page, request.query);
      return adminAssignmentsResponseSchema.parse(
        await repository().assignments(actor, input.page),
      );
    });
    app.get(`${prefix}/recorder-assignments/:id`, async (request) => {
      const actor = await authenticate(request, prefix === '/v1/workspace');
      parse(z.strictObject({}), request.query);
      const { id } = parse(z.strictObject({ id: z.uuid() }), request.params);
      return adminAssignmentSchema.parse(await repository().assignment(actor, id));
    });
  }
}
