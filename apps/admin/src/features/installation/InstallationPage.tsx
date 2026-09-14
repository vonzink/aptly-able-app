import { useState } from 'react';
import { type EnrollmentPlatform } from '@aptly/contracts';
import { installationDownload, installationLink } from './installation-link';

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
              Keep this page open while you install the app. Then come back here to connect your
              recorder.
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
                        ? 'Download Aptly Able, open the downloaded APK, and allow your browser to install it when Android asks.'
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
                  </>
                ) : (
                  <p className="notice notice-neutral">
                    The {name} test download is not available yet. If Aptly Able is already
                    installed, you can continue below.
                  </p>
                )}
              </li>
              <li>
                <h2>Return here and continue</h2>
                <p>
                  After installation, return to this browser page and tap the button below. Sign in
                  with the account you used in the dashboard.
                </p>
                <a className="button primary full" href={link.appUrl}>
                  Continue setup in Aptly Able
                </a>
              </li>
              <li>
                <h2>Connect your recorder</h2>
                <p>
                  Keep your NotePin S powered on and nearby. Allow Bluetooth access in Aptly Able,
                  then tap Connect recorder.
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
