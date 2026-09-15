import { createDeletionRecoveryStore } from '../features/privacy/deletion-recovery-store';
const key = 'aptly-able.account-deletion-recovery.v1';
export const deletionRecovery = createDeletionRecoveryStore(
  {
    read: async () => window.sessionStorage.getItem(key),
    write: async (value) => {
      window.sessionStorage.setItem(key, value);
    },
    clear: async () => {
      window.sessionStorage.removeItem(key);
    },
  },
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4100',
);
