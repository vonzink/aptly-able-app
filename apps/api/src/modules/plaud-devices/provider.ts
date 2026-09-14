import { z } from 'zod';
import { plaudDeviceSessionSchema, type PlaudDeviceSession } from '@aptly/contracts';
import { createHttp } from '../transcription/plaud/http.js';
import { PlaudDeviceError } from './errors.js';

type Recorder = PlaudDeviceSession['recorder'];
export type PlaudSdkSession = Pick<
  PlaudDeviceSession,
  'userAccessToken' | 'expiresAt' | 'customDomain'
>;
export interface PlaudDeviceProvider {
  session(userId: string): Promise<PlaudSdkSession>;
  bind(userId: string, recorder: Recorder): Promise<void>;
  unbind(userId: string, recorder: Recorder): Promise<void>;
}
export interface PlaudDeviceProviderOptions {
  clientId: string;
  clientSecret: string;
  region: 'us' | 'jp';
  fetch?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
}
const tokenSchema = z.object({
  access_token: plaudDeviceSessionSchema.shape.userAccessToken,
  token_type: z.string().regex(/^bearer$/i),
  expires_in: z
    .number()
    .int()
    .min(1)
    .max(31 * 86400),
});
const invalidResponse = () =>
  new PlaudDeviceError(
    'PLAUD_PROVIDER_INVALID_RESPONSE',
    502,
    'Plaud returned an unexpected device response. Try again.',
  );
const unavailable = () =>
  new PlaudDeviceError(
    'PLAUD_PROVIDER_UNAVAILABLE',
    502,
    'Plaud could not complete the device request. Try again.',
  );

/** Uses only fixed official hosts, server-owned recorder data, and transient per-user tokens. */
export function createPlaudDeviceProvider(
  options: PlaudDeviceProviderOptions,
): PlaudDeviceProvider {
  const timeoutMs = options.timeoutMs ?? 10000;
  if (
    !['us', 'jp'].includes(options.region) ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 300000 ||
    !options.clientId ||
    options.clientId.includes(':') ||
    !options.clientSecret ||
    /[\r\n]/.test(options.clientId + options.clientSecret)
  ) {
    throw new PlaudDeviceError(
      'PLAUD_NOT_CONFIGURED',
      503,
      'Plaud device connection is not configured.',
    );
  }
  const customDomain = `platform-${options.region}.plaud.ai` as const;
  const base = `https://${customDomain}/developer/api`;
  // Reuse the hardened vendor transport: bounded bodies/timeouts, no redirects or raw failures.
  const request = createHttp(options.fetch ?? globalThis.fetch, timeoutMs);
  const now = options.now ?? Date.now;
  const post = (authorization: string, body: unknown): RequestInit => ({
    method: 'POST',
    headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  async function safe<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof PlaudDeviceError) throw error;
      throw unavailable();
    }
  }
  async function session(userId: string): Promise<PlaudSdkSession> {
    if (!z.uuid().safeParse(userId).success)
      throw new PlaudDeviceError('INVALID_INPUT', 400, 'A valid user is required.');
    const partner = tokenSchema.safeParse(
      await request(`${base}/oauth/partner/access-token`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${options.clientId}:${options.clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: '',
      }),
    );
    if (!partner.success) throw invalidResponse();
    // Start the lifetime before minting so network latency cannot extend the reported expiry.
    const issuedAt = now();
    const user = tokenSchema.safeParse(
      await request(
        `${base}/open/partner/users/access-token`,
        post(`Bearer ${partner.data.access_token}`, { user_id: userId, expires_in: 3600 }),
      ),
    );
    if (!user.success) throw invalidResponse();
    const expiresAt = issuedAt + user.data.expires_in * 1000;
    if (!Number.isFinite(expiresAt) || expiresAt <= now()) throw invalidResponse();
    return {
      userAccessToken: user.data.access_token,
      expiresAt: new Date(expiresAt).toISOString(),
      customDomain,
    };
  }
  async function binding(userId: string, recorder: Recorder, bound: boolean) {
    if (!plaudDeviceSessionSchema.shape.recorder.safeParse(recorder).success)
      throw new PlaudDeviceError('INVALID_INPUT', 400, 'Valid recorder details are required.');
    const token = await session(userId);
    if (bound) {
      // A brand-new serial has no registry entry until sn-sign runs; bind otherwise returns
      // 404. This registers it before cloud ownership, while the native SDK still obtains
      // its own signature and verifies the encrypted handshake before reporting readiness.
      const signed = z
        .object({ signature: z.string().min(1).max(16384) })
        .safeParse(
          await request(
            `${base}/open/partner/sdk/sn-sign`,
            post(`Bearer ${token.userAccessToken}`, { type: recorder.model, sn: recorder.serial }),
          ),
        );
      if (!signed.success) throw invalidResponse();
    }
    const result = z
      .object({
        type: z.literal(recorder.model).optional(),
        sn: z.literal(recorder.serial).optional(),
        device_id: z
          .string()
          .min(1)
          .max(256)
          .regex(/^[A-Za-z0-9_-]+$/)
          .optional(),
        is_bind: z.literal(bound),
      })
      .safeParse(
        await request(
          `${base}/open/partner/sdk/${bound ? 'bind' : 'unbind'}`,
          post(`Bearer ${token.userAccessToken}`, { type: recorder.model, sn: recorder.serial }),
        ),
      );
    if (!result.success) throw invalidResponse();
    if (result.data.type && result.data.sn) return;
    // Live responses identify the device by an opaque ID instead of echoing type/sn.
    // Resolve that same owned serial and require the identical ID and binding state.
    if (!result.data.device_id) throw invalidResponse();
    const registry = z
      .object({ device_id: z.literal(result.data.device_id), is_bind: z.literal(bound) })
      .safeParse(
        await request(
          `${base}/open/partner/sdk/binding?${new URLSearchParams({ type: recorder.model, sn: recorder.serial })}`,
          { headers: { Authorization: `Bearer ${token.userAccessToken}` } },
        ),
      );
    if (!registry.success) throw invalidResponse();
  }
  return {
    session: (userId) => safe(() => session(userId)),
    bind: (userId, recorder) => safe(() => binding(userId, recorder, true)),
    unbind: (userId, recorder) => safe(() => binding(userId, recorder, false)),
  };
}
