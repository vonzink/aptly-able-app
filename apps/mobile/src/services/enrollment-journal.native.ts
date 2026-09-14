import * as SecureStore from 'expo-secure-store';

import type {
  EnrollmentJournal,
  EnrollmentJournalStore,
} from '../features/enrollment/enrollment-controller';

const key = 'aptly-able.enrollment-journal.v1';

export const enrollmentJournal: EnrollmentJournalStore = {
  async load() {
    const raw = await SecureStore.getItemAsync(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isJournal(parsed)) {
      await SecureStore.deleteItemAsync(key);
      return null;
    }
    return parsed;
  },
  async save(value) {
    await SecureStore.setItemAsync(key, JSON.stringify(value));
  },
  async clear() {
    await SecureStore.deleteItemAsync(key);
  },
};

function isJournal(value: unknown): value is EnrollmentJournal {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.actorId === 'string' &&
    typeof entry.key === 'string' &&
    (entry.operationId === undefined || typeof entry.operationId === 'string')
  );
}
