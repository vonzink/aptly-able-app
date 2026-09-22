import type { ApiClient, SessionController } from '@aptly/api-client';
import type {
  AccountRecorder,
  RecorderSetupInput,
  EnrollmentPreview,
  SetupOperation,
} from '@aptly/contracts';

export type EnrollmentJournal = { actorId: string; key: string; operationId?: string };
export interface EnrollmentJournalStore {
  load(): Promise<EnrollmentJournal | null>;
  save(value: EnrollmentJournal): Promise<void>;
  clear(): Promise<void>;
}

type Phase =
  | 'loading-recorders'
  | 'choosing-recorder'
  | 'adding-recorder'
  | 'account-error'
  | 'signed-out'
  | 'signing-in'
  | 'resolving'
  | 'ready'
  | 'claiming'
  | 'saved'
  | 'revoked'
  | 'needs-invitation'
  | 'recovery-error'
  | 'error'
  | 'storage-error';

export type EnrollmentSnapshot = {
  phase: Phase;
  /** Presence only: invitation secrets never enter the render/diagnostic snapshot. */
  hasInvitation: boolean;
  recorders: AccountRecorder[];
  canAddRecorder: boolean;
  actorId: string | null;
  /** Display-only sign-in email; never persisted in the enrollment journal or diagnostics. */
  accountEmail: string | null;
  preview: EnrollmentPreview | null;
  operation: SetupOperation | null;
  message: string | null;
};

type Dependencies = {
  client: ApiClient;
  journal: EnrollmentJournalStore;
  createIdempotencyKey: () => string;
  authentication: SessionController;
};

export interface EnrollmentController {
  getSnapshot(): EnrollmentSnapshot;
  subscribe(listener: () => void): () => void;
  initialize(): Promise<void>;
  receiveInvitation(token: string): void;
  startNewInvitation(): Promise<void>;
  clearAfterUnpair(expected: { actorId: string; operationId: string }): Promise<void>;
  signIn(accessCode: string, accountEmail?: string, expiresAt?: string): Promise<void>;
  restoreSession(): Promise<void>;
  clearSession(message?: string | null): void;
  retryRecovery(): Promise<void>;
  resolveInvitation(): Promise<void>;
  claim(): Promise<void>;
  refresh(): Promise<void>;
  signOut(): Promise<void>;
  loadRecorders(): Promise<void>;
  addRecorder(input: RecorderSetupInput): Promise<void>;
  selectRecorder(assignmentId: string): Promise<void>;
}

const initial: EnrollmentSnapshot = {
  phase: 'signed-out',
  hasInvitation: false,
  recorders: [],
  canAddRecorder: false,
  actorId: null,
  accountEmail: null,
  preview: null,
  operation: null,
  message: null,
};

