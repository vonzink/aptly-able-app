import { appDataNotice, company } from '@aptly/product-content';
import './legal.css';

export function LegalPage({ page }: { page: 'privacy' | 'support' }) {
  return (
    <main className="legal-page">
      <nav aria-label="Page navigation">
        <a href="/">← Recorder workspace</a>
        <a href={page === 'privacy' ? '/support' : '/privacy'}>
          {page === 'privacy' ? 'Help & support' : 'Privacy & your recordings'}
        </a>
      </nav>
      <header>
        <p className="small-label">Aptly Able</p>
        <h1>{page === 'privacy' ? appDataNotice.title : 'Help & support'}</h1>
        <p>
          {page === 'privacy'
            ? appDataNotice.introduction
            : 'Get help with your account, recorder or data.'}
        </p>
      </header>
      {page === 'privacy' ? (
        <>
          <p className="legal-date">App data notice · {appDataNotice.updatedAt}</p>
          {appDataNotice.sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              {section.paragraphs.map((text) => (
                <p key={text}>{text}</p>
              ))}
            </section>
          ))}
        </>
      ) : (
        <section>
          <h2>How can we help?</h2>
          <p>
            Tell us what happened and which phone model you use. You can include the diagnostics
            report from the phone app’s Settings. Please do not send passwords or private
            recordings.
          </p>
          <p>
            For account deletion, open Settings → Delete account in the phone app. If you cannot
            sign in, email support to request help. Include your deletion reference if you already
            submitted a request.
          </p>
        </section>
      )}
      <section>
        <h2>Contact {company.name}</h2>
        <p>
          <a href={`mailto:${company.supportEmail}`}>{company.supportEmail}</a>
        </p>
        <p>
          <a href={company.supportUrl}>Company contact page</a>
        </p>
      </section>
      <footer>
        <a href={company.privacyUrl}>Company Privacy Policy</a>
        <a href={company.termsUrl}>Terms of Use</a>
        <a href={company.accessibilityUrl}>Accessibility</a>
      </footer>
    </main>
  );
}
