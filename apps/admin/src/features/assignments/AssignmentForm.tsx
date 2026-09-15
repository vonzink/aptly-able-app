import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  createAssignmentRequestSchema,
  recorderModels,
  type RecorderModel,
} from '@aptly/contracts';
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
  const [model, setModel] = useState<RecorderModel>('notepins');
  const [validationAttempt, setValidationAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const parsed = createAssignmentRequestSchema.safeParse({ userId, serial, model });
  const fieldError = (field: 'userId' | 'model' | 'serial') =>
    validationAttempt > 0 && !parsed.success
      ? parsed.error.issues.find((issue) => issue.path[0] === field)?.message
      : undefined;
  const personError = fieldError('userId');
  const modelError = fieldError('model');
  const serialError = fieldError('serial');

  useEffect(() => {
    // Wait for accessible error descriptions to render; do not steal focus while typing.
    if (validationAttempt > 0)
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [validationAttempt]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (workspace.busy) return;
    if (!parsed.success) {
      setValidationAttempt((attempt) => attempt + 1);
      return;
    }
    void workspace.create(parsed.data).then((created) => {
      if (created) onClose();
    });
  }
  return (
    <section className="assignment-form panel" aria-labelledby="assignment-title">
      <div className="section-heading">
        <div>
          <h2 id="assignment-title">Assign a recorder</h2>
          <p>Choose the model and enter its full serial number (SN).</p>
        </div>
        <button className="text-button" onClick={onClose} disabled={workspace.busy}>
          Cancel
        </button>
      </div>
      <form ref={formRef} onSubmit={submit} noValidate>
        <div className="form-grid">
          <div>
            <label htmlFor="assignee">Person</label>
            <select
              id="assignee"
              name="userId"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              required
              aria-invalid={!!personError}
              aria-describedby={personError ? 'assignee-error' : undefined}
              disabled={workspace.busy}
            >
              <option value="">Choose a person</option>
              {workspace.users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName}
                </option>
              ))}
            </select>
            {personError && (
              <p className="field-error" id="assignee-error">
                {personError}
              </p>
            )}
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
              name="model"
              value={model}
              onChange={(event) => setModel(event.target.value as RecorderModel)}
              required
              aria-invalid={!!modelError}
              aria-describedby={modelError ? 'model-help model-error' : 'model-help'}
              disabled={workspace.busy}
            >
              <option value="notepro">Plaud Note Pro</option>
              <option value="notepins">Plaud NotePin S</option>
            </select>
            <p className="field-help" id="model-help">
              {recorderModels[model].label} serials start with {recorderModels[model].serialPrefix}.
            </p>
            {modelError && (
              <p className="field-error" id="model-error">
                {modelError}
              </p>
            )}
            <div className="model-photo-preview">
              <RecorderPhoto model={model} />
            </div>
          </div>
          <div>
            <label htmlFor="serial">Complete serial number (SN)</label>
            <input
              id="serial"
              name="serial"
              placeholder={`Starts with ${recorderModels[model].serialPrefix}`}
              value={serial}
              onChange={(event) => setSerial(event.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={64}
              required
              aria-invalid={!!serialError}
              aria-describedby={serialError ? 'serial-help serial-error' : 'serial-help'}
              disabled={workspace.busy}
            />
            <p className="field-help" id="serial-help">
              Find the SN on the box label
              {model === 'notepins' ? ' or the back of your NotePin S' : ''}. Include any letters.
              The last four digits alone are not enough.
            </p>
            {serialError && (
              <p className="field-error" id="serial-error">
                {serialError}
              </p>
            )}
          </div>
        </div>
        {!workspace.users.length && (
          <p>Your account is not available yet. Refresh the dashboard and try again.</p>
        )}
        {(personError || modelError || serialError) && (
          <p className="error" role="alert">
            Check the highlighted fields before saving.
          </p>
        )}
        <div className="form-footer">
          <span>Plaud Note and the original NotePin are not supported.</span>
          <button className="primary" disabled={workspace.busy || !workspace.users.length}>
            {workspace.busy ? 'Saving…' : 'Save assignment'}
          </button>
        </div>
      </form>
    </section>
  );
}
