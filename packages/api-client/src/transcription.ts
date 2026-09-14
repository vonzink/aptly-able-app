import { z } from 'zod';
import {
  processingRecordingSchema,
  registerRecordingSchema,
  retryTranscriptionSchema,
  transcriptionCapabilitiesSchema,
  type ProcessingRecording,
  type RegisterRecordingInput,
  type TranscriptionCapabilities,
} from '@aptly/contracts';
import { ApiError } from './api-error.js';
import { apiBase } from './api-base.js';
import type { ApiClientOptions, RequestOptions } from './types.js';

export type UploadRequestOptions = RequestOptions & { fetch?: typeof fetch };
export interface TranscriptionClient {
  capabilities(options?: RequestOptions): Promise<TranscriptionCapabilities>;
  get(id: string, options?: RequestOptions): Promise<ProcessingRecording>;
  register(input: RegisterRecordingInput, options?: RequestOptions): Promise<ProcessingRecording>;
  upload(id: string, body: BodyInit, options?: UploadRequestOptions): Promise<ProcessingRecording>;
  retry(
    id: string,
    acknowledgeDuplicateRisk?: boolean,
    options?: RequestOptions,
  ): Promise<ProcessingRecording>;
}

const messages: Record<string, string> = {
  UNAUTHORIZED: 'Your access code was not accepted. Sign in again.',
  FORBIDDEN: 'This account does not have access to this recording.',
  RECORDING_NOT_FOUND: 'No uploaded copy was found for this recording.',
  RECORDING_CONFLICT: 'This recording has changed on the server. Check its status and try again.',
  TRANSCRIPTION_NOT_CONFIGURED: 'Automatic transcription is not configured on this server yet.',
  RETRY_CONFIRMATION_REQUIRED:
    'Confirm that you want a new transcription request, which may duplicate an earlier request.',
  INVALID_AUDIO: 'The audio upload was not accepted. Try uploading the saved audio again.',
  TRANSCRIPTION_UNAVAILABLE: 'The transcription service is temporarily unavailable. Try again.',
  INVALID_INPUT: 'Check the recording details and try again.',
  INVALID_REQUEST: 'Check the recording details and try again.',
};

export function createTranscriptionClient({
  baseUrl,
  developmentHttpOrigin,
  getCredential,
  fetch: fetcher = globalThis.fetch,
  timeoutMs = 10000,
}: ApiClientOptions): TranscriptionClient {
  const base = apiBase(baseUrl, developmentHttpOrigin);
  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    body: BodyInit | undefined,
    options: UploadRequestOptions = {},
    audio = false,
    publicRequest = false,
  ): Promise<T> {
    if (options.signal?.aborted) throw new ApiError(0, 'CANCELLED', 'The request was cancelled.');
    const credential = publicRequest ? undefined : getCredential();
    if (!publicRequest && !credential)
      throw new ApiError(401, 'UNAUTHORIZED', messages.UNAUTHORIZED!);
    const abort = new AbortController();
    let timedOut = false;
    const cancel = () => abort.abort();
    options.signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(
      () => {
        timedOut = true;
        abort.abort();
      },
      audio ? Math.max(timeoutMs, 120000) : timeoutMs,
    );
    try {
      const response = await (options.fetch ?? fetcher)(`${base}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
          ...(body === undefined
            ? {}
            : { 'Content-Type': audio ? 'application/octet-stream' : 'application/json' }),
        },
        ...(body === undefined ? {} : { body }),
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        signal: abort.signal,
      });
      if (abort.signal.aborted) throw Error('aborted');
      if (!response.ok) {
        let code = response.status === 401 ? 'UNAUTHORIZED' : 'REQUEST_FAILED';
        try {
          const failure = z
            .object({ error: z.object({ code: z.string() }) })
            .safeParse(await response.json());
          if (failure.success && Object.hasOwn(messages, failure.data.error.code))
            code = failure.data.error.code;
        } catch {
          /* Server text is never exposed. */
        }
        throw new ApiError(
          response.status,
          code,
          messages[code] ?? 'The service could not complete this request. Try again.',
        );
      }
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new ApiError(
          0,
          'INVALID_RESPONSE',
          'The service returned an unexpected response. Try again.',
        );
      }
      if (abort.signal.aborted) throw Error('aborted');
      const parsed = schema.safeParse(data);
      if (!parsed.success)
        throw new ApiError(
          0,
          'INVALID_RESPONSE',
          'The service returned an unexpected response. Try again.',
        );
      return parsed.data;
    } catch (error) {
      if (timedOut)
        throw new ApiError(
          0,
          'TIMEOUT',
          'The request took too long. Check the recording status before trying again.',
        );
      if (abort.signal.aborted) throw new ApiError(0, 'CANCELLED', 'The request was cancelled.');
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
  function valid<T>(schema: z.ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new ApiError(0, 'INVALID_INPUT', messages.INVALID_INPUT!);
    return parsed.data;
  }
  const recordingPath = (id: string) => `/v1/recordings/${encodeURIComponent(valid(z.uuid(), id))}`;
  return {
    capabilities: (options) =>
      request(
        '/v1/transcription/capabilities',
        transcriptionCapabilitiesSchema,
        undefined,
        options,
        false,
        true,
      ),
    get: async (id, options) =>
      request(recordingPath(id), processingRecordingSchema, undefined, options),
    register: async (input, options) =>
      request(
        '/v1/recordings',
        processingRecordingSchema,
        JSON.stringify(valid(registerRecordingSchema, input)),
        options,
      ),
    upload: async (id, body, options) =>
      request(`${recordingPath(id)}/audio`, processingRecordingSchema, body, options, true),
    retry: async (id, acknowledgeDuplicateRisk = false, options) =>
      request(
        `${recordingPath(id)}/retry`,
        processingRecordingSchema,
        JSON.stringify(valid(retryTranscriptionSchema, { acknowledgeDuplicateRisk })),
        options,
      ),
  };
}
