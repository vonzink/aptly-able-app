import { describe, expect, it } from 'vitest';

import type { ApiClient } from '@aptly/api-client';
import type { EnrollmentPreview, SessionResponse, SetupOperation } from '@aptly/contracts';

import {
  createEnrollmentController,
  type EnrollmentJournal,
  type EnrollmentJournalStore,
} from '../src/features/enrollment/enrollment-controller';

const token = 'Abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE';
const actorA = '11111111-1111-4111-8111-111111111111';
const actorB = '22222222-2222-4222-8222-222222222222';
const assignmentId = '33333333-3333-4333-8333-333333333333';
const recorderId = '44444444-4444-4444-8444-444444444444';
const operationId = '55555555-5555-4555-8555-555555555555';
const key = '66666666-6666-4666-8666-666666666666';

const preview: EnrollmentPreview = {
  assignmentId,
  recorder: { id: recorderId, model: 'notepro', serialSuffix: '7331' },
  expiresAt: '2026-09-11T12:00:00.000Z',
};
const operation: SetupOperation = {
  id: operationId,
  assignmentId,
  status: 'pending',
  createdAt: '2026-09-10T12:00:00.000Z',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

function journal(
  initial: EnrollmentJournal | null = null,
): EnrollmentJournalStore & { value: EnrollmentJournal | null } {
  return {
    value: initial,
    async load() {
      return this.value;
    },
    async save(value) {
      this.value = value;
    },
    async clear() {
      this.value = null;
    },
  };
}

function fakeClient(overrides: Partial<ApiClient> = {}): ApiClient {
  const unused = async () => {
    throw new Error('unexpected API call');
  };
  return {
    session: async (): Promise<SessionResponse> => ({
      user: { id: actorA, role: 'user' },
      mode: 'development',
    }),
    resolveEnrollment: async () => preview,
    claimEnrollment: async () => operation,
    getClaimOperation: async () => operation,
    getOperation: async () => operation,
    adminUsers: unused,
    adminAssignments: unused,
    adminAssignment: unused,
    createAssignment: unused,
    issueInvitation: unused,
    revokeInvitation: unused,
    endAssignment: unused,
    ...overrides,
  } as ApiClient;
}

function setup(client = fakeClient(), store = journal()) {
  let credential: string | undefined;
  const controller = createEnrollmentController({
    client,
    journal: store,
    createIdempotencyKey: () => key,
    credentials: { set: (value) => (credential = value), clear: () => (credential = undefined) },
  });
  return { controller, store, credential: () => credential };
}

describe('enrollment controller', () => {
  it('saves the actor and idempotency key before claiming and reuses that key after response loss', async () => {
    const store = journal();
    const keys: string[] = [];
    let attempts = 0;
    const { controller } = setup(
      fakeClient({
        claimEnrollment: async (_token, claimKey) => {
          keys.push(claimKey);
          attempts += 1;
          if (attempts === 1) throw new Error('response lost');
          return operation;
        },
      }),
      store,
    );
    controller.receiveInvitation(token);
    await controller.signIn('local-user-code');

    await controller.claim();
    expect(store.value).toEqual({ actorId: actorA, key });
    await controller.claim();

    expect(keys).toEqual([key, key]);
    expect(controller.getSnapshot().phase).toBe('saved');
    expect(store.value).toEqual({ actorId: actorA, key, operationId });
  });

  it('resumes a committed operation after restart without an invitation token', async () => {
    const store = journal({ actorId: actorA, key });
    const { controller } = setup(fakeClient(), store);
    await controller.initialize();
    await controller.signIn('local-user-code');

    expect(controller.getSnapshot().phase).toBe('saved');
    expect(controller.getSnapshot().operation?.id).toBe(operationId);
  });

  it('preserves restart recovery when the original invitation opens before sign-in', async () => {
    const store = journal({ actorId: actorA, key });
    const { controller } = setup(fakeClient(), store);
    await controller.initialize();
    controller.receiveInvitation(token);
    await controller.signIn('local-user-code');

    expect(controller.getSnapshot().phase).toBe('saved');
    expect(store.value).toEqual({ actorId: actorA, key, operationId });
  });

  it('preserves recovery when the launch invitation arrives before journal loading finishes', async () => {
    const loading = deferred<EnrollmentJournal | null>();
    const store = journal();
    store.load = () => loading.promise;
    const { controller } = setup(fakeClient(), store);
    const initializing = controller.initialize();
    controller.receiveInvitation(token);
    loading.resolve({ actorId: actorA, key });
    await initializing;
    await controller.signIn('local-user-code');

    expect(controller.getSnapshot().phase).toBe('saved');
    expect(controller.getSnapshot().operation?.id).toBe(operationId);
  });

  it('clears another actor journal and does not reveal its operation', async () => {
    const store = journal({ actorId: actorB, key, operationId });
    const { controller } = setup(fakeClient(), store);
    await controller.initialize();
    await controller.signIn('local-user-code');

    expect(store.value).toBeNull();
    expect(controller.getSnapshot().operation).toBeNull();
    expect(controller.getSnapshot().phase).toBe('needs-invitation');
  });

  it('reports a revoked saved enrollment after refresh', async () => {
    const revoked = { ...operation, status: 'revoked' as const };
    const { controller } = setup(
      fakeClient({ getOperation: async () => revoked }),
      journal({ actorId: actorA, key, operationId }),
    );
    await controller.initialize();
    await controller.signIn('local-user-code');
    await controller.refresh();
    expect(controller.getSnapshot().phase).toBe('revoked');
  });

  it('explicitly clears a revoked operation before accepting a new invitation', async () => {
    const revoked = { ...operation, status: 'revoked' as const };
    const store = journal({ actorId: actorA, key, operationId });
    const { controller } = setup(fakeClient({ getOperation: async () => revoked }), store);
    await controller.initialize();
    await controller.signIn('local-user-code');

    await controller.startNewInvitation();
    expect(controller.getSnapshot().phase).toBe('needs-invitation');
    expect(controller.getSnapshot().operation).toBeNull();
    expect(store.value).toBeNull();

    controller.receiveInvitation('Zbcdefghijklmnopqrstuvwxyz0123456789_-ABCDE');
    await controller.resolveInvitation();
    expect(controller.getSnapshot().phase).toBe('ready');
  });

  it('ignores a late sign-in response after sign-out', async () => {
    const pending = deferred<SessionResponse>();
    const { controller, credential } = setup(fakeClient({ session: () => pending.promise }));
    controller.receiveInvitation(token);
    const signingIn = controller.signIn('local-user-code');
    await controller.signOut();
    pending.resolve({ user: { id: actorA, role: 'user' }, mode: 'development' });
    await signingIn;

    expect(controller.getSnapshot().phase).toBe('signed-out');
    expect(credential()).toBeUndefined();
  });

  it('does not cancel sign-in when the web router repeats the same invitation', async () => {
    const pending = deferred<SessionResponse>();
    const { controller } = setup(fakeClient({ session: () => pending.promise }));
    controller.receiveInvitation(token);
    const signingIn = controller.signIn('local-user-code');
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.receiveInvitation(token);
    pending.resolve({ user: { id: actorA, role: 'user' }, mode: 'development' });
    await signingIn;

    expect(controller.getSnapshot().phase).toBe('ready');
  });

  it('cancels the active request when the user signs out', async () => {
    const pending = deferred<SessionResponse>();
    let signal: AbortSignal | undefined;
    const { controller } = setup(
      fakeClient({
        session: (options) => {
          signal = options?.signal;
          return pending.promise;
        },
      }),
    );
    void controller.signIn('local-user-code');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await controller.signOut();

    expect(signal?.aborted).toBe(true);
    pending.resolve({ user: { id: actorA, role: 'user' }, mode: 'development' });
  });

  it('allows only one claim while a claim is in flight', async () => {
    const pending = deferred<SetupOperation>();
    let calls = 0;
    const { controller } = setup(
      fakeClient({
        claimEnrollment: () => {
          calls += 1;
          return pending.promise;
        },
      }),
    );
    controller.receiveInvitation(token);
    await controller.signIn('local-user-code');
    const first = controller.claim();
    const second = controller.claim();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toBe(1);
    pending.resolve(operation);
    await Promise.all([first, second]);
  });

  it('changing invitations clears stale preview and safely resolves the new invitation', async () => {
    const secondToken = 'Zbcdefghijklmnopqrstuvwxyz0123456789_-ABCDE';
    const { controller } = setup();
    controller.receiveInvitation(token);
    await controller.signIn('local-user-code');
    expect(controller.getSnapshot().preview?.recorder.serialSuffix).toBe('7331');

    controller.receiveInvitation(secondToken);
    expect(controller.getSnapshot().preview).toBeNull();
    await controller.resolveInvitation();
    expect(controller.getSnapshot().phase).toBe('ready');
  });

  it('does not let a slow old journal clear erase a newly saved claim key', async () => {
    const clearing = deferred<void>();
    const store = journal();
    store.clear = async () => {
      await clearing.promise;
      store.value = null;
    };
    const { controller } = setup(
      fakeClient({
        claimEnrollment: async () => {
          throw new Error('response lost');
        },
      }),
      store,
    );
    controller.receiveInvitation(token);
    await controller.signIn('local-user-code');
    const claiming = controller.claim();
    await Promise.resolve();
    clearing.resolve();
    await claiming;

    expect(store.value).toEqual({ actorId: actorA, key });
  });

  it('does not start a claim after sign-out occurs during journal storage', async () => {
    const saving = deferred<void>();
    const store = journal();
    let claimCalls = 0;
    store.save = async (value) => {
      store.value = value;
      await saving.promise;
    };
    const { controller } = setup(
      fakeClient({
        claimEnrollment: async () => {
          claimCalls += 1;
          return operation;
        },
      }),
      store,
    );
    controller.receiveInvitation(token);
    await controller.signIn('local-user-code');
    const claiming = controller.claim();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const signingOut = controller.signOut();
    saving.resolve();
    await Promise.all([claiming, signingOut]);

    expect(claimCalls).toBe(0);
    expect(store.value).toBeNull();
    expect(controller.getSnapshot().phase).toBe('signed-out');
  });

  it('does not claim a replacement invitation with the prior invitation key', async () => {
    const saving = deferred<void>();
    const store = journal();
    const claimedTokens: string[] = [];
    store.save = async (value) => {
      store.value = value;
      await saving.promise;
    };
    const { controller } = setup(
      fakeClient({
        claimEnrollment: async (claimedToken) => {
          claimedTokens.push(claimedToken);
          return operation;
        },
      }),
      store,
    );
    controller.receiveInvitation(token);
    await controller.signIn('local-user-code');
    const oldClaim = controller.claim();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const replacement = 'Zbcdefghijklmnopqrstuvwxyz0123456789_-ABCDE';
    controller.receiveInvitation(replacement);
    saving.resolve();
    await oldClaim;
    await controller.resolveInvitation();

    expect(claimedTokens).toEqual([]);
    expect(controller.getSnapshot().phase).toBe('ready');
  });

  it('ignores an old claim response that completes after switching invitations', async () => {
    const pending = deferred<SetupOperation>();
    const store = journal();
    const { controller } = setup(fakeClient({ claimEnrollment: () => pending.promise }), store);
    controller.receiveInvitation(token);
    await controller.signIn('local-user-code');
    const oldClaim = controller.claim();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const replacement = 'Zbcdefghijklmnopqrstuvwxyz0123456789_-ABCDE';
    controller.receiveInvitation(replacement);
    pending.resolve(operation);
    await oldClaim;
    await controller.resolveInvitation();

    expect(controller.getSnapshot().phase).toBe('ready');
    expect(controller.getSnapshot().operation).toBeNull();
    expect(store.value).toBeNull();
  });

  it('retries a saved-operation refresh after a temporary failure', async () => {
    let attempts = 0;
    const { controller } = setup(
      fakeClient({
        getOperation: async () => {
          attempts += 1;
          if (attempts === 2)
            throw new Error('Cannot reach the service. Check your connection and try again.');
          return operation;
        },
      }),
      journal({ actorId: actorA, key, operationId }),
    );
    await controller.initialize();
    await controller.signIn('local-user-code');

    await controller.refresh();
    expect(controller.getSnapshot().phase).toBe('error');
    expect(controller.getSnapshot().operation?.id).toBe(operationId);
    await controller.refresh();
    expect(controller.getSnapshot().phase).toBe('saved');
  });

  it('retries initial operation recovery after a temporary failure', async () => {
    let attempts = 0;
    const { controller } = setup(
      fakeClient({
        getOperation: async () => {
          attempts += 1;
          if (attempts === 1)
            throw new Error('Cannot reach the service. Check your connection and try again.');
          return operation;
        },
      }),
      journal({ actorId: actorA, key, operationId }),
    );
    await controller.initialize();
    await controller.signIn('local-user-code');
    expect(controller.getSnapshot().phase).toBe('recovery-error');

    await controller.retryRecovery();
    expect(controller.getSnapshot().phase).toBe('saved');
    expect(controller.getSnapshot().operation?.id).toBe(operationId);
  });

  it('resolves the retained invitation when retry recovery finds no committed claim', async () => {
    let attempts = 0;
    const store = journal({ actorId: actorA, key });
    const { controller } = setup(
      fakeClient({
        getClaimOperation: async () => {
          attempts += 1;
          if (attempts === 1)
            throw new Error('Cannot reach the service. Check your connection and try again.');
          throw { status: 404, message: 'Not found' };
        },
      }),
      store,
    );
    await controller.initialize();
    controller.receiveInvitation(token);
    await controller.signIn('local-user-code');
    expect(controller.getSnapshot().phase).toBe('recovery-error');

    await controller.retryRecovery();

    expect(controller.getSnapshot().phase).toBe('ready');
    expect(controller.getSnapshot().preview?.recorder.serialSuffix).toBe('7331');
    expect(store.value).toBeNull();
  });

  it('publishes sign-out immediately and does not overwrite a newer sign-in after delayed clear', async () => {
    const clearing = deferred<void>();
    const store = journal({ actorId: actorA, key, operationId });
    store.clear = async () => {
      await clearing.promise;
      store.value = null;
    };
    const { controller } = setup(fakeClient(), store);
    await controller.initialize();
    const signingOut = controller.signOut();
    expect(controller.getSnapshot().phase).toBe('signed-out');
    const signingIn = controller.signIn('local-user-code');
    clearing.resolve();
    await Promise.all([signingOut, signingIn]);

    expect(controller.getSnapshot().phase).toBe('needs-invitation');
    expect(controller.getSnapshot().actorId).toBe(actorA);
  });
});
