import { useEffect } from 'react';
import { X } from '@phosphor-icons/react';

export default function ActionToast({ notice, onClose }) {
  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(onClose, notice.duration || 3200);
    return () => window.clearTimeout(timeout);
  }, [notice, onClose]);

  if (!notice) return null;

  return (
    <div className={`toast ${notice.tone === 'error' ? 'toast--error' : ''}`} role="status" aria-live="polite" key={notice.id}>
      <p>{notice.message}</p>
      {notice.onAction && (
        <button className="toast__action" type="button" onClick={() => { notice.onAction(); onClose(); }}>
          {notice.actionLabel || 'Undo'}
        </button>
      )}
      <button className="toast__close" type="button" aria-label="Dismiss" onClick={onClose}><X size={12} /></button>
    </div>
  );
}
