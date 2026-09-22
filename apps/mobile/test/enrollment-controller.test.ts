import { describe, expect, it } from 'vitest';

import {
  createSessionController,
  createSessionStore,
  type ApiClient,
  type SessionStore,
} from '@aptly/api-client';
import type { EnrollmentPreview, SessionResponse, SetupOperation } from '@aptly/contracts';

import {
  createEnrollmentController,
  type EnrollmentJournal,
  type EnrollmentJournalStore,
} from '../src/features/enrollment/enrollment-controller';
import { attachEnrollmentLinks } from '../src/features/enrollment/enrollment-link-intake';

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
    myRecorders: async () => ({ recorders: [], canAdd: true }),
    addMyRecorder: unused,
    beginRecorderSetup: unused,
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

function setup(client = fakeClient(), store = journal(), sessions?: SessionStore) {
  const authentication = createSessionController({
    store:
      sessions ??
      createSessionStore(
        { read: async () => null, write: async () => {}, remove: async () => {} },
        'https://api.example.test',
        'pilot',
      ),
    verify: (_credential, options) => client.session(options),
    revoke: async () => {},
  });
  const controller = createEnrollmentController({
    client,
    journal: store,
    createIdempotencyKey: () => key,
    authentication,
  });
  return { controller, authentication, store, credential: authentication.getCredential };
}

