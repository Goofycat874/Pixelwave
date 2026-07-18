import { ArrowCounterClockwise, X } from '@phosphor-icons/react';
import { useEffect } from 'react';

export default function ActionToast({ notice, onClose }) {
  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(onClose, notice.duration || 3600);
    return () => window.clearTimeout(timeout);
  }, [notice, onClose]);

  if (!notice) return null;

  return (
    <div className="action-toast" role="status" aria-live="polite">
      <span className="action-toast__pulse" />
      <p>{notice.message}</p>
      {notice.onAction && (
        <button className="action-toast__undo" type="button" onClick={() => { notice.onAction(); onClose(); }}>
          <ArrowCounterClockwise size={13} /> {notice.actionLabel || 'Undo'}
        </button>
      )}
      <button className="action-toast__close" type="button" aria-label="Dismiss notification" onClick={onClose}><X size={12} /></button>
    </div>
  );
}
