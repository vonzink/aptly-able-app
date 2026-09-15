import { describe, expect, it, vi } from 'vitest';
import { createSessionController } from '../src/session/controller.js';
import { createSessionStore } from '../src/session/store.js';
import type { SessionResponse } from '@aptly/contracts';

const identity: SessionResponse = {
  user: { id: '11111111-1111-4111-8111-111111111111', role: 'user' },
  mode: 'pilot',
};
const other: SessionResponse = {
  ...identity,
  user: { ...identity.user, id: '22222222-2222-4222-8222-222222222222' },
};
const token = 'a'.repeat(43);
const expiry = '2099-01-01T00:00:00.000Z';
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
function harness(verify = async (_credential: string): Promise<SessionResponse> => identity) {
  let raw: string | null = null;
  const driver = {
    read: async () => raw,
    write: async (v: string) => {
      raw = v;
    },
    remove: async () => {
      raw = null;
    },
  };
  const store = createSessionStore(driver, 'https://api.example.test', 'pilot');
  const revoke = vi.fn(async () => {});
  const controller = createSessionController({ store, verify, revoke });
  return {
    controller,
    store,
    driver,
    revoke,
    raw: () => raw,
    replace: (v: string) => {
      raw = v;
    },
  };
}
const options = { expiresAt: expiry, accountEmail: 'Jake@Example.com' };

