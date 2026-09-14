import type { PilotIdentity } from '../../modules/identity/pilot-identity.js';
import { registerAuthRoutes } from './auth-routes.js';
import { PlaudDeviceError } from '../../modules/plaud-devices/errors.js';
import type { PlaudDeviceService } from '../../modules/plaud-devices/service.js';
import { registerPlaudDeviceRoutes } from './plaud-device-routes.js';
import type { ProcessingService } from '../../modules/recordings/service.js';
import { RecordingError } from '../../modules/recordings/errors.js';
import { registerRecordingRoutes } from './recording-routes.js';
import { randomUUID } from 'node:crypto';
import Fastify, { LogController } from 'fastify';
import { healthResponseSchema, sessionResponseSchema } from '@aptly/contracts';
import type { ApiConfig } from '../../bootstrap/config.js';
import { createDevelopmentIdentity } from '../../modules/identity/development-identity.js';
import { EnrollmentError, type EnrollmentService } from '../../modules/enrollments/service.js';
import { registerEnrollmentRoutes } from './enrollment-routes.js';
import type { AdminEnrollmentQueries } from '../../modules/enrollments/admin-queries.js';
import { registerAdminRoutes } from './admin-routes.js';
import { HttpError } from './errors.js';
import { registerBrowserAccess } from './browser-access.js';

type AppDependencies = {
  config: ApiConfig;
  pilotIdentity?: PilotIdentity;
  probeDatabase: () => Promise<void>;
  logger?: boolean;
  enrollments?: EnrollmentService;
  adminQueries?: AdminEnrollmentQueries;
  recordings?: ProcessingService;
  transcriptionAvailable?: boolean;
  plaudDevices?: PlaudDeviceService;
};
export function buildApp({
  config,
  pilotIdentity,
  probeDatabase,
  logger = false,
  enrollments,
  adminQueries,
  recordings,
  transcriptionAvailable = false,
  plaudDevices,
}: AppDependencies) {
  const app = Fastify({
    logger,
    trustProxy: config.trustedProxyIp ?? false,
    logController: new LogController({ disableRequestLogging: true }),
    genReqId: () => randomUUID(),
    bodyLimit: 16_384,
    requestTimeout: 120_000,
  });
  const development = createDevelopmentIdentity(
    config.developmentIdentity,
    config.developmentAdminIdentity,
  );
  const pilot = config.pilotAuthEnabled ? pilotIdentity : undefined;
  if (config.pilotAuthEnabled && !pilot) throw new Error('Pilot identity is required.');
  const identity = {
    async verify(authorization: string | undefined) {
      return development.verify(authorization) ?? (await pilot?.verify(authorization));
    },
  };
  registerAuthRoutes(app, pilot, !!config.developmentIdentity || !!config.developmentAdminIdentity);
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('Referrer-Policy', 'no-referrer');
  });
  registerBrowserAccess(app, config.browserOrigins);
  app.setErrorHandler((error, request, reply) => {
    if (
      error instanceof HttpError ||
      error instanceof EnrollmentError ||
      error instanceof RecordingError ||
      error instanceof PlaudDeviceError
    ) {
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message, requestId: request.id },
      });
    }
    const status =
      error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined;
    const clientError = typeof status === 'number' && status >= 400 && status < 500;
    // Vendor errors and request bodies may contain credentials or conversation content.
    request.log.error({ requestId: request.id, event: 'http_error', clientError });
    return reply.code(clientError ? status : 500).send({
      error: {
        code: clientError ? 'INVALID_REQUEST' : 'INTERNAL_ERROR',
        message: clientError
          ? 'The request could not be accepted.'
          : 'The request could not be completed.',
        requestId: request.id,
      },
    });
  });
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'This endpoint is not available.',
        requestId: request.id,
      },
    }),
  );
  app.get('/health/live', async () => healthResponseSchema.parse({ status: 'ok' }));
  app.get('/health/ready', async (_request, reply) => {
    try {
      await probeDatabase();
      return healthResponseSchema.parse({ status: 'ok' });
    } catch {
      return reply.code(503).send(healthResponseSchema.parse({ status: 'unavailable' }));
    }
  });
  app.get('/v1/session', async (request, reply) => {
    const actor = await identity.verify(request.headers.authorization);
    if (!actor)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'A valid session is required.',
          requestId: request.id,
        },
      });
    return sessionResponseSchema.parse({
      user: { id: actor.userId, role: actor.role },
      mode: actor.selfService ? 'pilot' : 'development',
    });
  });
  registerPlaudDeviceRoutes(app, {
    identity,
    plaudDevices,
    configured: !!config.plaudSdk,
    probeDatabase,
  });
  registerRecordingRoutes(app, { identity, recordings, available: transcriptionAvailable });
  registerAdminRoutes(app, identity, adminQueries);
  registerEnrollmentRoutes(app, {
    identity,
    enrollments,
    enrollmentBaseUrl: config.enrollmentBaseUrl,
  });
  return app;
}
