import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Readable } from 'node:stream';
import {
  registerRecordingSchema,
  retryTranscriptionSchema,
  transcriptionCapabilitiesSchema,
} from '@aptly/contracts';
import type { ProcessingService } from '../../modules/recordings/service.js';
import type { SessionVerifier } from '../../modules/identity/development-identity.js';
import { HttpError } from './errors.js';
const paramsSchema = z.strictObject({ id: z.uuid() });
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new HttpError(400, 'INVALID_REQUEST', 'Check the recording details and try again.');
  return parsed.data;
}
export function registerRecordingRoutes(
  app: FastifyInstance,
  {
    identity,
    recordings,
    available,
  }: { identity: SessionVerifier; recordings: ProcessingService | undefined; available: boolean },
) {
  const authenticate = async (request: FastifyRequest) => {
    const actor = await identity.verify(request.headers.authorization);
    if (!actor) throw new HttpError(401, 'UNAUTHORIZED', 'A valid session is required.');
    return actor.userId;
  };
  const service = () => {
    if (!recordings)
      throw new HttpError(503, 'TRANSCRIPTION_UNAVAILABLE', 'Recording storage is unavailable.');
    return recordings;
  };
  const requireProvider = () => {
    if (!available)
      throw new HttpError(
        503,
        'TRANSCRIPTION_NOT_CONFIGURED',
        'Automatic transcription is not configured yet.',
      );
  };
  app.get('/v1/transcription/capabilities', async () =>
    transcriptionCapabilitiesSchema.parse({
      available: !!recordings && available,
      provider: 'plaud',
      reason: !recordings ? 'storage_unavailable' : available ? 'ready' : 'not_configured',
    }),
  );
  app.post('/v1/recordings', async (request, reply) => {
    const userId = await authenticate(request);
    requireProvider();
    return reply
      .code(201)
      .send(await service().register(userId, parse(registerRecordingSchema, request.body)));
  });
  app.get('/v1/recordings/:id', async (request) =>
    service().get(await authenticate(request), parse(paramsSchema, request.params).id),
  );
  app.post('/v1/recordings/:id/retry', async (request) => {
    const userId = await authenticate(request);
    requireProvider();
    return service().retry(
      userId,
      parse(paramsSchema, request.params).id,
      parse(retryTranscriptionSchema, request.body ?? {}).acknowledgeDuplicateRisk,
    );
  });
  void app.register(async (upload) => {
    upload.addContentTypeParser('application/octet-stream', (_request, payload, done) =>
      done(null, payload),
    );
    upload.post(
      '/v1/recordings/:id/audio',
      {
        bodyLimit: 250 * 1024 * 1024,
        onRequest: async (request) => {
          await authenticate(request);
          requireProvider();
          if (request.headers['content-type']?.split(';')[0]?.trim() !== 'application/octet-stream')
            throw new HttpError(415, 'INVALID_AUDIO', 'Upload the raw audio bytes.');
        },
      },
      async (request) =>
        service().upload(
          await authenticate(request),
          parse(paramsSchema, request.params).id,
          request.body as Readable,
        ),
    );
  });
}
