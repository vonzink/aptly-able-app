import { createDeletionStatusStore } from '../features/privacy/deletion-status-store';
export const deletionStatusStore = createDeletionStatusStore(
  {
    read: async (key) => window.sessionStorage.getItem(key),
    write: async (key, value) => {
      window.sessionStorage.setItem(key, value);
    },
    remove: async (key) => {
      window.sessionStorage.removeItem(key);
    },
  },
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4100',
);
