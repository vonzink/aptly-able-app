import type {
  EnrollmentJournal,
  EnrollmentJournalStore,
} from '../features/enrollment/enrollment-controller';

const key = 'aptly-able.enrollment-journal.v1';

function storage(): Storage {
  if (typeof window === 'undefined') throw new Error('Session storage is unavailable.');
  return window.sessionStorage;
}

export const enrollmentJournal: EnrollmentJournalStore = {
  async load() {
    const raw = storage().getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isJournal(parsed)) {
      storage().removeItem(key);
      return null;
    }
    return parsed;
  },
  async save(value) {
    storage().setItem(key, JSON.stringify(value));
  },
  async clear() {
    storage().removeItem(key);
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
