import { useEffect, useRef } from 'react';
export function Confirmation({
  title,
  copy,
  action,
  onCancel,
  onConfirm,
}: {
  title: string;
  copy: string;
  action: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="confirmation"
      aria-labelledby="confirmation-title"
      onCancel={onCancel}
    >
      <h2 id="confirmation-title">{title}</h2>
      <p>{copy}</p>
      <div className="button-row">
        <button onClick={onCancel}>Keep current setup</button>
        <button className="danger" onClick={onConfirm}>
          {action}
        </button>
      </div>
    </dialog>
  );
}
