import type { FastifyInstance } from 'fastify';
import { HttpError } from './errors.js';

export function registerBrowserAccess(app: FastifyInstance, origins: readonly string[]) {
  const allowed = new Set(origins);
  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (!origin) return;
    reply.header('Vary', 'Origin');
    if (!allowed.has(origin))
      throw new HttpError(403, 'FORBIDDEN', 'This browser origin is not allowed.');
    reply.header('Access-Control-Allow-Origin', origin);
    if (request.method === 'OPTIONS') {
      const method = request.headers['access-control-request-method'];
      const headers = String(request.headers['access-control-request-headers'] ?? '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      if (
        !['GET', 'POST'].includes(String(method)) ||
        headers.some((value) => !['authorization', 'content-type'].includes(value))
      ) {
        throw new HttpError(403, 'FORBIDDEN', 'This browser request is not allowed.');
      }
      reply.header('Access-Control-Allow-Methods', 'GET, POST');
      reply.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      return reply.code(204).send();
    }
  });
}
