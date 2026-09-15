import type { PlaudNativePort } from './plaud-native-port';

/** Disconnect dispatch alone is not proof that the SDK released its connection. */
export async function disconnectPlaudTransport(
  native: PlaudNativePort,
  wait: <T>(promise: Promise<T>) => Promise<T>,
): Promise<void> {
  let confirm!: () => void;
  const disconnected = new Promise<void>((resolve) => {
    confirm = resolve;
  });
  const subscription = native.addListener('connectState', (event) => {
    if (!event.connected && !event.failed) confirm();
  });
  try {
    await wait(native.stopScan());
    await wait(native.disconnect());
    // Depair may already have closed BLE before this listener was installed.
    if (await wait(native.isConnected())) {
      await wait(disconnected);
      if (await wait(native.isConnected())) throw new Error('Recorder is still connected.');
    }
  } finally {
    subscription.remove();
  }
}
