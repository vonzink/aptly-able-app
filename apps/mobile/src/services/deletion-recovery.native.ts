import * as SecureStore from 'expo-secure-store';
import { createDeletionRecoveryStore } from '../features/privacy/deletion-recovery-store';
const key = 'aptly-able.account-deletion-recovery.v1';
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
export const deletionRecovery = createDeletionRecoveryStore(
  {
    read: () => SecureStore.getItemAsync(key, options),
    write: (value) => SecureStore.setItemAsync(key, value, options),
    clear: () => SecureStore.deleteItemAsync(key, options),
  },
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4100',
);
