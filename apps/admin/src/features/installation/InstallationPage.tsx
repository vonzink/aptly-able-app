import { useState } from 'react';
import { type EnrollmentPlatform } from '@aptly/contracts';
import { installationDownload, installationLink } from './installation-link';
import { SetupLinkFallback } from '../../ui/SetupLinkFallback';

export function InstallationPage() {
  const [link] = useState(() => installationLink(window.location.href));
  const [platform, setPlatform] = useState<EnrollmentPlatform>(
    link.platform ?? (/iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios' : 'android'),
  );
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
        <p>
          Install Aptly Able, sign in, and connect your recorder. You can do it all on your phone.
        </p>
        {link.invitation === 'invalid' && (
          <div className="error" role="alert">
            This invitation is incomplete. You can still install the app and sign in to find your
            recorder, or ask for a new invitation.
          </div>
        )}
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
                      This pilot uses an APK rather than Google Play. Android may ask you to allow
                      this browser to install apps. Samsung may also show an Auto Blocker notice.
                      Only proceed if you trust this Aptly Able download; you can leave your phone’s
                      protections enabled and ask us for help instead.
                    </p>
                    <p>
                      If you change an installation setting, restore it after installation. Confirm
                      that the Aptly Able icon appears and opens before continuing.
                    </p>
                  </details>
                )}
              </>
            ) : (
              <p className="notice notice-neutral">
                The {name} test download is not available yet. If Aptly Able is already installed,
                you can continue below.
              </p>
            )}
          </li>
          <li>
            <h2>Open Aptly Able and sign in</h2>
            <p>
              After installation, tap Open or the Aptly Able icon on your phone. Choose Set up my
              recorder and sign in or create an account. If you used the website already, use that
              same account.
            </p>
            <p>
              Your saved recorder will appear automatically. If you haven’t added one, choose its
              model and enter the full serial number in the app.
            </p>
            <a className="button primary full" href={link.appUrl ?? 'aptlyable://recorder'}>
              Open Aptly Able
            </a>
            <details className="install-help">
              <summary>App didn’t open?</summary>
              <p>
                Open Aptly Able from its icon instead. Signing in finds recorders already saved to
                your account; you don’t need to return to this page or scan a QR.
              </p>
              {link.invitation === 'valid' && link.appUrl && (
                <>
                  <p>
                    If your administrator asked you to use this invitation, copy it below. In the
                    app, open Set up my recorder → Have an invitation link? and paste it there.
                  </p>
                  <SetupLinkFallback link={link.appUrl} />
                </>
              )}
            </details>
          </li>
          <li>
            <h2>Connect your recorder</h2>
            <p>
              Charge your recorder and keep it beside the phone. For NotePin S, briefly press its
              button to wake it; look for the white light. If it is paired to the Plaud app or
              another account, unpair it there first while it is nearby.
            </p>
            <p>
              Keep internet and Bluetooth on. In Aptly Able, allow the requested recorder
              permissions, tap Search for my recorder, then Connect assigned recorder. Wait for
              “Connected and ready.” If setup fails, open Settings → Copy setup details and share
              that report with support.
            </p>
          </li>
        </ol>
        <p className="fineprint">
          Already installed? Open the app and sign in. QR invitations are optional.
        </p>
        <a className="text-button" href="/">
          Manage recorders on the website
        </a>
      </section>
    </main>
  );
}
