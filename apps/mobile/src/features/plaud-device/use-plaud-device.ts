import { useSyncExternalStore } from 'react';

import { usePlaudDeviceController } from '../../bootstrap/AppProviders';

export function usePlaudDevice() {
  const controller = usePlaudDeviceController();
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  return { controller, snapshot };
}
