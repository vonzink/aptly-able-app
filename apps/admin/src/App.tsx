import { lazy, Suspense, useMemo } from 'react';
import { createApiClient } from '@aptly/api-client';
import { useAccountSession } from './features/session/use-account-session';
import { AccountAccess } from './features/session/AccountAccess';
import { Dashboard } from './features/assignments/Dashboard';
import { InstallationPage } from './features/installation/InstallationPage';
import { LegalPage } from './features/legal/LegalPage';
const FieldSenseDemo = lazy(() => import('./features/fieldsense-demo/FieldSenseDemo'));
const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4100';
function WorkspaceApp() {
  const { controller, state } = useAccountSession(baseUrl);
  const session = state.session;
  const api = useMemo(
    () =>
      session
        ? createApiClient({
            baseUrl,
            getCredential: () =>
              controller.getSnapshot().session === session ? controller.getCredential() : undefined,
            fetch: controller.guardFetch(),
            ...(session.identity.mode === 'pilot' ? { workspace: 'self' as const } : {}),
          })
        : null,
    [controller, session],
  );
  if (state.phase === 'restoring' || state.phase === 'restore-error' || state.cleanupPending)
    return (
      <main className="access-page">
        <section className="access-panel">
          <div className="access-form">
            <h1>
              {state.cleanupPending
                ? 'Finish signing out'
                : state.phase === 'restore-error'
                  ? 'Sign-in could not be restored'
                  : 'Restoring your sign-in'}
            </h1>
            <p role={state.phase === 'restoring' ? 'status' : 'alert'}>
              {state.message ?? 'Checking your saved sign-in…'}
            </p>
            {state.phase === 'restore-error' && (
              <button className="primary" onClick={() => void controller.restore()}>
                Retry
              </button>
            )}
            {state.phase !== 'restoring' && (
              <button className="text-button" onClick={() => void controller.signOut()}>
                {state.cleanupPending ? 'Retry sign out' : 'Sign in with another account'}
              </button>
            )}
          </div>
        </section>
      </main>
    );
  if (!session || !api)
    return (
      <AccountAccess
        baseUrl={baseUrl}
        message={state.message}
        onAccess={(credential, _identity, details) => controller.signIn(credential, details)}
      />
    );
  return (
    <>
      {state.message && (
        <p role="status" className="notice notice-neutral">
          {state.message}
        </p>
      )}
      <Dashboard
        key={session.identity.user.id}
        api={api}
        pilot={session.identity.mode === 'pilot'}
        onSignOut={() => {
          if (controller.getSnapshot().session === session) void controller.signOut();
        }}
      />
    </>
  );
}
export default function App() {
  const path = window.location.pathname.replace(/\/$/, '');
  if (path === '/privacy' || path === '/support')
    return <LegalPage page={path === '/privacy' ? 'privacy' : 'support'} />;
  if (path === '/dashboard')
    return (
      <Suspense
        fallback={
          <main className="demo-loading" role="status">
            Opening dashboard demo…
          </main>
        }
      >
        <FieldSenseDemo />
      </Suspense>
    );
  return path === '/enroll' ? <InstallationPage /> : <WorkspaceApp />;
}
