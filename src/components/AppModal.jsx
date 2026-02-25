import { useEffect } from 'react';
import { X } from 'lucide-react';
import './AppModal.css';

function AppModal({ open, title, onClose, children, dialogClassName = '', contentClassName = '' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && typeof onClose === 'function') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="app-modal-overlay"
      onClick={() => {
        if (typeof onClose === 'function') onClose();
      }}
      role="presentation"
    >
      <div
        className={`app-modal-dialog ${dialogClassName}`.trim()}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Dialog'}
      >
        <div className="app-modal-header">
          <h2>{title}</h2>
          <button type="button" className="app-modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className={`app-modal-content ${contentClassName}`.trim()}>{children}</div>
      </div>
    </div>
  );
}

export default AppModal;
