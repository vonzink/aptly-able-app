import * as SecureStore from 'expo-secure-store';
import { createSessionStore } from '@aptly/api-client';
const key = 'aptly-able.account-session.v1';
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
export function createAccountSessionStore(baseUrl: string, mode: string) {
  return createSessionStore(
    {
      read: () => SecureStore.getItemAsync(key, options),
      write: (value) => SecureStore.setItemAsync(key, value, options),
      remove: () => SecureStore.deleteItemAsync(key, options),
    },
    baseUrl,
    mode,
  );
}
