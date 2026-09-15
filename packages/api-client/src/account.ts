import { z } from 'zod';
import {
  accountDeletionReceiptSchema,
  requestAccountDeletionSchema,
  type RequestAccountDeletion,
  type AccountDeletionReceipt,
} from '@aptly/contracts';
import { apiBase } from './api-base.js';
import { ApiError } from './api-error.js';
import type { ApiClientOptions, RequestOptions } from './types.js';
export interface AccountClient {
  requestDeletion(
    input: RequestAccountDeletion,
    options?: RequestOptions,
  ): Promise<AccountDeletionReceipt>;
  getDeletionStatus(options?: RequestOptions): Promise<AccountDeletionReceipt>;
}
export function createAccountClient({
  baseUrl,
  developmentHttpOrigin,
  getCredential,
  fetch: transport = globalThis.fetch,
}: ApiClientOptions): AccountClient {
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
          const response = await transport(`${base}/v1/account/deletion`, {
            method: action === 'status' ? 'GET' : 'POST',
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
          const parsed = schema.safeParse(await response.json());
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
  function validateInput<T>(schema: z.ZodType<T>, raw: unknown) {
    const parsed = schema.safeParse(raw);
    if (!parsed.success)
      throw new ApiError(0, 'INVALID_INPUT', 'Enter your password and type DELETE to confirm.');
    return parsed.data;
  }
  const credential = () => {
    const value = getCredential();
    if (!value) throw new ApiError(401, 'UNAUTHORIZED', 'Sign in to request account deletion.');
    return value;
  };
  return {
    requestDeletion: (input, options) =>
      request(
        'request',
        accountDeletionReceiptSchema,
        validateInput(requestAccountDeletionSchema, input),
        options,
        credential(),
      ),
    getDeletionStatus: (options) =>
      request('status', accountDeletionReceiptSchema, undefined, options, credential()),
  };
}