describe('enrollment controller', () => {
  it('does not begin revoked setup or allow self-add for a managed account', async () => {
    const recorder = {
      assignmentId,
      recorder: preview.recorder,
      operation: { ...operation, status: 'revoked' as const },
      setupBlocked: true,
    };
    let mutations = 0;
    const { controller } = setup(
      fakeClient({
        myRecorders: async () => ({ recorders: [recorder], canAdd: false }),
        beginRecorderSetup: async () => {
          mutations++;
          return operation;
        },
        addMyRecorder: async () => {
          mutations++;
          return recorder;
        },
      }),
    );
    await controller.signIn('local-access');
    await controller.selectRecorder(assignmentId);
    await controller.addRecorder({ model: 'notepro', serial: '8810007331' });
    expect(mutations).toBe(0);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'choosing-recorder', operation: null });
  });

  it('keeps a network failure retryable and offers invitations only for an older API', async () => {
    let status = 503;
    const { controller } = setup(
      fakeClient({
        myRecorders: async () => {
          throw { status };
        },
      }),
    );
    await controller.signIn('local-access');
    expect(controller.getSnapshot().phase).toBe('account-error');
    status = 404;
    await controller.loadRecorders();
    expect(controller.getSnapshot().phase).toBe('needs-invitation');
  });

  it('coalesces repeated continue taps and waits for durable setup storage', async () => {
    const response = deferred<SetupOperation>();
    const recorder = {
      assignmentId,
      recorder: preview.recorder,
      operation: null,
      setupBlocked: false,
    };
    let begins = 0;
    const store = journal();
    store.save = async () => {
      throw new Error('secure storage unavailable');
    };
    const { controller } = setup(
      fakeClient({
        myRecorders: async () => ({ recorders: [recorder], canAdd: true }),
        beginRecorderSetup: () => {
          begins++;
          return response.promise;
        },
      }),
      store,
    );
    await controller.signIn('local-access');
    const first = controller.selectRecorder(assignmentId);
    const second = controller.selectRecorder(assignmentId);
    expect(first).toBe(second);
    response.resolve(operation);
    await first;
    expect(begins).toBe(1);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'choosing-recorder', operation: null });
  });

  it('finds an assigned recorder after sign-in without an invitation', async () => {
    const recorder = {
      assignmentId,
      recorder: preview.recorder,
      operation: null,
      setupBlocked: false,
    };
    const { controller } = setup(
      fakeClient({ myRecorders: async () => ({ recorders: [recorder], canAdd: true }) }),
    );
    await controller.signIn('local-access');
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'choosing-recorder',
      recorders: [recorder],
      canAddRecorder: true,
    });
  });

  it('restores an existing account setup on a fresh installation', async () => {
    const { controller, store } = setup(
      fakeClient({
        myRecorders: async () => ({
          recorders: [{ assignmentId, recorder: preview.recorder, operation, setupBlocked: false }],
          canAdd: false,
        }),
      }),
    );
    await controller.signIn('local-access');
    expect(controller.getSnapshot()).toMatchObject({ phase: 'saved', operation });
    expect(store.value?.operationId).toBe(operationId);
  });

  it('never restores a late lookup after sign-out', async () => {
    const pending = deferred<{ recorders: never[]; canAdd: boolean }>();
    const { controller } = setup(fakeClient({ myRecorders: () => pending.promise }));
    const signingIn = controller.signIn('local-access');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await controller.signOut();
    pending.resolve({ recorders: [], canAdd: true });
    await signingIn;
    expect(controller.getSnapshot()).toMatchObject({ phase: 'signed-out', recorders: [] });
  });

  it('preserves a created recorder when the next setup request fails, so it can be retried', async () => {
    const recorder = {
      assignmentId,
      recorder: preview.recorder,
      operation: null,
      setupBlocked: false,
    };
    let attempts = 0;
    const { controller } = setup(
      fakeClient({
        myRecorders: async () => ({ recorders: [], canAdd: true }),
        addMyRecorder: async () => recorder,
        beginRecorderSetup: async () => {
          if (++attempts === 1) throw new Error('offline');
          return operation;
        },
      }),
    );
    await controller.signIn('local-access');
    await controller.addRecorder({ model: 'notepro', serial: '8810007331' });
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'choosing-recorder',
      recorders: [recorder],
    });
    await controller.selectRecorder(assignmentId);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'choosing-recorder', operation: null });
    await controller.selectRecorder(assignmentId);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'saved', operation });
  });

  it('accepts a setup link before the enrollment screen opens and retains it through sign-in', async () => {
    const resolved: string[] = [];
    const { controller } = setup(
      fakeClient({
        resolveEnrollment: async (value) => {
          resolved.push(value);
          return preview;
        },
      }),
    );
    let deliver!: (url: string) => void;
    const detach = attachEnrollmentLinks(controller, {
      initial: async () => null,
      subscribe: (listener) => {
        deliver = listener;
        return () => {};
      },
    });
    expect(deliver).toBeTypeOf('function');
    deliver(`aptlyable://enroll#token=${'A'.repeat(43)}`);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'signed-out', hasInvitation: true });
    await controller.signIn('local-access');
    expect(controller.getSnapshot().phase).toBe('ready');
    expect(resolved).toEqual(['A'.repeat(43)]);
    detach();
  });

  it('prefers a new setup link over a delayed launch link and ignores unrelated URLs', async () => {
    const resolved: string[] = [];
    const { controller } = setup(
      fakeClient({
        resolveEnrollment: async (value) => {
          resolved.push(value);
          return preview;
        },
      }),
    );
    const launch = deferred<string | null>();
    let deliver!: (url: string) => void;
    let removed = false;
    const detach = attachEnrollmentLinks(controller, {
      initial: () => launch.promise,
      subscribe: (listener) => {
        deliver = listener;
        return () => {
          removed = true;
        };
      },
    });
    expect(deliver).toBeTypeOf('function');
    deliver(`aptlyable://enroll#token=${'B'.repeat(43)}`);
    deliver('aptlyable://settings');
    launch.resolve(`aptlyable://enroll#token=${'A'.repeat(43)}`);
    await launch.promise;
    await controller.signIn('local-access');
    expect(resolved).toEqual(['B'.repeat(43)]);
    detach();
    expect(removed).toBe(true);
    deliver(`aptlyable://enroll#token=${'C'.repeat(43)}`);
    expect(resolved).toEqual(['B'.repeat(43)]);
  });

  it('does not restore a setup link after its app subscription has been removed', async () => {
    const { controller } = setup();
    const launch = deferred<string | null>();
    const detach = attachEnrollmentLinks(controller, {
      initial: () => launch.promise,
      subscribe: () => () => {},
    });
    detach();
    launch.resolve(`aptlyable://enroll#token=${'A'.repeat(43)}`);
    await launch.promise;
    await controller.signIn('local-access');
    expect(controller.getSnapshot().phase).toBe('choosing-recorder');
  });

  it('can reopen the same unused invitation after signing out', async () => {
    const { controller } = setup();
    let deliver!: (url: string) => void;
    const detach = attachEnrollmentLinks(controller, {
      initial: async () => null,
      subscribe: (listener) => {
        deliver = listener;
        return () => {};
      },
    });
    const link = `aptlyable://enroll#token=${'A'.repeat(43)}`;
    deliver(link);
    await controller.signIn('local-access');
    expect(controller.getSnapshot().phase).toBe('ready');
    await controller.signOut();
    deliver(link);
    await controller.signIn('local-access');
    expect(controller.getSnapshot().phase).toBe('ready');
    detach();
  });
  it('restores the verified account and its saved recorder after restarting without a new QR', async () => {
    let raw: string | null = null;
    const sessions = createSessionStore(
      {
        read: async () => raw,
        write: async (v) => {
          raw = v;
        },
        remove: async () => {
          raw = null;
        },
      },
      'https://api.example.test',
      'pilot',
    );
    const client = fakeClient({
      session: async () => ({ user: { id: actorA, role: 'user' }, mode: 'pilot' }),
    });
    const store = journal({ actorId: actorA, key, operationId });
    const original = setup(client, store, sessions);
    await original.controller.signIn(
      'a'.repeat(43),
      'jake@example.com',
      '2099-01-01T00:00:00.000Z',
    );
    const restarted = setup(client, store, sessions);
    await restarted.controller.restoreSession();
    expect(restarted.controller.getSnapshot()).toMatchObject({
      phase: 'saved',
      actorId: actorA,
      accountEmail: 'jake@example.com',
      operation,
    });
    await restarted.controller.signOut();
    const signedOutRestart = setup(client, store, sessions);
    await signedOutRestart.controller.restoreSession();
    expect(signedOutRestart.controller.getSnapshot().actorId).toBeNull();
    expect(store.value).toBeNull();
  });

  it('keeps a newly arriving QR while restoring authentication and resolves it afterwards', async () => {
    let raw: string | null = null;
    const sessions = createSessionStore(
      {
        read: async () => raw,
        write: async (v) => {
          raw = v;
        },
        remove: async () => {
          raw = null;
        },
      },
      'https://api.example.test',
      'pilot',
    );
    const identity: SessionResponse = { user: { id: actorA, role: 'user' }, mode: 'pilot' };
    const first = setup(fakeClient({ session: async () => identity }), journal(), sessions);
    await first.controller.signIn('a'.repeat(43), 'jake@example.com', '2099-01-01T00:00:00.000Z');
    const response = deferred<SessionResponse>();
    const restarted = setup(fakeClient({ session: () => response.promise }), journal(), sessions);
    const restoring = restarted.controller.restoreSession();
    restarted.controller.receiveInvitation(token);
    expect(restarted.controller.getSnapshot().actorId).toBeNull();
    response.resolve(identity);
    await restoring;
    expect(restarted.controller.getSnapshot()).toMatchObject({ phase: 'ready', preview });
  });

  it('hides the previous recorder immediately when switching accounts', async () => {
    let next = false;
    const response = deferred<SessionResponse>();
    const test = setup(
      fakeClient({
        session: () =>
          next
            ? response.promise
            : Promise.resolve({ user: { id: actorA, role: 'user' }, mode: 'development' }),
      }),
      journal({ actorId: actorA, key, operationId }),
    );
    await test.controller.signIn('first');
    next = true;
    const switching = test.controller.signIn('second');
    expect(test.controller.getSnapshot()).toMatchObject({
      actorId: null,
      operation: null,
      preview: null,
    });
    response.resolve({ user: { id: actorB, role: 'user' }, mode: 'development' });
    await switching;
    expect(test.controller.getSnapshot()).toMatchObject({ actorId: actorB, operation: null });
  });

  it('shows a sign-in email only after the pilot session is verified, then clears it on sign-out', async () => {
    const session = deferred<SessionResponse>();
    const { controller } = setup(fakeClient({ session: () => session.promise }));
    const pending = controller.signIn('private-credential', ' Jake@Example.com ');
    expect(controller.getSnapshot().accountEmail).toBeNull();
    session.resolve({ user: { id: actorA, role: 'user' }, mode: 'pilot' });
    await pending;
    expect(controller.getSnapshot().accountEmail).toBe('jake@example.com');
    await controller.signOut();
    expect(controller.getSnapshot().accountEmail).toBeNull();
  });

  it('does not retain another account email after a rejected sign-in', async () => {
    let reject = false;
    const { controller } = setup(
      fakeClient({
        session: async () => {
          if (reject) throw new Error('Sign-in rejected');
          return { user: { id: actorA, role: 'user' }, mode: 'pilot' };
        },
      }),
    );
    await controller.signIn('credential-a', 'first@example.com');
    reject = true;
    await controller.signIn('credential-b', 'second@example.com');
    expect(controller.getSnapshot().actorId).toBeNull();
    expect(controller.getSnapshot().accountEmail).toBeNull();
  });

  it('does not attach an email to development access', async () => {
    const { controller } = setup();
    await controller.signIn('local-user-code', 'unverified@example.com');
    expect(controller.getSnapshot().accountEmail).toBeNull();
  });

  it('clears the displayed email if enrollment recovery reports an expired session', async () => {
    const { controller } = setup(
      fakeClient({
        session: async () => ({ user: { id: actorA, role: 'user' }, mode: 'pilot' }),
        getOperation: async () => {
          throw { status: 401 };
        },
      }),
      journal({ actorId: actorA, key, operationId }),
    );
    await controller.signIn('expired-credential', 'jake@example.com');
    expect(controller.getSnapshot().phase).toBe('signed-out');
    expect(controller.getSnapshot().accountEmail).toBeNull();
  });

  it('does not persist the sign-in email when saving recorder enrollment', async () => {
    const { controller, store } = setup(
      fakeClient({
        session: async () => ({ user: { id: actorA, role: 'user' }, mode: 'pilot' }),
      }),
    );
    controller.receiveInvitation(token);
    await controller.signIn('private-credential', 'jake@example.com');
    await controller.claim();
    expect(controller.getSnapshot().accountEmail).toBe('jake@example.com');
    expect(store.value).toEqual({ actorId: actorA, key, operationId });
  });

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
    expect(controller.getSnapshot().phase).toBe('choosing-recorder');
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

    expect(controller.getSnapshot().phase).toBe('choosing-recorder');
    expect(controller.getSnapshot().actorId).toBe(actorA);
  });
  it('removes durable enrollment after unpair without signing out, and does not restore it on restart', async () => {
    const store = journal({ actorId: actorA, key, operationId });
    const { controller, credential } = setup(fakeClient(), store);
    await controller.signIn('local-user-code');
    await controller.clearAfterUnpair({ actorId: actorA, operationId });
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'choosing-recorder',
      actorId: actorA,
      operation: null,
      preview: null,
    });
    expect(credential()).toBe('local-user-code');
    expect(store.value).toBeNull();
    const restarted = setup(
      fakeClient({
        getOperation: async () => {
          throw new Error('Must not restore old pairing');
        },
      }),
      store,
    );
    await restarted.controller.signIn('local-user-code');
    expect(restarted.controller.getSnapshot()).toMatchObject({
      phase: 'choosing-recorder',
      operation: null,
    });
  });

  it('does not remove another account or operation after a stale unpair callback', async () => {
    const store = journal({ actorId: actorA, key, operationId });
    const { controller } = setup(fakeClient(), store);
    await controller.signIn('local-user-code');
    await controller.clearAfterUnpair({ actorId: actorB, operationId });
    await controller.clearAfterUnpair({ actorId: actorA, operationId: key });
    expect(controller.getSnapshot().operation?.id).toBe(operationId);
    expect(store.value?.operationId).toBe(operationId);
  });

  it('retains the operation for retry if durable unpair cleanup fails', async () => {
    const store = journal({ actorId: actorA, key, operationId });
    const { controller } = setup(fakeClient(), store);
    await controller.signIn('local-user-code');
    store.clear = async () => {
      throw new Error('Storage unavailable');
    };
    await expect(controller.clearAfterUnpair({ actorId: actorA, operationId })).rejects.toThrow(
      'Storage unavailable',
    );
    expect(controller.getSnapshot().operation?.id).toBe(operationId);
    store.clear = async () => {
      store.value = null;
    };
    await controller.clearAfterUnpair({ actorId: actorA, operationId });
    expect(controller.getSnapshot().operation).toBeNull();
    expect(store.value).toBeNull();
  });

  it('does not let a late status response restore an enrollment removed by unpair', async () => {
    const response = deferred<SetupOperation>();
    let refreshing = false;
    const { controller } = setup(
      fakeClient({
        getOperation: () => (refreshing ? response.promise : Promise.resolve(operation)),
      }),
      journal({ actorId: actorA, key, operationId }),
    );
    await controller.signIn('local-user-code');
    refreshing = true;
    const refresh = controller.refresh();
    await controller.clearAfterUnpair({ actorId: actorA, operationId });
    response.resolve(operation);
    await refresh;
    expect(controller.getSnapshot().operation).toBeNull();
  });
});
