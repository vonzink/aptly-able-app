import { describe, expect, it, vi } from 'vitest';
import {
  createDeletionStatusStore,
  deletionTiming,
} from '../src/features/privacy/deletion-status-store';
import {
  createDeletionJournal,
  refreshAccountDeletionStatus,
  type DeletionRecord,
} from '../src/features/privacy/account-deletion';
const record: DeletionRecord = {
  actorId: 'alice',
  localCleanup: 'complete',
  receipt: {
    requestId: 'a029f5bb-e164-4252-9d22-a294b88a977e',
    status: 'pending',
    requestedAt: '2026-09-15T12:00:00.000Z',
    expectedCompletionAt: '2026-09-22T12:00:00.000Z',
    pendingWork: ['provider_erasure'],
  },
};
describe('ongoing deletion status', () => {
  it.each(['account changed', 'wrong reference'])('does not save status if %s', async (failure) => {
    let actor: string | null = null;
    const write = vi.fn();
    const clear = vi.fn();
    await expect(
      refreshAccountDeletionStatus({
        record,
        journal: { read: async () => record, write },
        statusStore: { read: async () => 'a'.repeat(43), write: vi.fn(), clear },
        currentActor: () => actor,
        createClient: () => ({
          requestDeletion: vi.fn(),
          getDeletionStatus: async () => {
            if (failure === 'account changed') actor = 'bob';
            return {
              ...record.receipt,
              requestId:
                failure === 'wrong reference'
                  ? 'b029f5bb-e164-4252-9d22-a294b88a977e'
                  : record.receipt.requestId,
            };
          },
        }),
      }),
    ).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });
  it('confirms completion after sign-out without resubmitting or needing support', async () => {
    let saved = record;
    const statusStore = { read: vi.fn(async () => 'a'.repeat(43)), write: vi.fn(), clear: vi.fn() };
    const client = {
      getDeletionStatus: vi.fn(async () => ({
        ...record.receipt,
        status: 'complete' as const,
        completedAt: '2026-09-16T12:00:00.000Z',
        pendingWork: [],
      })),
      requestDeletion: vi.fn(),
    };
    const result = await refreshAccountDeletionStatus({
      record,
      journal: {
        read: async () => saved,
        write: async (r) => {
          saved = r;
        },
      },
      statusStore,
      createClient: () => client,
      currentActor: () => null,
    });
    expect(result.receipt.status).toBe('complete');
    expect(saved).toEqual(result);
    expect(client.requestDeletion).not.toHaveBeenCalled();
    expect(statusStore.clear).toHaveBeenCalledWith(record.receipt.requestId);
  });
  it('keeps access if persisting the completion receipt fails', async () => {
    const statusStore = { read: async () => 'a'.repeat(43), write: vi.fn(), clear: vi.fn() };
    await expect(
      refreshAccountDeletionStatus({
        record,
        journal: {
          read: async () => record,
          write: async () => {
            throw new Error('disk');
          },
        },
        statusStore,
        createClient: () => ({
          requestDeletion: vi.fn(),
          getDeletionStatus: async () => ({
            ...record.receipt,
            status: 'complete',
            pendingWork: [],
          }),
        }),
        currentActor: () => null,
      }),
    ).rejects.toThrow('disk');
    expect(statusStore.clear).not.toHaveBeenCalled();
  });
  it('rejects status for a different signed-in account', async () => {
    const get = vi.fn();
    await expect(
      refreshAccountDeletionStatus({
        record,
        journal: { read: async () => record, write: vi.fn() },
        statusStore: { read: get, write: vi.fn(), clear: vi.fn() },
        createClient: vi.fn(),
        currentActor: () => 'bob',
      }),
    ).rejects.toThrow('account');
    expect(get).not.toHaveBeenCalled();
  });
  it('never labels an overdue request complete', () => {
    expect(deletionTiming(record.receipt, Date.parse('2026-09-23')).overdue).toBe(true);
    expect(deletionTiming(record.receipt, Date.parse('2026-09-23')).text).toContain(
      'still pending',
    );
  });
  it('keeps older receipts when another account deletes on the same phone', async () => {
    let raw: string | null = null;
    const journal = createDeletionJournal(
      {
        read: async () => raw,
        write: async (value) => {
          raw = value;
        },
      },
      'https://api.example',
    );
    await journal.write(record);
    await journal.write({
      ...record,
      actorId: 'bob',
      receipt: { ...record.receipt, requestId: 'b029f5bb-e164-4252-9d22-a294b88a977e' },
    });
    expect((await journal.list()).length).toBe(2);
  });
  it('isolates retained status credentials by service and request', async () => {
    const values = new Map<string, string>();
    const storage = {
      read: async (key: string) => values.get(key) ?? null,
      write: async (key: string, val: string) => {
        values.set(key, val);
      },
      remove: async (key: string) => {
        values.delete(key);
      },
    };
    const store = createDeletionStatusStore(storage, 'https://one.example');
    await store.write(record.receipt.requestId, 'a'.repeat(43));
    expect(await store.read(record.receipt.requestId)).toBe('a'.repeat(43));
    await expect(
      createDeletionStatusStore(storage, 'https://two.example').read(record.receipt.requestId),
    ).rejects.toThrow();
    await store.clear(record.receipt.requestId);
    expect(await store.read(record.receipt.requestId)).toBeNull();
  });
});
