import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import {
  createApiClient,
  createAuthClient,
  createBrowserSessionStore,
  createSessionController,
} from '@aptly/api-client';
export function useAccountSession(baseUrl: string) {
  const controller = useMemo(() => {
    const auth = createAuthClient({ baseUrl });
    return createSessionController({
      store: createBrowserSessionStore(baseUrl, 'pilot', 'aptly-able.dashboard-session.v1'),
      verify: (credential, options) =>
        createApiClient({ baseUrl, getCredential: () => credential }).session(options),
      revoke: (credential) => auth.logout(credential),
    });
  }, [baseUrl]);
  const epoch = useRef(0);
  useEffect(() => {
    const own = ++epoch.current;
    void controller.restore();
    const visible = () => {
      if (document.visibilityState === 'visible') controller.checkExpiry();
    };
    window.addEventListener('focus', visible);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('focus', visible);
      document.removeEventListener('visibilitychange', visible);
      queueMicrotask(() => {
        if (epoch.current === own) controller.dispose();
      });
    };
  }, [controller]);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return { controller, state };
}