export function createEnrollmentController(deps: Dependencies): EnrollmentController {
  let snapshot = initial;
  let invitation: string | null = null;
  let savedJournal: EnrollmentJournal | null = null;
  let generation = 0;
  let claimPromise: Promise<void> | null = null;
  let journalWrites: Promise<void> = Promise.resolve();
  let activeRequest: AbortController | null = null;
  let initializationPromise: Promise<void> | null = null;
  let lifecycleEpoch = 0;
  let authenticationGeneration: number | null = null;
  const listeners = new Set<() => void>();

  const update = (next: Partial<EnrollmentSnapshot>) => {
    snapshot = { ...snapshot, ...next, hasInvitation: Boolean(invitation) };
    listeners.forEach((listener) => listener());
  };
  const active = (requestGeneration: number) => requestGeneration === generation;
  const requestSignal = () => {
    activeRequest?.abort();
    activeRequest = new AbortController();
    return activeRequest.signal;
  };
  const cancelRequest = () => {
    activeRequest?.abort();
    activeRequest = null;
  };
  const writeJournal = (operation: () => Promise<void>) => {
    journalWrites = journalWrites.then(operation, operation);
    return journalWrites;
  };

  async function initialize() {
    if (!initializationPromise) {
      const initializationEpoch = lifecycleEpoch;
      initializationPromise = (async () => {
        try {
          const loaded = await deps.journal.load();
          if (initializationEpoch === lifecycleEpoch && savedJournal === null)
            savedJournal = loaded;
        } catch {
          if (initializationEpoch === lifecycleEpoch)
            update({
              phase: 'storage-error',
              message: 'Secure enrollment recovery is unavailable on this device.',
            });
        }
      })();
    }
    await initializationPromise;
  }

  function receiveInvitation(token: string) {
    if (token && token === invitation) return;
    // A launch link can arrive while credentials are being restored. Retain it
    // without cancelling authentication or exposing an unverified actor.
    if (authenticationGeneration === generation) {
      invitation = token || null;
      update({});
      return;
    }
    const discardPendingClaim = snapshot.phase === 'claiming';
    generation += 1;
    cancelRequest();
    invitation = token || null;
    if (discardPendingClaim) {
      savedJournal = null;
      void writeJournal(() => deps.journal.clear()).catch(() => {
        update({
          phase: 'storage-error',
          message: 'Secure enrollment recovery is unavailable on this device.',
        });
      });
    }
    update({
      phase: snapshot.operation
        ? snapshot.operation.status === 'revoked'
          ? 'revoked'
          : 'saved'
        : snapshot.actorId
          ? invitation
            ? 'resolving'
            : 'needs-invitation'
          : 'signed-out',
      preview: snapshot.operation ? snapshot.preview : null,
      operation: snapshot.operation,
      message: null,
    });
  }

  async function startNewInvitation() {
    const requestGeneration = ++generation;
    cancelRequest();
    invitation = null;
    savedJournal = null;
    update({
      phase: snapshot.actorId ? 'needs-invitation' : 'signed-out',
      preview: null,
      operation: null,
      message: snapshot.actorId ? 'Scan or enter your new invitation.' : null,
    });
    try {
      await writeJournal(() => deps.journal.clear());
    } catch {
      if (active(requestGeneration))
        update({
          phase: 'storage-error',
          message: 'Secure enrollment recovery is unavailable on this device.',
        });
    }
  }

  async function clearAfterUnpair(expected: { actorId: string; operationId: string }) {
    if (snapshot.actorId !== expected.actorId || snapshot.operation?.id !== expected.operationId)
      return;
    const requestGeneration = ++generation;
    lifecycleEpoch += 1;
    cancelRequest();
    invitation = null;
    savedJournal = null;
    claimPromise = null;
    // Preserve the operation until durable removal succeeds, so the caller can retry.
    // Journal writes are serialized behind any earlier recovery/claim save.
    await writeJournal(() => deps.journal.clear());
    if (!active(requestGeneration)) return;
    update({
      phase: 'choosing-recorder',
      recorders: [],
      preview: null,
      operation: null,
      message: 'Recorder unpaired and removed from your account. Add a recorder to set up again.',
    });
    await discoverRecorders(requestGeneration, false);
  }

  async function recoverJournal(
    requestGeneration: number,
  ): Promise<'recovered' | 'missing' | 'failed'> {
    const journalToRecover = savedJournal;
    if (!journalToRecover || snapshot.actorId !== journalToRecover.actorId) return 'missing';
    update({ phase: 'resolving', message: null });
    try {
      const operation = journalToRecover.operationId
        ? await deps.client.getOperation(journalToRecover.operationId, { signal: requestSignal() })
        : await deps.client.getClaimOperation(journalToRecover.key, { signal: requestSignal() });
      if (!active(requestGeneration)) return 'failed';
      const restoredJournal = { ...journalToRecover, operationId: operation.id };
      await writeJournal(() => deps.journal.save(restoredJournal));
      if (!active(requestGeneration)) return 'failed';
      savedJournal = restoredJournal;
      update({ operation, phase: operation.status === 'revoked' ? 'revoked' : 'saved' });
      return 'recovered';
    } catch (error) {
      if (!active(requestGeneration)) return 'failed';
      if (statusOf(error) === 404) {
        savedJournal = null;
        await writeJournal(() => deps.journal.clear());
        if (!active(requestGeneration)) return 'failed';
        return 'missing';
      }
      if (statusOf(error) === 401) {
        await deps.authentication.signOut();
        if (!active(requestGeneration)) return 'failed';
        update({
          phase: 'signed-out',
          actorId: null,
          accountEmail: null,
          message: 'Your local session expired. Sign in again to restore enrollment.',
        });
      } else {
        update({
          phase: 'recovery-error',
          message: safeMessage(error, 'We could not restore enrollment. Try again.'),
        });
      }
      return 'failed';
    }
  }

  async function authenticate(work: () => Promise<void>) {
    const requestGeneration = ++generation;
    authenticationGeneration = requestGeneration;
    cancelRequest();
    update({ ...initial, phase: 'signing-in' });
    try {
      await initialize();
      if (!active(requestGeneration)) return;
      await work();
      if (!active(requestGeneration)) return;
      const authentication = deps.authentication.getSnapshot();
      const session = authentication.session;
      if (!session) {
        update({ ...initial, message: authentication.message });
        return;
      }
      const actorId = session.identity.user.id;
      update({ actorId, accountEmail: session.accountEmail });
      if (savedJournal && savedJournal.actorId !== actorId) {
        savedJournal = null;
        await writeJournal(() => deps.journal.clear());
        if (!active(requestGeneration)) return;
      }
      if (savedJournal) {
        const recovery = await recoverJournal(requestGeneration);
        if (recovery === 'recovered' || recovery === 'failed') return;
      }
      if (invitation) await resolveForGeneration(requestGeneration);
      else await discoverRecorders(requestGeneration);
    } catch {
      if (active(requestGeneration))
        update({
          phase: 'storage-error',
          message: 'Enrollment recovery is unavailable on this device. Try again.',
        });
    } finally {
      if (authenticationGeneration === requestGeneration) authenticationGeneration = null;
    }
  }

  function signIn(accessCode: string, accountEmail?: string, expiresAt?: string) {
    return authenticate(() =>
      deps.authentication.signIn(accessCode, {
        ...(accountEmail ? { accountEmail } : {}),
        ...(expiresAt ? { expiresAt } : {}),
      }),
    );
  }

  function restoreSession() {
    return authenticate(deps.authentication.restore);
  }

  function clearSession(message: string | null = null) {
    generation += 1;
    cancelRequest();
    claimPromise = null;
    snapshot = { ...initial, message, hasInvitation: Boolean(invitation) };
    listeners.forEach((listener) => listener());
  }

  async function resolveForGeneration(requestGeneration: number) {
    if (!invitation || !snapshot.actorId) return;
    update({ phase: 'resolving', preview: null, message: null });
    try {
      const preview = await deps.client.resolveEnrollment(invitation, { signal: requestSignal() });
      if (!active(requestGeneration)) return;
      update({ phase: 'ready', preview });
    } catch (error) {
      if (!active(requestGeneration)) return;
      update({ phase: 'error', message: recoveryMessage(error) });
    }
  }

  async function resolveInvitation() {
    const requestGeneration = generation;
    if (snapshot.operation) return;
    if (savedJournal && snapshot.actorId === savedJournal.actorId) {
      const recovery = await recoverJournal(requestGeneration);
      if (recovery !== 'missing') return;
    }
    await resolveForGeneration(requestGeneration);
  }

  function claim() {
    if (claimPromise) return claimPromise;
    if (
      !invitation ||
      !snapshot.actorId ||
      !snapshot.preview ||
      (snapshot.phase !== 'ready' && snapshot.phase !== 'error')
    )
      return Promise.resolve();
    const requestGeneration = generation;
    const claimActorId = snapshot.actorId;
    const claimToken = invitation;
    const claimKey =
      savedJournal?.actorId === claimActorId ? savedJournal.key : deps.createIdempotencyKey();
    const work = (async () => {
      const journal = { actorId: claimActorId, key: claimKey };
      update({ phase: 'claiming', message: null });
      try {
        await writeJournal(() => deps.journal.save(journal));
        if (!active(requestGeneration)) return;
        savedJournal = journal;
      } catch {
        if (active(requestGeneration))
          update({
            phase: 'storage-error',
            message: 'Enrollment cannot continue because secure recovery is unavailable.',
          });
        return;
      }
      try {
        const operation = await deps.client.claimEnrollment(claimToken, claimKey, {
          signal: requestSignal(),
        });
        if (!active(requestGeneration)) return;
        const completedJournal = { ...journal, operationId: operation.id };
        await writeJournal(() => deps.journal.save(completedJournal));
        if (!active(requestGeneration)) return;
        savedJournal = completedJournal;
        invitation = null;
        update({
          operation,
          phase: operation.status === 'revoked' ? 'revoked' : 'saved',
          preview: snapshot.preview,
        });
      } catch (error) {
        if (active(requestGeneration))
          update({
            phase: 'error',
            message: safeMessage(
              error,
              'The response was interrupted. Try Continue setup again safely.',
            ),
          });
      }
    })();
    const tracked = work.finally(() => {
      if (claimPromise === tracked) claimPromise = null;
    });
    claimPromise = tracked;
    return claimPromise;
  }

  async function saveAccountOperation(operation: SetupOperation, own: number) {
    if (!active(own) || !snapshot.actorId) return;
    const journal = {
      actorId: snapshot.actorId,
      key: deps.createIdempotencyKey(),
      operationId: operation.id,
    };
    await writeJournal(() => deps.journal.save(journal));
    if (!active(own)) return;
    savedJournal = journal;
    invitation = null;
    update({
      operation,
      phase: operation.status === 'pending' ? 'saved' : 'revoked',
      message: null,
    });
  }

  async function discoverRecorders(own: number, resume = true) {
    if (!snapshot.actorId) return;
    update({ phase: 'loading-recorders', message: null });
    try {
      const result = await deps.client.myRecorders({ signal: requestSignal() });
      if (!active(own)) return;
      // A link received during authentication takes precedence over account discovery.
      if (invitation) {
        await resolveForGeneration(own);
        return;
      }
      update({ recorders: result.recorders, canAddRecorder: result.canAdd });
      const only = result.recorders.length === 1 ? result.recorders[0] : null;
      if (resume && only?.operation?.status === 'pending' && !only.setupBlocked) {
        await saveAccountOperation(only.operation, own);
      } else update({ phase: 'choosing-recorder' });
    } catch (error) {
      if (!active(own)) return;
      // Roll out the API first. An older API still supports the existing invitation path.
      update({
        phase: statusOf(error) === 404 ? 'needs-invitation' : 'account-error',
        message:
          statusOf(error) === 404
            ? 'This server still uses setup links. Open your invitation, or get one from the website.'
            : 'Could not load your recorders. Check your connection and try again.',
      });
    }
  }
  async function loadRecorders() {
    if (
      !snapshot.actorId ||
      claimPromise ||
      snapshot.phase === 'adding-recorder' ||
      snapshot.phase === 'signing-in'
    )
      return;
    if (snapshot.operation) return;
    const own = ++generation;
    cancelRequest();
    invitation = null;
    update({ preview: null });
    await discoverRecorders(own);
  }
  async function addRecorder(input: RecorderSetupInput) {
    if (!snapshot.actorId || !snapshot.canAddRecorder || snapshot.phase !== 'choosing-recorder')
      return;
    const own = ++generation;
    cancelRequest();
    update({ phase: 'adding-recorder', message: null });
    try {
      const recorder = await deps.client.addMyRecorder(input, { signal: requestSignal() });
      if (!active(own)) return;
      update({
        phase: 'choosing-recorder',
        recorders: [
          recorder,
          ...snapshot.recorders.filter((r) => r.assignmentId !== recorder.assignmentId),
        ],
        message: 'Recorder added. Continue below to connect it.',
      });
    } catch (error) {
      if (active(own))
        update({
          phase: 'choosing-recorder',
          message: safeMessage(error, 'Could not add your recorder. Try again.'),
        });
    }
  }
  function selectRecorder(assignmentId: string): Promise<void> {
    if (claimPromise) return claimPromise;
    const recorder = snapshot.recorders.find((r) => r.assignmentId === assignmentId);
    if (
      !snapshot.actorId ||
      !recorder ||
      recorder.setupBlocked ||
      snapshot.phase !== 'choosing-recorder'
    )
      return Promise.resolve();
    const own = ++generation;
    cancelRequest();
    update({ phase: 'claiming', message: null });
    const work = (async () => {
      try {
        const operation = await deps.client.beginRecorderSetup(assignmentId, {
          signal: requestSignal(),
        });
        if (!active(own)) return;
        if (operation.assignmentId !== assignmentId)
          throw new Error('Setup response did not match your recorder.');
        await saveAccountOperation(operation, own);
      } catch (error) {
        if (active(own))
          update({
            phase: 'choosing-recorder',
            message: safeMessage(error, 'Could not save setup. Try again safely.'),
          });
      }
    })();
    const tracked = work.finally(() => {
      if (claimPromise === tracked) claimPromise = null;
    });
    claimPromise = tracked;
    return tracked;
  }

  async function retryRecovery() {
    const requestGeneration = generation;
    const recovery = await recoverJournal(requestGeneration);
    if (recovery !== 'missing' || !active(requestGeneration)) return;
    if (invitation) await resolveForGeneration(requestGeneration);
    else await discoverRecorders(requestGeneration);
  }

  async function refresh() {
    if (!snapshot.operation) return;
    const requestGeneration = generation;
    update({ message: null });
    try {
      const operation = await deps.client.getOperation(snapshot.operation.id, {
        signal: requestSignal(),
      });
      if (!active(requestGeneration)) return;
      update({ operation, phase: operation.status === 'revoked' ? 'revoked' : 'saved' });
    } catch (error) {
      if (active(requestGeneration)) update({ phase: 'error', message: recoveryMessage(error) });
    }
  }

  async function signOut() {
    generation += 1;
    lifecycleEpoch += 1;
    cancelRequest();
    invitation = null;
    savedJournal = null;
    claimPromise = null;
    const signingOut = deps.authentication.signOut();
    snapshot = initial;
    listeners.forEach((listener) => listener());
    try {
      await writeJournal(() => deps.journal.clear());
    } catch {
      /* local state is still wiped */
    }
    await signingOut;
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    initialize,
    receiveInvitation,
    startNewInvitation,
    clearAfterUnpair,
    signIn,
    restoreSession,
    clearSession,
    retryRecovery,
    resolveInvitation,
    claim,
    refresh,
    signOut,
    loadRecorders,
    addRecorder,
    selectRecorder,
  };
}

function statusOf(error: unknown): number | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
    ? error.status
    : undefined;
}

function safeMessage(error: unknown, fallback: string): string {
  return typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
    ? error.message
    : fallback;
}

function recoveryMessage(error: unknown): string {
  const status = statusOf(error);
  if (status === 403)
    return 'This invitation belongs to a different account. Sign in with the assigned account.';
  if (status === 404 || status === 410)
    return 'This invitation is no longer available. Ask for a new invitation.';
  return safeMessage(error, 'We could not check this invitation. Try again.');
}
