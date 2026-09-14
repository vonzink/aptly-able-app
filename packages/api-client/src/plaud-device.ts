import { z } from 'zod';
import {
  plaudDeviceCapabilitiesSchema,
  plaudDeviceSessionSchema,
  plaudDeviceOperationRequestSchema,
  plaudDeviceBindSchema,
  plaudDeviceUnbindSchema,
  type PlaudDeviceCapabilities,
  type PlaudDeviceSession,
  type PlaudDeviceBind,
  type PlaudDeviceUnbind,
} from '@aptly/contracts';
import { ApiError } from './api-error.js';
import { apiBase } from './api-base.js';
import type { ApiClientOptions, RequestOptions } from './types.js';

export interface PlaudDeviceClient {
  capabilities(options?: RequestOptions): Promise<PlaudDeviceCapabilities>;
  session(operationId: string, options?: RequestOptions): Promise<PlaudDeviceSession>;
  bind(operationId: string, options?: RequestOptions): Promise<PlaudDeviceBind>;
  unbind(operationId: string, options?: RequestOptions): Promise<PlaudDeviceUnbind>;
}
const messages: Record<string, string> = {
  UNAUTHORIZED: 'Your access code was not accepted. Sign in again.',
  PLAUD_NOT_CONFIGURED: 'Plaud device connection is not configured on this server yet.',
  PLAUD_STORAGE_UNAVAILABLE: 'Recorder enrollment storage is temporarily unavailable. Try again.',
  PLAUD_OPERATION_NOT_FOUND: 'This recorder enrollment is unavailable for your account.',
  PLAUD_ENROLLMENT_INACTIVE:
    'This recorder enrollment is no longer active. Ask your administrator for an invitation.',
  PLAUD_RECORDER_REASSIGNED:
    'This recorder has been reassigned. Contact your administrator before unpairing.',
  PLAUD_PROVIDER_UNAVAILABLE: 'Plaud could not complete the device request. Try again.',
  PLAUD_PROVIDER_INVALID_RESPONSE: 'Plaud returned an unexpected device response. Try again.',
  INVALID_INPUT: 'A valid recorder enrollment is required.',
  INVALID_REQUEST: 'A valid recorder enrollment is required.',
};
/** SDK tokens are returned to the caller only; this client does not cache or persist sessions. */
export function createPlaudDeviceClient({
  baseUrl,
  developmentHttpOrigin,
  getCredential,
  fetch: transport = globalThis.fetch,
  timeoutMs = 45000,
}: ApiClientOptions): PlaudDeviceClient {
  const base = apiBase(baseUrl, developmentHttpOrigin);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000)
    throw new ApiError(
      0,
      'INVALID_CONFIGURATION',
      'The request timeout is not configured correctly.',
    );
  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    operationId?: string,
    options: RequestOptions = {},
  ): Promise<T> {
    if (options.signal?.aborted) throw new ApiError(0, 'CANCELLED', 'The request was cancelled.');
    const publicRequest = path === '/v1/plaud/capabilities';
    const parsedInput = publicRequest
      ? undefined
      : plaudDeviceOperationRequestSchema.safeParse({ operationId });
    if (parsedInput && !parsedInput.success)
      throw new ApiError(0, 'INVALID_INPUT', messages.INVALID_INPUT!);
    const credential = publicRequest ? undefined : getCredential();
    if (!publicRequest && !credential)
      throw new ApiError(401, 'UNAUTHORIZED', messages.UNAUTHORIZED!);
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
    options.signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      cancel();
    }, timeoutMs);
    try {
      return await Promise.race([
        stopped,
        (async () => {
          const response = await transport(`${base}${path}`, {
            method: publicRequest ? 'GET' : 'POST',
            headers: {
              ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
              ...(publicRequest ? {} : { 'Content-Type': 'application/json' }),
            },
            ...(parsedInput?.success ? { body: JSON.stringify(parsedInput.data) } : {}),
            credentials: 'omit',
            redirect: 'error',
            cache: 'no-store',
            signal: controller.signal,
          });
          if (controller.signal.aborted) {
            void response.body?.cancel().catch(() => {});
            throw Error('cancelled');
          }
          if (response.redirected)
            throw new ApiError(
              0,
              'INVALID_RESPONSE',
              'The service returned an unexpected response.',
            );
          if (!response.ok) {
            let code = response.status === 401 ? 'UNAUTHORIZED' : 'REQUEST_FAILED';
            try {
              const failure = z
                .object({ error: z.object({ code: z.string() }) })
                .safeParse(await response.json());
              if (failure.success && Object.hasOwn(messages, failure.data.error.code))
                code = failure.data.error.code;
            } catch {
              /* Never expose raw server messages. */
            }
            throw new ApiError(
              response.status,
              code,
              messages[code] ?? 'The service could not complete this request. Try again.',
            );
          }
          let raw: unknown;
          try {
            raw = await response.json();
          } catch {
            throw new ApiError(
              0,
              'INVALID_RESPONSE',
              'The service returned an unexpected response.',
            );
          }
          if (controller.signal.aborted) throw Error('cancelled');
          const parsed = schema.safeParse(raw);
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
      if (timedOut)
        throw new ApiError(
          0,
          'TIMEOUT',
          'The device request took too long. Check the connection before trying again.',
        );
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
  return {
    capabilities: (options) =>
      request('/v1/plaud/capabilities', plaudDeviceCapabilitiesSchema, undefined, options),
    session: (operationId, options) =>
      request('/v1/plaud/device-session', plaudDeviceSessionSchema, operationId, options),
    bind: (operationId, options) =>
      request('/v1/plaud/device-bind', plaudDeviceBindSchema, operationId, options),
    unbind: (operationId, options) =>
      request('/v1/plaud/device-unbind', plaudDeviceUnbindSchema, operationId, options),
  };
}
