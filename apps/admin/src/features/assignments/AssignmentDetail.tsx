import { useState } from 'react';
import type { EnrollmentPlatform } from '@aptly/contracts';
import type { Workspace } from './use-workspace';
import { dateLabel, invitationState, recorderName } from './presentation';
import { Confirmation } from '../../ui/Confirmation';
import { RecorderPhoto } from './RecorderPhoto';
import { SetupLinkFallback } from '../../ui/SetupLinkFallback';
export function AssignmentDetail({ workspace, now }: { workspace: Workspace; now: number }) {
  const [confirm, setConfirm] = useState<'replace' | 'revoke' | 'release' | 'end' | null>(null);
  const [platform, setPlatform] = useState<EnrollmentPlatform>('android');
  const detail = workspace.detail;
  if (!detail)
    return (
      <aside className="detail-empty panel">
        <img src="/plaud-recorder.png" alt="" />
        <h2>A clear start for every recorder</h2>
        <p>
          Select a recorder to manage it. The assigned person can also sign in directly in the phone
          app.
        </p>
      </aside>
    );
  const state = invitationState(detail.latestInvitation, now);
  const qr =
    workspace.invitation?.id === detail.latestInvitation?.id && state === 'Ready to scan'
      ? workspace.invitation
      : null;
  const opensInstalledApp = qr?.enrollmentUrl.startsWith('aptlyable://enroll#') ?? false;
  const active = detail.status === 'active';
  const askIssue = () =>
    detail.latestInvitation ? setConfirm('replace') : void workspace.issue(platform);
  const confirmAction = () => {
    const action = confirm;
    setConfirm(null);
    if (action === 'replace') void workspace.issue(platform);
    if (action === 'revoke') void workspace.revoke();
    if (action === 'release') void workspace.end('released');
    if (action === 'end') void workspace.end('revoked');
  };
  return (
    <aside className="detail panel" aria-label="Selected assignment">
      <div className="detail-identity">
        <div>
          <span className="person-label">Assigned to</span>
          <h2>{detail.user.displayName}</h2>
          <p>
            {recorderName(detail.recorder.model)}
            <br />
            <span>•••• {detail.recorder.serialSuffix}</span>
          </p>
        </div>
        <RecorderPhoto model={detail.recorder.model} />
      </div>
      <div className="detail-body">
        {active && (
          <div className="invitation">
            <h3>Continue in the phone app</h3>
            <p>
              Open Aptly Able and sign in with the assigned person’s account. This recorder will
              appear there automatically.
            </p>
            {detail.latestOperation?.status === 'revoked' && (
              <p className="error">
                Setup access was revoked. Create a new invitation below to restore access.
              </p>
            )}
            <a className="button primary full" href="aptlyable://recorder">
              Open Aptly Able
            </a>
            <a className="text-button" href="/enroll">
              Need to install the app?
            </a>
          </div>
        )}
        <details
          className="install-help"
          key={detail.id}
          open={detail.latestOperation?.status === 'revoked' || Boolean(qr) ? true : undefined}
        >
          <summary>Invitation link & QR options</summary>
          <div className="section-heading">
            <h3>Phone setup</h3>
            <span className={`status status-${state.toLowerCase().replaceAll(' ', '-')}`}>
              {state}
            </span>
          </div>
          {qr ? (
            <div className="invitation">
              <a className="button primary full" href={qr.enrollmentUrl}>
                Continue on this phone
              </a>
              <p>Using a computer? Scan this QR with your phone camera instead.</p>
              <img
                className="qr"
                src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr.qrSvg)}`}
                alt={`Enrollment QR for ${detail.user.displayName}`}
              />
              <p>
                {opensInstalledApp
                  ? 'Scan with your phone camera to open the installed Aptly Able app.'
                  : `Scan with your ${platform === 'android' ? 'Android phone' : 'iPhone'} to install Aptly Able and continue setup.`}
              </p>
              <p className="fineprint">Expires {dateLabel(qr.expiresAt)}</p>
              <SetupLinkFallback key={qr.id} link={qr.enrollmentUrl} />
            </div>
          ) : (
            <div className="invitation-placeholder">
              <span className="qr-mark" aria-hidden="true">
                ▦
              </span>
              <p>
                {state === 'Claimed'
                  ? 'The invitation was accepted. Check the phone app for Bluetooth connection status.'
                  : state === 'Ready to scan'
                    ? 'The QR is only shown when it is created. Generate a new invitation to show it again.'
                    : active
                      ? 'Create a private invitation for this person to begin recorder setup.'
                      : 'This assignment has ended. Create a new assignment to start again.'}
              </p>
            </div>
          )}
          {active && (
            <>
              <fieldset className="platform-picker" disabled={workspace.busy}>
                <legend>Phone for this invitation</legend>
                {(['android', 'ios'] as const).map((value) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="qr-platform"
                      checked={platform === value}
                      onChange={() => {
                        setPlatform(value);
                        workspace.clearInvitation();
                      }}
                    />
                    {value === 'android' ? 'Android' : 'iPhone / iOS'}
                  </label>
                ))}
              </fieldset>
              <button className="primary full" onClick={askIssue} disabled={workspace.busy}>
                {detail.latestInvitation
                  ? 'Create replacement setup link & QR'
                  : 'Create setup link & QR'}
              </button>
              {detail.latestInvitation && !detail.latestInvitation.revokedAt && (
                <button
                  className="text-button danger-text full"
                  onClick={() => setConfirm('revoke')}
                  disabled={workspace.busy}
                >
                  Revoke invitation
                </button>
              )}
            </>
          )}
        </details>
        <div className="setup-note">
          <span className="step-dot">1</span>
          <div>
            <strong>
              {detail.latestOperation?.status === 'pending'
                ? 'Setup saved'
                : detail.latestOperation?.status === 'revoked'
                  ? 'Setup revoked'
                  : 'Ready for phone setup'}
            </strong>
            <p>
              {detail.latestOperation?.status === 'pending'
                ? 'Open Recorder in the Aptly Able phone app to connect over Bluetooth.'
                : 'The assigned person can sign in directly in the phone app, or use an invitation link.'}
            </p>
          </div>
        </div>
        <dl>
          <div>
            <dt>Assignment</dt>
            <dd className="capitalize">{detail.status}</dd>
          </div>
          <div>
            <dt>Assigned</dt>
            <dd>{dateLabel(detail.assignedAt)}</dd>
          </div>
        </dl>
        {active && (
          <div className="end-actions">
            <button
              className="text-button"
              disabled={workspace.busy}
              onClick={() => setConfirm('release')}
            >
              Release recorder
            </button>
            <button
              className="text-button danger-text"
              disabled={workspace.busy}
              onClick={() => setConfirm('end')}
            >
              Revoke assignment
            </button>
          </div>
        )}
      </div>
      {confirm && (
        <Confirmation
          title={
            confirm === 'replace'
              ? 'Replace the invitation?'
              : confirm === 'revoke'
                ? 'Revoke this invitation?'
                : 'End this assignment?'
          }
          copy={
            confirm === 'replace'
              ? 'Unused invitations for this assignment will stop working. An already claimed setup stays active.'
              : confirm === 'revoke'
                ? 'This QR will stop working. Any pending setup started with it will be revoked.'
                : 'Unpair the recorder in the phone app first. Ending this assignment revokes its invitations and setup access.'
          }
          action={
            confirm === 'replace'
              ? 'Generate replacement'
              : confirm === 'revoke'
                ? 'Revoke invitation'
                : confirm === 'release'
                  ? 'Release recorder'
                  : 'Revoke assignment'
          }
          onCancel={() => setConfirm(null)}
          onConfirm={confirmAction}
        />
      )}
    </aside>
  );
}
