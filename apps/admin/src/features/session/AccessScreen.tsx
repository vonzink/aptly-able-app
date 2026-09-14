import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, createApiClient } from '@aptly/api-client';

export function AccessScreen({
  baseUrl,
  onAccess,
}: {
  baseUrl: string;
  onAccess: (credential: string, userId: string) => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError(null);
    try {
      const credential = code.trim();
      const session = await createApiClient({ baseUrl, getCredential: () => credential }).session({
        signal: request.signal,
      });
      if (session.user.role !== 'admin')
        throw new ApiError(
          403,
          'FORBIDDEN',
          'Use an administrator access code for this workspace.',
        );
      if (!request.signal.aborted) {
        setCode('');
        onAccess(credential, session.user.id);
      }
    } catch (failure) {
      if (!request.signal.aborted)
        setError(failure instanceof ApiError ? failure.message : 'Unable to sign in. Try again.');
    } finally {
      if (!request.signal.aborted) setBusy(false);
      controller.current = null;
    }
  }
  return (
    <main className="access-page">
      <section className="access-story">
        <img className="brand-logo" src="/aptly-able-logo.png" alt="Aptly Able" />
        <div>
          <p className="small-label">Recorder workspace</p>
          <h1>
            <span>A recorder.</span> <span>A person.</span> <span>Ready to begin.</span>
          </h1>
          <p>
            Give your team a simple start: assign their recorder, share an invitation, and follow
            their setup.
          </p>
        </div>
        <div className="access-product">
          <img src="/plaud-recorder.png" alt="Plaud recorder" />
          <span>One clear path from assignment to enrollment.</span>
        </div>
      </section>
      <section className="access-panel">
        <div className="access-form">
          <span className="environment">Local development</span>
          <h2>Administrator access</h2>
          <p>
            Use your local administrator access code. It stays in this tab and is cleared when you
            sign out.
          </p>
          <form onSubmit={(event) => void submit(event)}>
            <div className="form-field">
              <label htmlFor="admin-code">Administrator access code</label>
              <input
                id="admin-code"
                type="password"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
                disabled={busy}
              />
            </div>
            {error && (
              <div role="alert" className="error">
                {error}
              </div>
            )}
            <button className="primary" disabled={busy || !code.trim()}>
              {busy ? 'Checking access…' : 'Open recorder workspace'}
            </button>
          </form>
          <p className="fineprint">This local access method is only for development.</p>
        </div>
      </section>
    </main>
  );
}
