import { useState } from 'react';

/** User-initiated clipboard access only. The invitation is never sent to another service. */
export function SetupLinkFallback({ link }: { link: string }) {
  const [message, setMessage] = useState<string | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setMessage(
        'Copied. In Aptly Able, open Recorder → Open recorder enrollment and paste this link into Invitation.',
      );
    } catch {
      setMessage(
        'Your browser could not copy the link. Expand “Show link for manual copying” below, then select and copy it.',
      );
    }
  }
  return (
    <div className="setup-link-tools">
      <button type="button" onClick={() => void copy()}>
        Copy setup link
      </button>
      {message && <p role="status">{message}</p>}
      <details>
        <summary>Show link for manual copying</summary>
        <label>
          Private setup link
          <input
            readOnly
            value={link}
            onFocus={(event) => event.currentTarget.select()}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <p className="fineprint">
          Paste this into Invitation in the app. Keep it private; do not post it in a group chat.
        </p>
      </details>
    </div>
  );
}
