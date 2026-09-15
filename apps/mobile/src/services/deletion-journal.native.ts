import * as SecureStore from 'expo-secure-store';
import { createDeletionJournal } from '../features/privacy/account-deletion';
const key = 'aptly-able.last-account-deletion.v1';
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
export const deletionJournal = createDeletionJournal(
  {
    read: () => SecureStore.getItemAsync(key, options),
    write: (value) => SecureStore.setItemAsync(key, value, options),
  },
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4100',
);