describe('persistent sessions', () => {
  it('expires a session before returning a credential for a new request', async () => {
    let now = Date.now();
    const h = harness();
    const controller = createSessionController({
      store: h.store,
      verify: async () => identity,
      revoke: h.revoke,
      now: () => now,
    });
    await controller.signIn(token, options);
    now = Date.parse(expiry);
    expect(controller.getCredential()).toBeUndefined();
    expect(controller.getSnapshot().session).toBeNull();
    await controller.signOut();
    expect(h.raw()).toBeNull();
  });
  it('blocks a new login when the old saved login cannot be removed', async () => {
    const h = harness();
    await h.controller.signIn(token, options);
    h.driver.remove = async () => {
      throw new Error('storage locked');
    };
    await h.controller.signIn('b'.repeat(43), options);
    expect(h.controller.getCredential()).toBeUndefined();
    expect(h.controller.getSnapshot().cleanupPending).toBe(true);
  });
  it('retains current access with a visible notice when only saving the new session fails', async () => {
    const h = harness();
    h.driver.write = async () => {
      throw new Error('storage full');
    };
    await h.controller.signIn(token, options);
    expect(h.controller.getCredential()).toBe(token);
    expect(h.controller.getSnapshot().message).toBeTruthy();
    expect(h.raw()).toBeNull();
  });

  it('restores only after the server verifies the saved actor; snapshots contain no credentials', async () => {
    const h = harness();
    await h.controller.signIn(token, options);
    const verifying = deferred<SessionResponse>();
    const restarted = createSessionController({
      store: h.store,
      verify: () => verifying.promise,
      revoke: h.revoke,
    });
    const restore = restarted.restore();
    expect(restarted.getCredential()).toBeUndefined();
    expect(restarted.getSnapshot().session).toBeNull();
    verifying.resolve(identity);
    await restore;
    expect(restarted.getSnapshot().session?.identity).toEqual(identity);
    expect(restarted.getSnapshot().session?.accountEmail).toBe('jake@example.com');
    expect(restarted.getCredential()).toBe(token);
    expect(JSON.stringify(restarted.getSnapshot())).not.toContain(token);
  });
  it('retains a saved session through a network failure and retries without exposing account data', async () => {
    const h = harness();
    await h.controller.signIn(token, options);
    let offline = true;
    const restarted = createSessionController({
      store: h.store,
      verify: async () => {
        if (offline) throw new Error('offline');
        return identity;
      },
      revoke: h.revoke,
    });
    await restarted.restore();
    expect(restarted.getSnapshot().phase).toBe('restore-error');
    expect(restarted.getCredential()).toBeUndefined();
    expect(h.raw()).not.toBeNull();
    offline = false;
    await restarted.restore();
    expect(restarted.getSnapshot().session?.identity.user.id).toBe(identity.user.id);
  });
  it.each(['expired', 'revoked', 'different-actor'] as const)(
    'removes a %s saved session',
    async (reason) => {
      const h = harness();
      await h.controller.signIn(token, options);
      const restarted = createSessionController({
        store: h.store,
        now: () => (reason === 'expired' ? Date.parse(expiry) : Date.now()),
        verify: async () => {
          if (reason === 'revoked') throw { status: 401 };
          return other;
        },
        revoke: h.revoke,
      });
      await restarted.restore();
      expect(restarted.getSnapshot().phase).toBe('signed-out');
      expect(restarted.getCredential()).toBeUndefined();
      expect(h.raw()).toBeNull();
    },
  );
  it('does not restore credentials into another API environment or auth mode', async () => {
    const h = harness();
    await h.controller.signIn(token, options);
    expect(
      await createSessionStore(h.driver, 'https://other.example.test', 'pilot').load(),
    ).toBeNull();
    expect(h.raw()).toBeNull();
    await h.controller.signIn(token, options);
    expect(
      await createSessionStore(h.driver, 'https://api.example.test', 'development').load(),
    ).toBeNull();
  });
  it('discards malformed storage safely', async () => {
    const h = harness();
    h.replace('{broken');
    await h.controller.restore();
    expect(h.controller.getSnapshot().phase).toBe('signed-out');
    expect(h.raw()).toBeNull();
  });
  it('keeps development credentials in memory only', async () => {
    const h = harness(async () => ({ ...identity, mode: 'development' }));
    await h.controller.signIn('development-only');
    expect(h.controller.getCredential()).toBe('development-only');
    expect(h.raw()).toBeNull();
  });
  it('sign-out wins over a late restore response', async () => {
    const h = harness();
    await h.controller.signIn(token, options);
    const response = deferred<SessionResponse>();
    const restarted = createSessionController({
      store: h.store,
      verify: () => response.promise,
      revoke: h.revoke,
    });
    const restore = restarted.restore();
    await Promise.resolve();
    await Promise.resolve();
    await restarted.signOut();
    response.resolve(identity);
    await restore;
    expect(restarted.getSnapshot().session).toBeNull();
    expect(h.raw()).toBeNull();
  });
  it('sign-out queues deletion behind a slow save so the old login cannot return', async () => {
    const h = harness();
    const writing = deferred<void>();
    const entered = deferred<void>();
    const write = h.driver.write;
    h.driver.write = async (v) => {
      entered.resolve();
      await writing.promise;
      await write(v);
    };
    const signingIn = h.controller.signIn(token, options);
    await entered.promise;
    const signingOut = h.controller.signOut();
    expect(h.controller.getSnapshot().session).toBeNull();
    writing.resolve();
    await Promise.all([signingIn, signingOut]);
    expect(h.raw()).toBeNull();
    expect(h.controller.getCredential()).toBeUndefined();
  });
  it('sign-out clears local access even offline and calls server revocation', async () => {
    const h = harness();
    await h.controller.signIn(token, options);
    h.revoke.mockRejectedValue(new Error('offline'));
    await h.controller.signOut();
    expect(h.raw()).toBeNull();
    expect(h.controller.getCredential()).toBeUndefined();
    expect(h.revoke).toHaveBeenCalledWith(token);
  });
  it('reports failed durable sign-out and lets the user retry deletion', async () => {
    const h = harness();
    await h.controller.signIn(token, options);
    const remove = h.driver.remove;
    h.driver.remove = async () => {
      throw new Error('locked');
    };
    await h.controller.signOut();
    expect(h.controller.getSnapshot().cleanupPending).toBe(true);
    expect(h.controller.getCredential()).toBeUndefined();
    h.driver.remove = remove;
    await h.controller.signOut();
    expect(h.raw()).toBeNull();
    expect(h.controller.getSnapshot().cleanupPending).toBe(false);
  });
  it('ignores an old account’s late 401 but expires the current credential on 401', async () => {
    let active = identity;
    const h = harness(async () => active);
    await h.controller.signIn(token, options);
    const response = deferred<Response>();
    const guarded = h.controller.guardFetch(() => response.promise);
    const pending = guarded('https://api.example.test/v1/session', {
      headers: { Authorization: `Bearer ${token}` },
    });
    active = other;
    const next = 'b'.repeat(43);
    await h.controller.signIn(next, options);
    response.resolve(new Response(null, { status: 401 }));
    await pending;
    expect(h.controller.getCredential()).toBe(next);
    await h.controller.guardFetch(async () => new Response(null, { status: 401 }))(
      'https://api.example.test/v1/session',
      { headers: { Authorization: `Bearer ${next}` } },
    );
    expect(h.controller.getSnapshot().session).toBeNull();
    await h.controller.signOut();
    expect(h.raw()).toBeNull();
  });
});
