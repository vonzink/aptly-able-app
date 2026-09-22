import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  accountRecorderSchema,
  accountRecordersSchema,
  recorderIdentitySchema,
  setupOperationSchema,
} from '@aptly/contracts';
import type { SessionVerifier } from '../../modules/identity/development-identity.js';
import type { RecorderSetupService } from '../../modules/recorder-setup/service.js';
import { HttpError } from './errors.js';

export function registerRecorderSetupRoutes(
  app: FastifyInstance,
  identity: SessionVerifier,
  service?: RecorderSetupService,
) {
  const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
    const result = schema.safeParse(value);
    if (!result.success)
      throw new HttpError(400, 'INVALID_REQUEST', 'Check the details and try again.');
    return result.data;
  };
  async function authenticate(request: FastifyRequest) {
    const actor = await identity.verify(request.headers.authorization);
    if (!actor) throw new HttpError(401, 'UNAUTHORIZED', 'Sign in to set up your recorder.');
    parse(z.strictObject({}), request.query);
    if (!service)
      throw new HttpError(
        503,
        'ENROLLMENT_UNAVAILABLE',
        'Recorder setup is temporarily unavailable.',
      );
    return actor;
  }
  app.get('/v1/me/recorders', async (request) => {
    const actor = await authenticate(request);
    return accountRecordersSchema.parse(await service!.list(actor));
  });
  app.post('/v1/me/recorders', async (request) => {
    const actor = await authenticate(request);
    return accountRecorderSchema.parse(
      await service!.add(actor, parse(recorderIdentitySchema, request.body)),
    );
  });
  app.post('/v1/me/recorders/:id/setup', async (request) => {
    const actor = await authenticate(request);
    const { id } = parse(z.strictObject({ id: z.uuid() }), request.params);
    parse(z.strictObject({}), request.body ?? {});
    return setupOperationSchema.parse(await service!.begin(actor, id));
  });
}
