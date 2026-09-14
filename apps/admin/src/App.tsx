import { useMemo, useState } from 'react';
import { createApiClient, createAuthClient } from '@aptly/api-client';
import type { SessionResponse } from '@aptly/contracts';
import { AccountAccess } from './features/session/AccountAccess';
import { Dashboard } from './features/assignments/Dashboard';
import { InstallationPage } from './features/installation/InstallationPage';
const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4100';
function WorkspaceApp() {
  const [session, setSession] = useState<{ credential: string; identity: SessionResponse } | null>(
    null,
  );
  const api = useMemo(
    () =>
      session
        ? createApiClient({
            baseUrl,
            getCredential: () => session.credential,
            ...(session.identity.mode === 'pilot' ? { workspace: 'self' as const } : {}),
          })
        : null,
    [session],
  );
  function signOut() {
    if (session?.identity.mode === 'pilot')
      void createAuthClient({ baseUrl })
        .logout(session.credential)
        .catch(() => {});
    setSession(null);
  }
  if (!session || !api)
    return (
      <AccountAccess
        baseUrl={baseUrl}
        onAccess={(credential, identity) => setSession({ credential, identity })}
      />
    );
  return (
    <Dashboard
      key={session.identity.user.id}
      api={api}
      pilot={session.identity.mode === 'pilot'}
      onSignOut={signOut}
    />
  );
}
export default function App() {
  return window.location.pathname.replace(/\/$/, '') === '/enroll' ? (
    <InstallationPage />
  ) : (
    <WorkspaceApp />
  );
}
