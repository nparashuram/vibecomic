import { useEffect } from 'react';

export interface Status {
  text: string;
  error: boolean;
}

const STATUS_TOAST_MS = 5000;

interface Props {
  status: Status | null;
  onClose: () => void;
}

/** A message popup fixed to the top of the screen, above the page; it closes itself after 5 seconds. */
export default function StatusToast({ status, onClose }: Props) {
  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(onClose, STATUS_TOAST_MS);
    return () => clearTimeout(timer);
  }, [status, onClose]);

  if (!status) return null;
  return (
    <div className="toast-container position-fixed top-0 start-50 translate-middle-x p-3">
      <div
        className={`toast show align-items-center border-0 ${status.error ? 'text-bg-danger' : 'text-bg-dark'}`}
        role={status.error ? 'alert' : 'status'}
      >
        <div className="d-flex">
          <div className="toast-body">{status.text}</div>
          <button
            type="button"
            className="btn-close btn-close-white me-2 m-auto"
            aria-label="Dismiss"
            onClick={onClose}
          />
        </div>
      </div>
    </div>
  );
}
