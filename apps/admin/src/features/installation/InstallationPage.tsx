import { useState } from 'react';
import { type EnrollmentPlatform } from '@aptly/contracts';
import { installationDownload, installationLink } from './installation-link';
import { SetupLinkFallback } from '../../ui/SetupLinkFallback';

export function InstallationPage() {
  const [link] = useState(() => installationLink(window.location.href));
  const [platform, setPlatform] = useState<EnrollmentPlatform>(link.platform ?? 'android');
  const download = installationDownload(
    platform === 'android'
      ? import.meta.env.VITE_ANDROID_DOWNLOAD_URL
      : import.meta.env.VITE_IOS_TESTFLIGHT_URL,
    platform,
  );
  const name = platform === 'android' ? 'Android' : 'iPhone';
  return (
    <main className="install-page">
      <a href="/" aria-label="Aptly Able dashboard">
        <img className="brand-logo" src="/aptly-able-logo.png" alt="Aptly Able" />
      </a>
      <section className="panel install-card">
        <p className="small-label">Your recorder, ready for you</p>
        <h1>Set up Aptly Able</h1>
        {!link.appUrl ? (
          <>
            <div className="error" role="alert">
              This invitation is incomplete. Scan the QR from your dashboard again.
            </div>
            <a className="button primary" href="/">
              Open dashboard
            </a>
          </>
        ) : (
          <>
            <p>
              You can finish everything on this phone. Keep this page open while you install the
              app, then return to step 2. If the app is already installed, start at step 2.
            </p>
            <fieldset className="platform-picker">
              <legend>Your phone</legend>
              {(['android', 'ios'] as const).map((value) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="install-platform"
                    value={value}
                    checked={platform === value}
                    onChange={() => setPlatform(value)}
                  />
                  {value === 'android' ? 'Android' : 'iPhone / iOS'}
                </label>
              ))}
            </fieldset>
            <ol className="install-steps">
              <li>
                <h2>Install the app</h2>
                {download ? (
                  <>
                    <p>
                      {platform === 'android'
                        ? 'On this phone, tap Download for Android. Open the completed download (aptly-able-android.apk) from your browser’s Downloads and tap Install. Downloading the file alone does not install the app.'
                        : 'Open the invitation in TestFlight and install Aptly Able. Install Apple’s TestFlight app first if prompted.'}
                    </p>
                    <a
                      className="button primary full"
                      href={download}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {platform === 'android' ? 'Download for Android' : 'Install with TestFlight'}
                    </a>
                    {platform === 'android' && (
                      <details className="install-help">
                        <summary>Android blocked the installation?</summary>
                        <p>
                          This pilot uses an APK rather than Google Play. Android may ask you to
                          allow this browser to install apps. Samsung may also show an Auto Blocker
                          notice. Only proceed if you trust this Aptly Able download; you can leave
                          your phone’s protections enabled and ask us for help instead.
                        </p>
                        <p>
                          If you change an installation setting, restore it after installation.
                          Confirm that the Aptly Able icon appears and opens before continuing.
                        </p>
                      </details>
                    )}
                  </>
                ) : (
                  <p className="notice notice-neutral">
                    The {name} test download is not available yet. If Aptly Able is already
                    installed, you can continue below.
                  </p>
                )}
              </li>
              <li>
                <h2>Open your invitation in the app</h2>
                <p>
                  Return to this page and tap the button below. Sign in with the same account you
                  used on this website. Your invitation should already be received; you do not need
                  another QR code or a computer.
                </p>
                <a className="button primary full" href={link.appUrl}>
                  Continue setup in Aptly Able
                </a>
                <details className="install-help">
                  <summary>App did not open, or Invitation is blank?</summary>
                  <p>
                    Copy the setup link below. Open the Aptly Able app, choose Recorder → Open
                    recorder enrollment, and paste it into Invitation. Tap Use invitation, then
                    Continue setup.
                  </p>
                  <SetupLinkFallback link={link.appUrl} />
                </details>
              </li>
              <li>
                <h2>Connect your recorder</h2>
                <p>
                  Charge your recorder and keep it beside the phone. For NotePin S, briefly press
                  its button to wake it; look for the white light. If it is paired to the Plaud app
                  or another account, unpair it there first while it is nearby.
                </p>
                <p>
                  Keep internet and Bluetooth on. In Aptly Able, allow the requested recorder
                  permissions, tap Search for my recorder, then Connect assigned recorder. Wait for
                  “Connected and ready.” If setup fails, open Settings → Copy setup details and
                  share that report with support.
                </p>
              </li>
            </ol>
            <p className="fineprint">
              If your invitation has expired, generate a replacement QR in the dashboard. Opening
              this page does not use your invitation.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
