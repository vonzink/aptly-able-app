import { createDeletionRecoveryStore } from '../src/features/privacy/deletion-recovery-store';
import { describe, expect, it, vi } from 'vitest';
import type { AccountDeletionReceipt } from '@aptly/contracts';
import {
  createDeletionJournal,
  removeAccountRecordings,
  submitAccountDeletion,
  recoverAccountDeletion,
  type DeletionRecord,
  type DeletionRecoveryIntent,
} from '../src/features/privacy/account-deletion';
import type { RecordingsController } from '../src/features/recordings/recordings-controller';

const receipt: AccountDeletionReceipt = {
  requestId: 'a029f5bb-e164-4252-9d22-a294b88a977e',
  requestedAt: '2026-09-15T12:00:00.000Z',
  status: 'pending',
  pendingWork: ['service_data', 'provider_erasure', 'backup_retention'],
};
function setup() {
  const events: string[] = [];
  let actor: string | null = 'alice';
  let saved: DeletionRecord | null = null;
  let recoveryIntent: DeletionRecoveryIntent | null = null;
  const input = {
    credential: 'a'.repeat(43),
    statusStore: {
      read: vi.fn(async () => 'a'.repeat(43)),
      write: vi.fn(async () => {}),
      clear: vi.fn(async () => {}),
    },
    recovery: {
      read: vi.fn(async () => recoveryIntent),
      write: vi.fn(async (intent: DeletionRecoveryIntent) => {
        recoveryIntent = intent;
      }),
      clear: vi.fn(async () => {
        recoveryIntent = null;
      }),
    },
    client: {
      requestDeletion: vi.fn(async () => receipt),
      getDeletionStatus: vi.fn(async (): Promise<AccountDeletionReceipt> => {
        throw new Error('No request');
      }),
    },
    password: 'correct password',
    confirmation: 'DELETE',
    actorId: 'alice',
    currentActor: () => actor,
    journal: {
      read: vi.fn(async () => saved),
      write: vi.fn(async (value: DeletionRecord) => {
        saved = value;
        events.push(`saved:${value.localCleanup}`);
      }),
    },
    signOut: vi.fn(async () => {
      actor = null;
      events.push('signed-out');
    }),
    cleanLocal: vi.fn(async (id: string) => {
      events.push(`clean:${id}`);
    }),
    onAccepted: vi.fn(),
  };
  return {
    input,
    events,
    getRecovery: () => recoveryIntent,
    setActor: (value: string | null) => {
      actor = value;
    },
  };
}
describe('account deletion workflow', () => {
  it('saves the receipt and signs out before cleaning only the original account', async () => {
    const { input, events } = setup();
    const result = await submitAccountDeletion(input);
    expect(events).toEqual(['saved:pending', 'signed-out', 'clean:alice', 'saved:complete']);
    expect(result.record.receipt.status).toBe('pending');
    expect(result.record.localCleanup).toBe('complete');
    expect(result.warning).toBeNull();
  });
  it('does not erase or sign out when reauthentication fails', async () => {
    const { input } = setup();
    input.client.requestDeletion.mockRejectedValue(new Error('Wrong password'));
    await expect(submitAccountDeletion(input)).rejects.toThrow('Wrong password');
    expect(input.signOut).not.toHaveBeenCalled();
    expect(input.cleanLocal).not.toHaveBeenCalled();
    expect(input.journal.write).not.toHaveBeenCalled();
  });
  it('recovers a lost POST response using the original credential receipt', async () => {
    const { input } = setup();
    input.client.requestDeletion.mockRejectedValue(new Error('Network lost'));
    input.client.getDeletionStatus.mockResolvedValue(receipt);
    expect((await submitAccountDeletion(input)).record.receipt).toEqual(receipt);
    expect(input.client.requestDeletion).toHaveBeenCalledTimes(1);
  });
  it('blocks account switching while preflight storage is being read', async () => {
    const { input, setActor } = setup();
    input.journal.read.mockImplementation(async () => {
      setActor('bob');
      return null;
    });
    await expect(submitAccountDeletion(input)).rejects.toThrow('sign-in changed');
    expect(input.client.requestDeletion).not.toHaveBeenCalled();
  });
  it('does not sign out a replacement account when the deletion returns', async () => {
    const { input, setActor } = setup();
    input.client.requestDeletion.mockImplementation(async () => {
      setActor('bob');
      return receipt;
    });
    await submitAccountDeletion(input);
    expect(input.signOut).not.toHaveBeenCalled();
    expect(input.cleanLocal).toHaveBeenCalledWith('alice');
  });
  it('keeps a retryable local job when local removal fails', async () => {
    const { input } = setup();
    input.cleanLocal.mockRejectedValue(new Error('Disk locked'));
    const result = await submitAccountDeletion(input);
    expect(result.record.localCleanup).toBe('pending');
    expect(result.warning).toContain('Disk locked');
    expect(input.signOut).toHaveBeenCalledOnce();
  });
  it('still signs out and reports the receipt if journal storage fails after acceptance', async () => {
    const { input } = setup();
    input.journal.write.mockRejectedValue(new Error('Storage unavailable'));
    const result = await submitAccountDeletion(input);
    expect(result.warning).toContain('Copy the reference');
    expect(input.signOut).toHaveBeenCalledOnce();
    expect(input.onAccepted).toHaveBeenCalled();
  });
  it('requires literal confirmation before sending a request', async () => {
    const { input } = setup();
    await expect(submitAccountDeletion({ ...input, confirmation: 'delete' })).rejects.toThrow(
      'type DELETE',
    );
    expect(input.client.requestDeletion).not.toHaveBeenCalled();
  });
});
describe('local account cleanup', () => {
  function library(unavailableCount = 0) {
    return {
      clearAccountLocations: vi.fn(async (_actorId: string) => {}),
      reload: vi.fn(async () => {}),
      getSnapshot: () => ({
        readable: true,
        error: null,
        unavailableCount,
        recordings: [
          { id: 'a', source: { actorId: 'alice' } },
          { id: 'b', source: { actorId: 'bob' } },
          { id: 'manual' },
        ],
      }),
      remove: vi.fn(async () => true),
    };
  }
  it('preserves other accounts and manually imported files', async () => {
    const fake = library();
    await removeAccountRecordings(fake as unknown as RecordingsController, 'alice');
    expect(fake.remove.mock.calls).toEqual([['a']]);
    expect(fake.clearAccountLocations).toHaveBeenCalledWith('alice');
  });
  it('does not claim completion with unreadable library entries', async () => {
    const fake = library(1);
    await expect(
      removeAccountRecordings(fake as unknown as RecordingsController, 'alice'),
    ).rejects.toThrow('Some local files');
  });
});
it('receipt storage rejects corruption and isolates API origins', async () => {
  let value: string | null = null;
  const storage = {
    read: async () => value,
    write: async (next: string) => {
      value = next;
    },
  };
  const journal = createDeletionJournal(storage, 'https://api.example.com');
  await journal.write({ actorId: 'alice', receipt, localCleanup: 'pending' });
  expect((await journal.read())?.receipt).toEqual(receipt);
  expect(await createDeletionJournal(storage, 'https://other.example.com').read()).toBeNull();
  value = '{}';
  expect(await journal.read()).toBeNull();
  value = '{';
  await expect(journal.read()).rejects.toThrow();
});

