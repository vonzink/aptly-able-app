import type { AccountDeletionReceipt } from '@aptly/contracts';

export interface DeletionStatusStore {
  read(requestId: string): Promise<string | null>;
  write(requestId: string, credential: string): Promise<void>;
  clear(requestId: string): Promise<void>;
}
// Only the receipt-specific capability is retained; it cannot authenticate a session
// after acceptance. Never put this credential in a URL, receipt text or diagnostics.
export function createDeletionStatusStore(
  storage: {
    read(key: string): Promise<string | null>;
    write(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
  },
  origin: string,
): DeletionStatusStore {
  const key = (id: string) => {
    if (!/^[a-f\d-]{36}$/i.test(id)) throw new Error('Invalid deletion reference.');
    return `aptly-able.deletion-status.${id}`;
  };
  return {
    async read(id) {
      const raw = await storage.read(key(id));
      if (!raw) return null;
      const value = JSON.parse(raw);
      if (
        value.origin !== origin ||
        value.requestId !== id ||
        !/^[A-Za-z0-9_-]{43}$/.test(value.credential ?? '')
      )
        throw new Error('The saved deletion status access could not be read.');
      return value.credential;
    },
    async write(id, credential) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(credential))
        throw new Error('Invalid deletion status access.');
      await storage.write(key(id), JSON.stringify({ origin, requestId: id, credential }));
    },
    clear: (id) => storage.remove(key(id)),
  };
}
export function deletionTiming(receipt: AccountDeletionReceipt, now = Date.now()) {
  if (receipt.status === 'complete')
    return {
      overdue: false,
      text: receipt.completedAt
        ? `Completed ${new Date(receipt.completedAt).toLocaleDateString()}.`
        : 'The service has confirmed deletion.',
    };
  if (!receipt.expectedCompletionAt)
    return {
      overdue: false,
      text: 'This older request has no recorded completion date. Check status for updates.',
    };
  const date = new Date(receipt.expectedCompletionAt);
  const overdue = now > date.getTime();
  return {
    overdue,
    text: overdue
      ? `The promised completion date (${date.toLocaleDateString()}) has passed. Cleanup is still pending; your request remains open.`
      : `Deletion will be completed by ${date.toLocaleDateString()} (within 7 days of your request).`,
  };
}
