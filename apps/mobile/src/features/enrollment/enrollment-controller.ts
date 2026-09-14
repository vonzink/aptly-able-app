import type { ApiClient } from '@aptly/api-client';
import type { EnrollmentPreview, SetupOperation } from '@aptly/contracts';

export type EnrollmentJournal = { actorId: string; key: string; operationId?: string };
export interface EnrollmentJournalStore {
  load(): Promise<EnrollmentJournal | null>;
  save(value: EnrollmentJournal): Promise<void>;
  clear(): Promise<void>;
}

type Phase =
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
  actorId: string | null;
  preview: EnrollmentPreview | null;
  operation: SetupOperation | null;
  message: string | null;
};

type Dependencies = {
  client: ApiClient;
  journal: EnrollmentJournalStore;
  createIdempotencyKey: () => string;
  credentials: { set(value: string): void; clear(): void };
};

export interface EnrollmentController {
  getSnapshot(): EnrollmentSnapshot;
  subscribe(listener: () => void): () => void;
  initialize(): Promise<void>;
  receiveInvitation(token: string): void;
  startNewInvitation(): Promise<void>;
  signIn(accessCode: string): Promise<void>;
  retryRecovery(): Promise<void>;
  resolveInvitation(): Promise<void>;
  claim(): Promise<void>;
  refresh(): Promise<void>;
  signOut(): Promise<void>;
}

const initial: EnrollmentSnapshot = {
  phase: 'signed-out',
  actorId: null,
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
  const listeners = new Set<() => void>();

  const update = (next: Partial<EnrollmentSnapshot>) => {
    snapshot = { ...snapshot, ...next };
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
        deps.credentials.clear();
        update({
          phase: 'signed-out',
          actorId: null,
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

  async function signIn(accessCode: string) {
    const requestGeneration = ++generation;
    await initialize();
    if (!active(requestGeneration)) return;
    deps.credentials.set(accessCode);
    update({ phase: 'signing-in', message: null });
    try {
      const session = await deps.client.session({ signal: requestSignal() });
      if (!active(requestGeneration)) return;
      const actorId = session.user.id;
      update({ actorId });
      if (savedJournal && savedJournal.actorId !== actorId) {
        savedJournal = null;
        await writeJournal(() => deps.journal.clear());
        if (!active(requestGeneration)) return;
      }
      if (savedJournal) {
        const recovery = await recoverJournal(requestGeneration);
        if (recovery === 'recovered' || recovery === 'failed') return;
        update({
          phase: invitation ? 'resolving' : 'needs-invitation',
          message: invitation ? null : 'Please scan your invitation again.',
        });
      }
      if (invitation) await resolveForGeneration(requestGeneration);
      else update({ phase: 'needs-invitation', message: 'Please scan or enter your invitation.' });
    } catch (error) {
      if (!active(requestGeneration)) return;
      deps.credentials.clear();
      update({
        phase: 'signed-out',
        actorId: null,
        message: safeMessage(error, 'That access code could not be verified.'),
      });
    }
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

  async function retryRecovery() {
    const requestGeneration = generation;
    const recovery = await recoverJournal(requestGeneration);
    if (recovery !== 'missing' || !active(requestGeneration)) return;
    if (invitation) await resolveForGeneration(requestGeneration);
    else update({ phase: 'needs-invitation', message: 'Please scan your invitation again.' });
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
    deps.credentials.clear();
    snapshot = initial;
    listeners.forEach((listener) => listener());
    try {
      await writeJournal(() => deps.journal.clear());
    } catch {
      /* local state is still wiped */
    }
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
    signIn,
    retryRecovery,
    resolveInvitation,
    claim,
    refresh,
    signOut,
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
