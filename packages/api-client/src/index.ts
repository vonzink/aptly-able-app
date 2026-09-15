import { z } from 'zod';
import {
  adminAssignmentSchema,
  adminAssignmentsResponseSchema,
  adminUsersResponseSchema,
  assignmentSchema,
  enrollmentInvitationSchema,
  enrollmentPreviewSchema,
  sessionResponseSchema,
  setupOperationSchema,
} from '@aptly/contracts';
import type { ApiClient, ApiClientOptions, RequestOptions } from './types.js';
import { ApiError } from './api-error.js';
import { apiBase } from './api-base.js';
export { ApiError } from './api-error.js';
export type { ApiClient, ApiClientOptions, RequestOptions } from './types.js';
export { createTranscriptionClient } from './transcription.js';
export type { TranscriptionClient, UploadRequestOptions } from './transcription.js';

const messages: Record<string, string> = {
  UNAUTHORIZED: 'Your access code was not accepted. Sign in again.',
  FORBIDDEN: 'This account does not have access to this action.',
  ENROLLMENT_UNAVAILABLE:
    'This invitation is unavailable for your account. Ask your administrator for a new invitation.',
  ASSIGNMENT_CONFLICT:
    'This recorder is already assigned or its assignment has changed. Refresh and try again.',
  IDEMPOTENCY_CONFLICT:
    'This setup attempt belongs to a different invitation. Open your latest invitation.',
  ENROLLMENT_NOT_CONFIGURED: 'Enrollment links are not configured yet.',
  NOT_FOUND: 'This record is no longer available. Refresh and try again.',
  USER_NOT_FOUND: 'This person is no longer available. Refresh and choose again.',
  INVALID_REQUEST: 'Check the details and try again.',
  INVALID_INPUT: 'Check the details and try again.',
};
export function createApiClient({
  baseUrl,
  workspace,
  developmentHttpOrigin,
  getCredential,
  fetch: fetcher = globalThis.fetch,
  timeoutMs = 10000,
}: ApiClientOptions): ApiClient {
  const base = apiBase(baseUrl, developmentHttpOrigin);
  const workspacePath = workspace === 'self' ? '/v1/workspace' : '/v1/admin';
  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    body: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    const credential = getCredential();
    if (!credential) throw new ApiError(401, 'UNAUTHORIZED', messages.UNAUTHORIZED!);
    const controller = new AbortController();
    let timeout = false;
    const abort = () => controller.abort();
    if (options.signal?.aborted) throw new ApiError(0, 'CANCELLED', 'The request was cancelled.');
    options.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => {
      timeout = true;
      controller.abort();
    }, timeoutMs);
    try {
      const response = await fetcher(`${base}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) {
        let code = response.status === 401 ? 'UNAUTHORIZED' : 'REQUEST_FAILED';
        try {
          const failure = z
            .object({ error: z.object({ code: z.string() }) })
            .safeParse(await response.json());
          if (failure.success && failure.data.error.code in messages)
            code = failure.data.error.code;
        } catch {
          /* Never expose response text, upstream errors or credentials. */
        }
        throw new ApiError(
          response.status,
          code,
          messages[code] ?? 'The service could not complete this request. Try again.',
        );
      }
      const parsed = schema.safeParse(response.status === 204 ? undefined : await response.json());
      if (!parsed.success)
        throw new ApiError(
          0,
          'INVALID_RESPONSE',
          'The service returned an unexpected response. Try again.',
        );
      return parsed.data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (timeout) throw new ApiError(0, 'TIMEOUT', 'The request took too long. Try again.');
      if (controller.signal.aborted)
        throw new ApiError(0, 'CANCELLED', 'The request was cancelled.');
      throw new ApiError(
        0,
        'NETWORK_ERROR',
        'Cannot reach the service. Check your connection and try again.',
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  }
  const id = (value: string) => encodeURIComponent(z.uuid().parse(value));
  const pageNumber = (value: number) => z.number().int().min(1).max(100000).parse(value);
  return {
    session: (options) => request('/v1/session', sessionResponseSchema, undefined, options),
    adminUsers: (page = 1, options) =>
      request(
        `${workspacePath}/users?page=${pageNumber(page)}`,
        adminUsersResponseSchema,
        undefined,
        options,
      ),
    adminAssignments: (page = 1, options) =>
      request(
        `${workspacePath}/recorder-assignments?page=${pageNumber(page)}`,
        adminAssignmentsResponseSchema,
        undefined,
        options,
      ),
    adminAssignment: (assignmentId, options) =>
      request(
        `${workspacePath}/recorder-assignments/${id(assignmentId)}`,
        adminAssignmentSchema,
        undefined,
        options,
      ),
    createAssignment: (body, options) =>
      request(`${workspacePath}/recorder-assignments`, assignmentSchema, body, options),
    issueInvitation: (assignmentId, expiresInSeconds = 86400, options) =>
      request(
        `${workspacePath}/recorder-assignments/${id(assignmentId)}/enrollment-tokens`,
        enrollmentInvitationSchema,
        { expiresInSeconds, ...(options?.platform ? { platform: options.platform } : {}) },
        options,
      ),
    revokeInvitation: (tokenId, options) =>
      request(
        `${workspacePath}/enrollment-tokens/${id(tokenId)}/revoke`,
        z.undefined(),
        {},
        options,
      ),
    endAssignment: (assignmentId, status, options) =>
      request(
        `${workspacePath}/recorder-assignments/${id(assignmentId)}/end`,
        assignmentSchema,
        { status },
        options,
      ),
    resolveEnrollment: (token, options) =>
      request('/v1/enrollments/resolve', enrollmentPreviewSchema, { token }, options),
    claimEnrollment: (token, idempotencyKey, options) =>
      request('/v1/enrollments/claim', setupOperationSchema, { token, idempotencyKey }, options),
    getClaimOperation: (key, options) =>
      request(`/v1/enrollments/claims/${id(key)}`, setupOperationSchema, undefined, options),
    getOperation: (operationId, options) =>
      request(
        `/v1/enrollments/operations/${id(operationId)}`,
        setupOperationSchema,
        undefined,
        options,
      ),
  };
}

export { createPlaudDeviceClient, type PlaudDeviceClient } from './plaud-device.js';

export { createAuthClient, type AuthClient } from './auth.js';

export {
  createSessionController,
  type SessionController,
  type SessionSnapshot,
  type SignInDetails,
} from './session/controller.js';
export {
  createSessionStore,
  createBrowserSessionStore,
  type SessionStore,
  type SessionStorageDriver,
} from './session/store.js';

export * from './account.js';
