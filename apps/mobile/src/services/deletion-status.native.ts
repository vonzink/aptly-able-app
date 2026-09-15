import * as SecureStore from 'expo-secure-store';
import { createDeletionStatusStore } from '../features/privacy/deletion-status-store';
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
export const deletionStatusStore = createDeletionStatusStore(
  {
    read: (key) => SecureStore.getItemAsync(key, options),
    write: (key, value) => SecureStore.setItemAsync(key, value, options),
    remove: (key) => SecureStore.deleteItemAsync(key, options),
  },
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4100',
);
