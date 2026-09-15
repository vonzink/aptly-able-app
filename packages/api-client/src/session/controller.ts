import type { SessionResponse } from '@aptly/contracts';
import type { RequestOptions } from '../types.js';
import type { SessionStore, SavedSession } from './store.js';

export interface SessionSnapshot {
  phase: 'restoring' | 'restore-error' | 'signing-in' | 'signed-out' | 'ready';
  session: {
    identity: SessionResponse;
    accountEmail: string | null;
    expiresAt: string | null;
  } | null;
  message: string | null;
  cleanupPending: boolean;
}
export type SignInDetails = { accountEmail?: string; expiresAt?: string };
export type SessionController = ReturnType<typeof createSessionController>;
const signedOut: SessionSnapshot = {
  phase: 'signed-out',
  session: null,
  message: null,
  cleanupPending: false,
};
const expiredMessage = 'Your session expired. Sign in again to continue.';

/** Framework-independent authentication lifecycle; credentials never appear in UI snapshots. */
export function createSessionController({
  store,
  verify,
  revoke,
  now = Date.now,
}: {
  store: SessionStore;
  verify(credential: string, options?: RequestOptions): Promise<SessionResponse>;
  revoke(credential: string): Promise<void>;
  now?: () => number;
}) {
  let snapshot: SessionSnapshot = { ...signedOut, phase: 'restoring' };
  let credential: string | undefined;
  let pendingCredential: string | undefined;
  let generation = 0;
  let request: AbortController | null = null;
  let writes: Promise<void> = Promise.resolve();
  let restoring: Promise<void> | null = null;
  let initialized = false;
  const listeners = new Set<() => void>();
  const publish = (value: SessionSnapshot) => {
    snapshot = value;
    listeners.forEach((fn) => fn());
  };
  const write = (operation: () => Promise<void>) => (writes = writes.then(operation, operation));
  const begin = () => {
    request?.abort();
    request = new AbortController();
    return ++generation;
  };

  async function signOut(message: string | null = null) {
    const own = begin();
    initialized = true;
    const old = credential ?? pendingCredential;
    credential = undefined;
    pendingCredential = undefined;
    publish({ ...signedOut, message, cleanupPending: true });
    // Durable deletion is ordered after any earlier save. Revocation is best effort offline.
    const revoking = old ? revoke(old).catch(() => {}) : Promise.resolve();
    try {
      await write(() => store.clear());
      if (own === generation) publish({ ...signedOut, message });
    } catch {
      if (own === generation)
        publish({
          ...signedOut,
          cleanupPending: true,
          message: 'Saved sign-in could not be removed. Retry sign out before closing the app.',
        });
    }
    await revoking;
  }

  function checkExpiry() {
    const expiresAt = snapshot.session?.expiresAt;
    if (expiresAt && Date.parse(expiresAt) <= now()) void signOut(expiredMessage);
  }
  function getCredential() {
    checkExpiry();
    return snapshot.phase === 'ready' ? credential : undefined;
  }

  async function signIn(value: string, details: SignInDetails = {}) {
    const own = begin();
    initialized = true;
    credential = undefined;
    pendingCredential = value;
    publish({ ...signedOut, phase: 'signing-in' });
    let cleared = false;
    try {
      await write(() => store.clear());
      cleared = true;
      if (own !== generation) return;
      const identity = await verify(value, { signal: request!.signal });
      if (own !== generation) return;
      const expiresAt = identity.mode === 'pilot' ? (details.expiresAt ?? null) : null;
      if (
        expiresAt &&
        (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= now())
      ) {
        await signOut(expiredMessage);
        return;
      }
      const accountEmail =
        identity.mode === 'pilot' && details.accountEmail
          ? details.accountEmail.trim().toLowerCase().slice(0, 254)
          : null;
      let message: string | null = null;
      if (identity.mode === 'pilot' && expiresAt) {
        try {
          await write(async () => {
            if (own === generation)
              await store.save({
                credential: value,
                actorId: identity.user.id,
                expiresAt,
                accountEmail,
              });
          });
        } catch {
          message =
            'Signed in for now. Sign-in could not be saved on this device; you may need to sign in again after closing it.';
        }
      }
      if (own !== generation) return;
      credential = value;
      pendingCredential = undefined;
      publish({
        ...signedOut,
        phase: 'ready',
        session: { identity, accountEmail, expiresAt },
        message,
      });
    } catch {
      if (own !== generation) return;
      pendingCredential = undefined;
      publish({
        ...signedOut,
        cleanupPending: !cleared,
        message: cleared
          ? 'Sign-in could not be verified. Check your connection and try again.'
          : 'Saved sign-in could not be removed. Retry sign out before signing in again.',
      });
    }
  }

  function restore(): Promise<void> {
    if (initialized && snapshot.phase !== 'restore-error') return restoring ?? Promise.resolve();
    if (restoring) return restoring;
    initialized = true;
    const own = begin();
    publish({ ...signedOut, phase: 'restoring' });
    const work = (async () => {
      let saved: SavedSession | null;
      try {
        await writes.catch(() => {});
        saved = await store.load();
        if (own !== generation) return;
        if (!saved) {
          publish(signedOut);
          return;
        }
        pendingCredential = saved.credential;
        if (Date.parse(saved.expiresAt) <= now()) {
          await signOut(expiredMessage);
          return;
        }
        const identity = await verify(saved.credential, { signal: request!.signal });
        if (own !== generation) return;
        if (identity.user.id !== saved.actorId || identity.mode !== 'pilot') {
          await signOut('Saved sign-in does not match this account. Sign in again.');
          return;
        }
        if (Date.parse(saved.expiresAt) <= now()) {
          await signOut(expiredMessage);
          return;
        }
        credential = saved.credential;
        pendingCredential = undefined;
        publish({
          ...signedOut,
          phase: 'ready',
          session: { identity, accountEmail: saved.accountEmail, expiresAt: saved.expiresAt },
        });
      } catch (error) {
        if (own !== generation) return;
        if (
          typeof error === 'object' &&
          error !== null &&
          'status' in error &&
          error.status === 401
        ) {
          await signOut(expiredMessage);
          return;
        }
        publish({
          ...signedOut,
          phase: 'restore-error',
          message:
            'We could not restore your sign-in. Check your connection and unlock your device, then retry.',
        });
      }
    })();
    const tracked = work.finally(() => {
      if (restoring === tracked) restoring = null;
    });
    restoring = tracked;
    return tracked;
  }

  function guardFetch(
    transport: typeof globalThis.fetch = globalThis.fetch,
  ): typeof globalThis.fetch {
    return async (input, init) => {
      const sent = new Headers(init?.headers).get('Authorization');
      const response = await transport(input, init);
      if (response.status === 401 && credential && sent === `Bearer ${credential}`)
        void signOut(expiredMessage);
      return response;
    };
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    getCredential,
    signIn,
    signOut,
    restore,
    checkExpiry,
    guardFetch,
    dispose() {
      begin();
      credential = undefined;
      pendingCredential = undefined;
      listeners.clear();
    },
  };
}
