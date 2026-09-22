import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ApiError, createAuthClient, type SignInDetails } from '@aptly/api-client';
import type { SessionResponse } from '@aptly/contracts';
import { AccessScreen } from './AccessScreen';
import { company } from '@aptly/product-content';
import '../legal/legal.css';

export function AccountAccess({
  baseUrl,
  onAccess,
  message,
}: {
  baseUrl: string;
  onAccess(credential: string, session: SessionResponse, details?: SignInDetails): Promise<void>;
  message?: string | null;
}) {
  const auth = useMemo(() => createAuthClient({ baseUrl }), [baseUrl]);
  const [config, setConfig] = useState<{
    pilotEnabled: boolean;
    developmentEnabled: boolean;
  } | null>(null);
  const [mode, setMode] = useState<'login' | 'register' | 'development'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void auth
      .config({ signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setConfig(value);
          if (!value.pilotEnabled && value.developmentEnabled) setMode('development');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('Cannot reach account setup. Check your connection, then reload this page.');
      });
    return () => {
      controller.abort();
      request.current?.abort();
    };
  }, [auth]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === 'register'
          ? await auth.register({ displayName, email, password }, { signal: controller.signal })
          : await auth.login({ email, password }, { signal: controller.signal });
      if (!controller.signal.aborted) {
        setPassword('');
        await onAccess(result.credential, result.session, {
          expiresAt: result.expiresAt,
          accountEmail: email,
        });
      }
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(failure instanceof ApiError ? failure.message : 'Unable to sign in. Try again.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      request.current = null;
    }
  }
  if (mode === 'development' && config?.developmentEnabled)
    return (
      <AccessScreen
        baseUrl={baseUrl}
        onAccess={(credential, id) =>
          void onAccess(credential, { user: { id, role: 'admin' }, mode: 'development' })
        }
      />
    );
  return (
    <main className="access-page">
      <section className="access-story">
        <img className="brand-logo" src="/aptly-able-logo.png" alt="Aptly Able" />
        <div>
          <p className="small-label">Your recorder workspace</p>
          <h1>
            <span>Great conversations.</span> <span>A simple start.</span>
          </h1>
          <p>
            Install Aptly Able and set up your recorder on your phone. Or sign in here to manage
            your recorders.
          </p>
        </div>
        <a className="button primary" href="/enroll">
          Get the phone app
        </a>
        <div className="access-product">
          <img src="/plaud-recorder.png" alt="Plaud recorder" />
          <span>One account for your dashboard and phone.</span>
        </div>
      </section>
      <section className="access-panel">
        <div className="access-form">
          <span className="environment">Aptly Able pilot</span>
          <h2>{mode === 'register' ? 'Create your account' : 'Welcome back'}</h2>
          <p>
            {mode === 'register'
              ? 'Create an account for the website and phone app.'
              : 'Use the same account as the Aptly Able phone app.'}
          </p>
          {!config ? (
            <p role="status">{error ?? 'Connecting to account setup…'}</p>
          ) : !config.pilotEnabled ? (
            <p className="notice notice-neutral">
              Account creation is not available on this server yet.
            </p>
          ) : (
            <form onSubmit={(event) => void submit(event)}>
              {mode === 'register' && (
                <div className="form-field">
                  <label htmlFor="display-name">Your name</label>
                  <input
                    id="display-name"
                    autoComplete="name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    maxLength={120}
                    required
                    disabled={busy}
                  />
                </div>
              )}
              <div className="form-field">
                <label htmlFor="email">Email address</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  disabled={busy}
                />
              </div>
              <div className="form-field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  aria-describedby={mode === 'register' ? 'password-help' : undefined}
                  minLength={mode === 'register' ? 12 : 1}
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  disabled={busy}
                />
                {mode === 'register' && (
                  <p id="password-help" className="fineprint">
                    Use at least 12 characters. Keep your password: password reset is not available
                    in this pilot.
                  </p>
                )}
              </div>
              {(error || message) && (
                <div role="alert" className="error">
                  {error ?? message}
                </div>
              )}
              <button className="primary" disabled={busy}>
                {busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}
              </button>
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setMode(mode === 'register' ? 'login' : 'register');
                  setError(null);
                  setPassword('');
                }}
              >
                {mode === 'register'
                  ? 'Already have an account? Sign in'
                  : 'New here? Create an account'}
              </button>
            </form>
          )}
          {config?.developmentEnabled && (
            <button className="text-button" onClick={() => setMode('development')}>
              Local administrator access
            </button>
          )}
          <nav className="account-legal-links" aria-label="Privacy and support">
            <a href="/privacy">Privacy</a>
            <a href={company.termsUrl}>Terms</a>
            <a href="/support">Help & support</a>
          </nav>
        </div>
      </section>
    </main>
  );
}