describe('durable deletion recovery', () => {
  it('retains recovery if saving ongoing status access fails', async () => {
    const { input, getRecovery } = setup();
    input.statusStore.write.mockRejectedValue(new Error('Keychain locked'));
    const result = await submitAccountDeletion(input);
    expect(result.warning).toContain('Status access could not be saved');
    expect(getRecovery()?.credential).toBe(input.credential);
    expect(input.recovery.clear).not.toHaveBeenCalled();
  });
  it('blocks a new deletion if an older receipt still needs another account cleanup', async () => {
    const { input } = setup();
    const older: DeletionRecord = { actorId: 'bob', receipt, localCleanup: 'pending' };
    const latest: DeletionRecord = {
      actorId: 'carol',
      receipt: { ...receipt, requestId: '71e5d9f2-b059-410e-b617-5d1c104d401d' },
      localCleanup: 'complete',
    };
    input.journal.read.mockResolvedValue(latest);
    await expect(
      submitAccountDeletion({
        ...input,
        journal: { ...input.journal, list: async () => [latest, older] },
      }),
    ).rejects.toThrow('Local cleanup');
    expect(input.client.requestDeletion).not.toHaveBeenCalled();
  });
  it('persists intent before POST and clears it only after saving the receipt', async () => {
    const { input, getRecovery } = setup();
    input.client.requestDeletion.mockImplementation(async () => {
      expect(getRecovery()).toEqual({ actorId: 'alice', credential: input.credential });
      return receipt;
    });
    input.recovery.clear.mockImplementation(async () => {
      expect(input.journal.write).toHaveBeenCalled();
    });
    await submitAccountDeletion(input);
  });
  it('never sends POST if secure intent persistence fails', async () => {
    const { input } = setup();
    input.recovery.write.mockRejectedValue(new Error('Secure store locked'));
    await expect(submitAccountDeletion(input)).rejects.toThrow('Secure store locked');
    expect(input.client.requestDeletion).not.toHaveBeenCalled();
  });
  it('recovers interrupted acceptance using GET after normal session credentials are gone', async () => {
    const { input, getRecovery, setActor } = setup();
    input.client.requestDeletion.mockRejectedValue(new Error('Connection lost'));
    await expect(submitAccountDeletion(input)).rejects.toThrow('Connection lost');
    expect(getRecovery()?.credential).toBe(input.credential);
    setActor(null);
    const recoveredClient = {
      requestDeletion: vi.fn(),
      getDeletionStatus: vi.fn(async () => receipt),
    };
    const createClient = vi.fn(() => recoveredClient);
    const result = await recoverAccountDeletion({ ...input, createClient });
    expect(createClient).toHaveBeenCalledWith(input.credential);
    expect(recoveredClient.requestDeletion).not.toHaveBeenCalled();
    expect(input.signOut).not.toHaveBeenCalled();
    expect(input.cleanLocal).toHaveBeenCalledWith('alice');
    expect(result?.record.receipt).toEqual(receipt);
    expect(getRecovery()).toBeNull();
  });
  it('retains recovery through receipt persistence failure and removes it after recovery saves', async () => {
    const { input, getRecovery } = setup();
    input.journal.write.mockRejectedValue(new Error('Receipt disk failure'));
    await submitAccountDeletion(input);
    expect(getRecovery()).not.toBeNull();
    expect(input.recovery.clear).not.toHaveBeenCalled();
  });
  it('retains ambiguous failures but clears confirmed rejection with no receipt', async () => {
    const { input, getRecovery } = setup();
    input.client.requestDeletion.mockRejectedValue({ status: 401 });
    input.client.getDeletionStatus.mockRejectedValue({ status: 401 });
    await expect(submitAccountDeletion(input)).rejects.toEqual({ status: 401 });
    expect(getRecovery()).toBeNull();
    input.client.requestDeletion.mockRejectedValue({ status: 503 });
    await expect(submitAccountDeletion(input)).rejects.toEqual({ status: 503 });
    expect(getRecovery()).not.toBeNull();
  });
  it('rejects concurrent screen workflows and preserves the first pending intent', async () => {
    const first = setup(),
      second = setup();
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    first.input.client.requestDeletion.mockImplementation(async () => {
      entered();
      await waiting;
      return receipt;
    });
    const running = submitAccountDeletion(first.input);
    await started;
    await expect(submitAccountDeletion(second.input)).rejects.toThrow('already running');
    await expect(
      recoverAccountDeletion({ ...second.input, createClient: () => second.input.client }),
    ).rejects.toThrow('already running');
    expect(second.input.recovery.write).not.toHaveBeenCalled();
    release();
    await running;
  });
  it('does not overwrite another actor recovery intent', async () => {
    const { input } = setup();
    await input.recovery.write({ actorId: 'bob', credential: 'b'.repeat(43) });
    await expect(submitAccountDeletion(input)).rejects.toThrow('earlier account deletion');
    expect(input.client.requestDeletion).not.toHaveBeenCalled();
  });
  it('isolates recovery service origin and refuses corrupt or cross-account overwrite', async () => {
    let saved: string | null = null;
    const storage = {
      read: async () => saved,
      write: async (value: string) => {
        saved = value;
      },
      clear: async () => {
        saved = null;
      },
    };
    const store = createDeletionRecoveryStore(storage, 'https://one.example');
    await store.write({ actorId: 'alice', credential: 'a'.repeat(43) });
    await expect(
      createDeletionRecoveryStore(storage, 'https://two.example').read(),
    ).rejects.toThrow('another service');
    await expect(store.write({ actorId: 'bob', credential: 'b'.repeat(43) })).rejects.toThrow(
      'Another account',
    );
    saved = '{}';
    await expect(store.read()).rejects.toThrow();
  });
});
it('local retry cannot overwrite a newer request receipt', async () => {
  const { retryAccountLocalCleanup } = await import('../src/features/privacy/account-deletion');
  const { input } = setup();
  await input.journal.write({
    actorId: 'alice',
    receipt: { ...receipt, requestId: '71e5d9f2-b059-410e-b617-5d1c104d401d' },
    localCleanup: 'pending',
  });
  await expect(
    retryAccountLocalCleanup({
      ...input,
      record: { actorId: 'alice', receipt, localCleanup: 'pending' },
    }),
  ).rejects.toThrow('request changed');
  expect(input.cleanLocal).not.toHaveBeenCalled();
});
