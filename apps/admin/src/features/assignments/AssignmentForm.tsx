import { useState, type FormEvent } from 'react';
import { createAssignmentRequestSchema } from '@aptly/contracts';
import type { Workspace } from './use-workspace';
import { RecorderPhoto } from './RecorderPhoto';
export function AssignmentForm({
  workspace,
  onClose,
}: {
  workspace: Workspace;
  onClose: () => void;
}) {
  const [userId, setUserId] = useState(workspace.users.length === 1 ? workspace.users[0]!.id : '');
  const [serial, setSerial] = useState('');
  const [model, setModel] = useState<'notepro' | 'notepins'>('notepins');
  const [error, setError] = useState<string | null>(null);
  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = createAssignmentRequestSchema.safeParse({ userId, serial, model });
    if (!parsed.success) {
      setError('Choose a person and enter the complete recorder serial, ending in four digits.');
      return;
    }
    setError(null);
    void workspace.create(parsed.data).then((created) => {
      if (created) onClose();
    });
  }
  return (
    <section className="assignment-form panel" aria-labelledby="assignment-title">
      <div className="section-heading">
        <div>
          <h2 id="assignment-title">Assign a recorder</h2>
          <p>Match the complete serial printed on the recorder.</p>
        </div>
        <button className="text-button" onClick={onClose} disabled={workspace.busy}>
          Cancel
        </button>
      </div>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div>
            <label htmlFor="assignee">Person</label>
            <select
              id="assignee"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              required
              disabled={workspace.busy}
            >
              <option value="">Choose a person</option>
              {workspace.users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName}
                </option>
              ))}
            </select>
            {workspace.moreUsers && (
              <button
                type="button"
                className="text-button"
                onClick={() => void workspace.morePeople()}
                disabled={workspace.busy}
              >
                Load more people
              </button>
            )}
          </div>
          <div>
            <label htmlFor="model">Recorder model</label>
            <select
              id="model"
              value={model}
              onChange={(event) => setModel(event.target.value as 'notepro' | 'notepins')}
              disabled={workspace.busy}
            >
              <option value="notepro">Plaud Note Pro</option>
              <option value="notepins">Plaud NotePin S</option>
            </select>
            <div className="model-photo-preview">
              <RecorderPhoto model={model} />
            </div>
          </div>
          <div>
            <label htmlFor="serial">Complete serial number</label>
            <input
              id="serial"
              placeholder={
                model === 'notepins' ? 'For example, 8820005641' : 'For example, 8810004812'
              }
              value={serial}
              onChange={(event) => setSerial(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              maxLength={64}
              required
              disabled={workspace.busy}
            />
          </div>
        </div>
        {!workspace.users.length && (
          <p>Your account is not available yet. Refresh the dashboard and try again.</p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-footer">
          <span>Original Plaud Note is not supported by this integration.</span>
          <button className="primary" disabled={workspace.busy || !workspace.users.length}>
            {workspace.busy ? 'Saving…' : 'Save assignment'}
          </button>
        </div>
      </form>
    </section>
  );
}
