import type { z } from 'zod';
import type {
  AdminAssignment,
  AccountRecorder,
  AccountRecorders,
  RecorderSetupInput,
  RecorderAssignment,
  CreateAssignmentInput,
  EnrollmentInvitation,
  EnrollmentPreview,
  SetupOperation,
  SessionResponse,
  adminAssignmentsResponseSchema,
  adminUsersResponseSchema,
} from '@aptly/contracts';

export type RequestOptions = { signal?: AbortSignal };
export interface ApiClient {
  myRecorders(options?: RequestOptions): Promise<AccountRecorders>;
  addMyRecorder(input: RecorderSetupInput, options?: RequestOptions): Promise<AccountRecorder>;
  beginRecorderSetup(assignmentId: string, options?: RequestOptions): Promise<SetupOperation>;
  session(options?: RequestOptions): Promise<SessionResponse>;
  adminUsers(
    page?: number,
    options?: RequestOptions,
  ): Promise<z.infer<typeof adminUsersResponseSchema>>;
  adminAssignments(
    page?: number,
    options?: RequestOptions,
  ): Promise<z.infer<typeof adminAssignmentsResponseSchema>>;
  adminAssignment(id: string, options?: RequestOptions): Promise<AdminAssignment>;
  createAssignment(
    input: CreateAssignmentInput,
    options?: RequestOptions,
  ): Promise<RecorderAssignment>;
  issueInvitation(
    assignmentId: string,
    expiresInSeconds?: number,
    options?: RequestOptions & { platform?: 'android' | 'ios' },
  ): Promise<EnrollmentInvitation>;
  revokeInvitation(tokenId: string, options?: RequestOptions): Promise<void>;
  endAssignment(
    assignmentId: string,
    status: 'released' | 'revoked',
    options?: RequestOptions,
  ): Promise<RecorderAssignment>;
  resolveEnrollment(token: string, options?: RequestOptions): Promise<EnrollmentPreview>;
  claimEnrollment(
    token: string,
    idempotencyKey: string,
    options?: RequestOptions,
  ): Promise<SetupOperation>;
  getClaimOperation(idempotencyKey: string, options?: RequestOptions): Promise<SetupOperation>;
  getOperation(id: string, options?: RequestOptions): Promise<SetupOperation>;
}
export type ApiClientOptions = {
  workspace?: 'self';
  baseUrl: string;
  /** Opt-in for a specific private HTTP origin during phone development. Omit in release builds. */
  developmentHttpOrigin?: string;
  getCredential: () => string | undefined;
  fetch?: typeof fetch;
  timeoutMs?: number;
};
