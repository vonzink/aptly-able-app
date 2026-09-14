import type { FastifyInstance } from 'fastify';
import { authConfigSchema, registerAccountSchema, loginAccountSchema } from '@aptly/contracts';
import type { PilotIdentity } from '../../modules/identity/pilot-identity.js';
import { PilotAuthError } from '../../modules/identity/pilot-identity.js';
import { PasswordBusyError } from '../../modules/identity/password.js';
import { HttpError } from './errors.js';

export function registerAuthRoutes(
  app: FastifyInstance,
  pilot: PilotIdentity | undefined,
  developmentEnabled: boolean,
) {
  // Bounded per-process buckets. Fastify accepts forwarded IPs only from the configured proxy.
  const buckets = new Map<string, { count: number; until: number }>();
  function limit(key: string) {
    const now = Date.now();
    for (const [ip, bucket] of buckets) if (bucket.until <= now) buckets.delete(ip);
    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= 10000)
        throw new HttpError(429, 'AUTH_THROTTLED', 'Please wait before trying again.');
      bucket = { count: 0, until: now + 60000 };
      buckets.set(key, bucket);
    }
    if (++bucket.count > 10)
      throw new HttpError(429, 'AUTH_THROTTLED', 'Please wait before trying again.');
  }
  app.get('/v1/auth/config', async () =>
    authConfigSchema.parse({ pilotEnabled: !!pilot, developmentEnabled }),
  );
  for (const action of ['register', 'login'] as const) {
    app.post(`/v1/auth/${action}`, async (request, reply) => {
      limit(request.ip);
      if (!pilot) throw new HttpError(503, 'AUTH_UNAVAILABLE', 'Account sign-in is not available.');
      try {
        if (action === 'register') {
          const input = registerAccountSchema.safeParse(request.body);
          if (!input.success) throw new PilotAuthError();
          return reply.code(201).send(await pilot.register(input.data));
        }
        const input = loginAccountSchema.safeParse(request.body);
        if (!input.success) throw new PilotAuthError();
        return await pilot.login(input.data);
      } catch (error) {
        if (error instanceof PilotAuthError)
          throw new HttpError(error.statusCode, error.code, error.message);
        if (error instanceof PasswordBusyError)
          throw new HttpError(429, 'AUTH_THROTTLED', 'Please wait before trying again.');
        throw error;
      }
    });
  }
  app.post('/v1/auth/logout', async (request, reply) => {
    if (!pilot) throw new HttpError(503, 'AUTH_UNAVAILABLE', 'Account sign-in is not available.');
    await pilot.logout(request.headers.authorization);
    return reply.code(204).send();
  });
}
