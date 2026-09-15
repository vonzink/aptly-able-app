import { createBrowserSessionStore } from '@aptly/api-client';
export function createAccountSessionStore(baseUrl: string, mode: string) {
  return createBrowserSessionStore(baseUrl, mode, 'aptly-able.mobile-account-session.v1');
}
