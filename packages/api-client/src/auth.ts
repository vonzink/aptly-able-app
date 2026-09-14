import { z } from 'zod';
import {
  authConfigSchema,
  authResponseSchema,
  registerAccountSchema,
  loginAccountSchema,
  type AuthConfig,
  type AuthResponse,
  type RegisterAccount,
  type LoginAccount,
} from '@aptly/contracts';
import { apiBase } from './api-base.js';
import { ApiError } from './api-error.js';
import type { RequestOptions } from './types.js';
export interface AuthClient {
  config(options?: RequestOptions): Promise<AuthConfig>;
  register(input: RegisterAccount, options?: RequestOptions): Promise<AuthResponse>;
  login(input: LoginAccount, options?: RequestOptions): Promise<AuthResponse>;
  logout(credential: string, options?: RequestOptions): Promise<void>;
}
export function createAuthClient({
  baseUrl,
  developmentHttpOrigin,
  fetch: transport = globalThis.fetch,
}: {
  baseUrl: string;
  developmentHttpOrigin?: string;
  fetch?: typeof globalThis.fetch;
}): AuthClient {
  const base = apiBase(baseUrl, developmentHttpOrigin);
  async function request<T>(
    action: string,
    schema: z.ZodType<T>,
    body: unknown,
    options: RequestOptions = {},
    credential?: string,
  ): Promise<T> {
    const controller = new AbortController();
    let timedOut = false;
    let rejectAbort: (reason: Error) => void = () => {};
    const stopped = new Promise<never>((_resolve, reject) => {
      rejectAbort = reject;
    });
    const cancel = () => {
      controller.abort();
      rejectAbort(new Error('cancelled'));
    };
    if (options.signal?.aborted) throw new ApiError(0, 'CANCELLED', 'The request was cancelled.');
    options.signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      cancel();
    }, 30000);
    try {
      return await Promise.race([
        stopped,
        (async () => {
          const response = await transport(`${base}/v1/auth/${action}`, {
            method: action === 'config' ? 'GET' : 'POST',
            headers: {
              ...(body ? { 'Content-Type': 'application/json' } : {}),
              ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
            credentials: 'omit',
            redirect: 'error',
            cache: 'no-store',
            signal: controller.signal,
          });
          if (controller.signal.aborted) {
            void response.body?.cancel().catch(() => {});
            throw new Error('cancelled');
          }
          if (response.redirected)
            throw new ApiError(
              0,
              'INVALID_RESPONSE',
              'The service returned an unexpected response.',
            );
          if (!response.ok)
            throw new ApiError(
              response.status,
              response.status === 429 ? 'AUTH_THROTTLED' : 'AUTH_FAILED',
              response.status === 429
                ? 'Please wait before trying again.'
                : 'The account request could not be completed. Check your details and try again.',
            );
          const parsed = schema.safeParse(action === 'logout' ? undefined : await response.json());
          if (!parsed.success)
            throw new ApiError(
              0,
              'INVALID_RESPONSE',
              'The service returned an unexpected response.',
            );
          return parsed.data;
        })(),
      ]);
    } catch (error) {
      if (timedOut) throw new ApiError(0, 'TIMEOUT', 'The request took too long. Try again.');
      if (controller.signal.aborted)
        throw new ApiError(0, 'CANCELLED', 'The request was cancelled.');
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        0,
        'NETWORK_ERROR',
        'Cannot reach the service. Check your connection and try again.',
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
    }
  }
  function input<T>(schema: z.ZodType<T>, raw: unknown) {
    const parsed = schema.safeParse(raw);
    if (!parsed.success)
      throw new ApiError(
        0,
        'INVALID_INPUT',
        'Enter a name, valid email and a password of 12–128 characters.',
      );
    return parsed.data;
  }
  return {
    config: (options) => request('config', authConfigSchema, undefined, options),
    register: (raw, options) =>
      request('register', authResponseSchema, input(registerAccountSchema, raw), options),
    login: (raw, options) =>
      request('login', authResponseSchema, input(loginAccountSchema, raw), options),
    logout: (credential, options) =>
      request('logout', z.undefined(), undefined, options, credential),
  };
}
