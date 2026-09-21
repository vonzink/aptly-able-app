import { useEffect, useState } from 'react';
import type { ApiClient } from '@aptly/api-client';
import { useWorkspace } from './use-workspace';
import { invitationState, recorderName } from './presentation';
import { AssignmentForm } from './AssignmentForm';
import { AssignmentDetail } from './AssignmentDetail';
export function Dashboard({
  api,
  onSignOut,
  pilot = false,
}: {
  api: ApiClient;
  onSignOut: () => void;
  pilot?: boolean;
}) {
  const workspace = useWorkspace(api, onSignOut);
  const [showForm, setShowForm] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="workspace">
      <nav className="sidebar" aria-label="Workspace navigation">
        <img className="brand-logo" src="/aptly-able-logo.png" alt="Aptly Able" />
        <div className="nav-section">
          <span>Workspace</span>
          <span className="nav-current" aria-current="page">
            <span aria-hidden="true">▣</span> {pilot ? 'My recorders' : 'Recorder assignments'}
          </span>
        </div>
        <div className="sidebar-note">
          <strong>A simple start.</strong>
          <p>
            {pilot ? 'Add your recorder.' : 'Assign a recorder.'}
            <br />
            {pilot ? 'Open your setup link.' : 'Share an invitation.'}
            <br />
            Follow setup.
          </p>
        </div>
        <span className="environment">{pilot ? 'Aptly Able pilot' : 'Local development'}</span>
      </nav>
      <div className="workspace-main">
        <header className="topbar">
          <span>{pilot ? 'Your recorder workspace' : 'Administrator workspace'}</span>
          <div className="workspace-account-actions">
            <a
              className="workspace-demo-link"
              href="/dashboard"
              target="_blank"
              rel="noopener noreferrer"
            >
              Dashboard<span className="sr-only"> demo (opens in a new tab)</span>
            </a>
            <button className="text-button" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </header>
        <main className="dashboard">
          <div className="page-heading">
            <div>
              <h1>{pilot ? 'Your recorder' : 'Recorder assignments'}</h1>
              <p>
                {pilot
                  ? 'Add your recorder and open its setup link. You can do every step on this phone; a computer is optional.'
                  : 'Give each person a recorder and a clear way to get started.'}
              </p>
            </div>
            <button className="primary" onClick={() => setShowForm(true)} disabled={workspace.busy}>
              <span aria-hidden="true">＋</span> {pilot ? 'Add your recorder' : 'Assign recorder'}
            </button>
          </div>
          {workspace.error && (
            <div className="error" role="alert">
              {workspace.error}
              <button onClick={() => void workspace.refresh()} disabled={workspace.busy}>
                Try again
              </button>
            </div>
          )}
          {workspace.notice && (
            <div className="notice" role="status">
              {workspace.notice}
            </div>
          )}
          {showForm && (
            <AssignmentForm
              workspace={workspace}
              pilot={pilot}
              onClose={() => setShowForm(false)}
            />
          )}
          <div className="dashboard-grid">
            <section className="assignment-list panel" aria-label="Recorder assignments">
              <div className="list-header">
                <h2>Your recorders</h2>
                <button
                  className="text-button"
                  onClick={() => void workspace.refresh()}
                  disabled={workspace.busy}
                >
                  {workspace.busy ? 'Updating…' : 'Refresh'}
                </button>
              </div>
              {workspace.rows.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Person & recorder</th>
                        <th>Invitation</th>
                        <th>Assignment</th>
                        <th>
                          <span className="sr-only">Manage</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspace.rows.map((row) => (
                        <tr
                          key={row.id}
                          className={workspace.detail?.id === row.id ? 'selected' : ''}
                        >
                          <td>
                            <strong>{row.user.displayName}</strong>
                            <span>
                              {recorderName(row.recorder.model)} · •••• {row.recorder.serialSuffix}
                            </span>
                          </td>
                          <td>
                            <span className="status">
                              {invitationState(row.latestInvitation, now)}
                            </span>
                          </td>
                          <td className="capitalize">{row.status}</td>
                          <td>
                            <button
                              className="text-button"
                              aria-label={`Manage ${row.user.displayName} recorder ending ${row.recorder.serialSuffix}`}
                              onClick={() => void workspace.select(row.id)}
                              disabled={workspace.busy}
                            >
                              {workspace.detail?.id === row.id ? 'Selected' : 'Manage'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="list-empty">
                  <img src="/plaud-recorder.png" alt="" />
                  <h3>
                    {workspace.busy ? 'Loading your workspace…' : 'Your first recorder starts here'}
                  </h3>
                  <p>
                    {pilot
                      ? 'Add your NotePin S or Note Pro using its full serial number. Then create a setup link to install and connect the phone app.'
                      : 'Assign a supported Plaud recorder to a person, then create their enrollment invitation.'}
                  </p>
                  {!workspace.busy && (
                    <button onClick={() => setShowForm(true)}>
                      {pilot ? 'Add your recorder' : 'Assign a recorder'}
                    </button>
                  )}
                </div>
              )}
              <div className="list-footer">
                <span>Page {workspace.page}</span>
                <div className="button-row">
                  <button
                    disabled={workspace.busy || workspace.page === 1}
                    onClick={() => void workspace.changePage(workspace.page - 1)}
                  >
                    Previous
                  </button>
                  <button
                    disabled={workspace.busy || !workspace.hasMore}
                    onClick={() => void workspace.changePage(workspace.page + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </section>
            <AssignmentDetail
              key={workspace.detail?.id ?? 'none'}
              workspace={workspace}
              now={now}
            />
          </div>
          <p className="workspace-footnote">
            On your phone, use “Continue on this phone.” On a computer, scan the QR with your phone
            camera. Bluetooth pairing happens in the installed Aptly Able app.
          </p>
        </main>
      </div>
    </div>
  );
}
