import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  plaudDeviceCapabilitiesSchema,
  plaudDeviceSessionSchema,
  plaudDeviceOperationRequestSchema,
  plaudDeviceBindSchema,
  plaudDeviceUnbindSchema,
  plaudDeviceReleaseSchema,
} from '@aptly/contracts';
import type { SessionVerifier } from '../../modules/identity/development-identity.js';
import type { PlaudDeviceService } from '../../modules/plaud-devices/service.js';
import { HttpError } from './errors.js';

type Dependencies = {
  identity: SessionVerifier;
  plaudDevices: PlaudDeviceService | undefined;
  configured: boolean;
  probeDatabase: () => Promise<void>;
};
export function registerPlaudDeviceRoutes(
  app: FastifyInstance,
  { identity, plaudDevices, configured, probeDatabase }: Dependencies,
) {
  function input<T>(schema: z.ZodType<T>, raw: unknown): T {
    const result = schema.safeParse(raw);
    if (!result.success)
      throw new HttpError(400, 'INVALID_REQUEST', 'A valid recorder enrollment is required.');
    return result.data;
  }
  async function authorize(request: FastifyRequest) {
    const actor = await identity.verify(request.headers.authorization);
    if (!actor) throw new HttpError(401, 'UNAUTHORIZED', 'A valid session is required.');
    input(z.strictObject({}), request.query);
    const { operationId } = input(plaudDeviceOperationRequestSchema, request.body);
    if (!configured)
      throw new HttpError(
        503,
        'PLAUD_NOT_CONFIGURED',
        'Plaud device connection is not configured.',
      );
    if (!plaudDevices)
      throw new HttpError(
        503,
        'PLAUD_STORAGE_UNAVAILABLE',
        'Recorder enrollment storage is temporarily unavailable.',
      );
    return { actor, operationId, service: plaudDevices };
  }
  app.get('/v1/plaud/capabilities', async (request) => {
    input(z.strictObject({}), request.query);
    if (!configured)
      return plaudDeviceCapabilitiesSchema.parse({ available: false, reason: 'not_configured' });
    let storageAvailable = !!plaudDevices;
    if (storageAvailable) {
      try {
        await probeDatabase();
      } catch {
        storageAvailable = false;
      }
    }
    return plaudDeviceCapabilitiesSchema.parse(
      storageAvailable
        ? { available: true, reason: 'ready' }
        : { available: false, reason: 'storage_unavailable' },
    );
  });
  app.post('/v1/plaud/device-session', async (request) => {
    const { actor, operationId, service } = await authorize(request);
    return plaudDeviceSessionSchema.parse(await service.session(actor, operationId));
  });
  app.post('/v1/plaud/device-bind', async (request) => {
    const { actor, operationId, service } = await authorize(request);
    return plaudDeviceBindSchema.parse(await service.bind(actor, operationId));
  });
  app.post('/v1/plaud/device-unbind', async (request) => {
    const { actor, operationId, service } = await authorize(request);
    return plaudDeviceUnbindSchema.parse(await service.unbind(actor, operationId));
  });
  app.post('/v1/plaud/device-complete-unpair', async (request) => {
    const { actor, operationId, service } = await authorize(request);
    return plaudDeviceReleaseSchema.parse(await service.completeUnpair(actor, operationId));
  });
}
