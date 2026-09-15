import { createDeletionJournal } from '../features/privacy/account-deletion';
const key = 'aptly-able.last-account-deletion.v1';
export const deletionJournal = createDeletionJournal(
  {
    read: async () => window.localStorage.getItem(key),
    write: async (value) => window.localStorage.setItem(key, value),
  },
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4100',
);
