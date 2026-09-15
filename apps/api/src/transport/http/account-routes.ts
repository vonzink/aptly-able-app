import type { FastifyInstance } from 'fastify';
import { requestAccountDeletionSchema } from '@aptly/contracts';
import type { AccountDeletionService } from '../../modules/account-deletion/service.js';
import { PasswordBusyError } from '../../modules/identity/password.js';
import { HttpError } from './errors.js';
export function registerAccountRoutes(app: FastifyInstance, service?: AccountDeletionService) {
  const buckets = new Map<string, { count: number; until: number }>();
  app.post('/v1/account/deletion', async (request, reply) => {
    const now = Date.now();
    for (const [key, value] of buckets) if (value.until <= now) buckets.delete(key);
    const bucket = buckets.get(request.ip) ?? { count: 0, until: now + 60000 };
    if (buckets.size >= 10000 || ++bucket.count > 10)
      throw new HttpError(429, 'AUTH_THROTTLED', 'Please wait before trying again.');
    buckets.set(request.ip, bucket);
    if (!service) throw new HttpError(503, 'UNAVAILABLE', 'Account deletion is unavailable.');
    const input = requestAccountDeletionSchema.safeParse(request.body);
    if (!input.success)
      throw new HttpError(400, 'INVALID_INPUT', 'Confirm deletion and enter your password.');
    try {
      return reply.code(202).send(await service.request(request.headers.authorization, input.data));
    } catch (error) {
      if (error instanceof PasswordBusyError)
        throw new HttpError(429, 'AUTH_THROTTLED', 'Please wait before trying again.');
      throw error;
    }
  });
  app.get('/v1/account/deletion', async (request) => {
    if (!service) throw new HttpError(503, 'UNAVAILABLE', 'Account deletion is unavailable.');
    return service.status(request.headers.authorization);
  });
}
