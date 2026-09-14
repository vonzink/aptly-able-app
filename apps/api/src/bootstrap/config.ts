import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { z } from 'zod';
const credentialSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{32,256}$/)
  .optional();
const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.enum(['127.0.0.1', '0.0.0.0', '::1']).default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4100),
    PILOT_AUTH_ENABLED: z.enum(['true', 'false']).default('false'),
    TRUSTED_PROXY_IP: z.ipv4().optional(),
    DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }).optional(),
    DEV_SESSION_TOKEN: credentialSchema,
    DEV_USER_ID: z.uuid().optional(),
    DEV_ADMIN_SESSION_TOKEN: credentialSchema,
    DEV_ADMIN_USER_ID: z.uuid().optional(),
    DEV_USER_DISPLAY_NAME: z.string().trim().min(1).max(120).default('Local user'),
    DEV_ADMIN_DISPLAY_NAME: z.string().trim().min(1).max(120).default('Local administrator'),
    BROWSER_ORIGINS: z.string().default(''),
    ENROLLMENT_BASE_URL: z.url().max(512).optional(),
    RECORDINGS_DIRECTORY: z.string().min(1).optional(),
    PLAUD_CLIENT_ID: z.string().trim().min(1).max(512).optional(),
    PLAUD_CLIENT_SECRET: z.string().trim().min(1).max(2048).optional(),
    PLAUD_API_KEY: z.string().trim().min(1).max(2048).optional(),
    PLAUD_REGION: z.enum(['us', 'jp']).default('us'),
  })
  .superRefine((env, context) => {
    if (env.PILOT_AUTH_ENABLED === 'true' && !env.DATABASE_URL)
      context.addIssue({ code: 'custom', message: 'Pilot authentication requires a database.' });
    const reject = (message: string) => context.addIssue({ code: 'custom', message });
    if (
      !!env.PLAUD_CLIENT_ID !== !!env.PLAUD_CLIENT_SECRET ||
      (env.PLAUD_API_KEY && !env.PLAUD_CLIENT_ID)
    )
      reject(
        'Plaud SDK credentials are required together; transcription also requires an API key.',
      );
    for (const [token, userId] of [
      [env.DEV_SESSION_TOKEN, env.DEV_USER_ID],
      [env.DEV_ADMIN_SESSION_TOKEN, env.DEV_ADMIN_USER_ID],
    ]) {
      if ((token !== undefined) !== (userId !== undefined)) {
        reject('Development credentials must be provided together.');
      }
      if (
        (token !== undefined || userId !== undefined) &&
        (env.NODE_ENV === 'production' || env.HOST === '0.0.0.0')
      ) {
        reject('Development identity requires a non-production loopback listener.');
      }
    }
    if (env.DEV_SESSION_TOKEN && env.DEV_SESSION_TOKEN === env.DEV_ADMIN_SESSION_TOKEN) {
      reject('Administrator and user credentials must be different.');
    }
    if (env.DEV_USER_ID && env.DEV_USER_ID.toLowerCase() === env.DEV_ADMIN_USER_ID?.toLowerCase()) {
      reject('Administrator and user identities must be different.');
    }
    for (const origin of env.BROWSER_ORIGINS.split(',')
      .map((value) => value.trim())
      .filter(Boolean)) {
      try {
        const url = new URL(origin);
        const localHttp =
          env.NODE_ENV !== 'production' &&
          url.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
        if ((url.protocol !== 'https:' && !localHttp) || origin !== url.origin)
          reject('Browser origins must be explicit origins.');
      } catch {
        reject('Browser origins must be explicit origins.');
      }
    }
    if (env.ENROLLMENT_BASE_URL) {
      let url: URL;
      try {
        url = new URL(env.ENROLLMENT_BASE_URL);
      } catch {
        reject('Enrollment destination must be a valid URL.');
        return;
      }
      const localHttp =
        env.NODE_ENV !== 'production' &&
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      const localInstalledApp = env.NODE_ENV !== 'production' && url.href === 'aptlyable://enroll';
      if (
        (url.protocol !== 'https:' && !localHttp && !localInstalledApp) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        reject(
          'Enrollment links require clean HTTPS, development loopback, or the development app enrollment route.',
        );
      }
    }
  });
export function readConfig(environment: Record<string, string | undefined>) {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success)
    throw new Error('Invalid API configuration. Check environment variable names and formats.');
  const env = parsed.data;
  return {
    recordingsDirectory: env.RECORDINGS_DIRECTORY
      ? resolve(env.RECORDINGS_DIRECTORY)
      : fileURLToPath(new URL('../../../../.local/recordings/', import.meta.url)),
    plaudSdk:
      env.PLAUD_CLIENT_ID && env.PLAUD_CLIENT_SECRET
        ? {
            clientId: env.PLAUD_CLIENT_ID,
            clientSecret: env.PLAUD_CLIENT_SECRET,
            region: env.PLAUD_REGION,
          }
        : undefined,
    plaud:
      env.PLAUD_CLIENT_ID && env.PLAUD_CLIENT_SECRET && env.PLAUD_API_KEY
        ? {
            clientId: env.PLAUD_CLIENT_ID,
            clientSecret: env.PLAUD_CLIENT_SECRET,
            apiKey: env.PLAUD_API_KEY,
            region: env.PLAUD_REGION,
          }
        : undefined,
    trustedProxyIp: env.TRUSTED_PROXY_IP,
    environment: env.NODE_ENV,
    host: env.HOST,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    pilotAuthEnabled: env.PILOT_AUTH_ENABLED === 'true',
    browserOrigins: env.BROWSER_ORIGINS.split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    developmentUserDisplayName: env.DEV_USER_DISPLAY_NAME,
    developmentAdminDisplayName: env.DEV_ADMIN_DISPLAY_NAME,
    enrollmentBaseUrl: env.ENROLLMENT_BASE_URL,
    developmentIdentity:
      env.DEV_SESSION_TOKEN && env.DEV_USER_ID
        ? { token: env.DEV_SESSION_TOKEN, userId: env.DEV_USER_ID.toLowerCase() }
        : undefined,
    developmentAdminIdentity:
      env.DEV_ADMIN_SESSION_TOKEN && env.DEV_ADMIN_USER_ID
        ? { token: env.DEV_ADMIN_SESSION_TOKEN, userId: env.DEV_ADMIN_USER_ID.toLowerCase() }
        : undefined,
  };
}
export type ApiConfig = ReturnType<typeof readConfig>;
