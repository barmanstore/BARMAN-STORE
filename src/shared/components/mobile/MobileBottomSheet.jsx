import { useEffect } from 'react';
import { X } from 'lucide-react';
import useLockBodyScroll from '../../hooks/useLockBodyScroll';
import './MobileBottomSheet.css';

function MobileBottomSheet({
  open,
  title,
  onClose,
  children,
  actions = null,
  height = '80dvh',
  className = '',
  dismissible = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
}) {
  useLockBodyScroll(open);

  useEffect(() => {
    if (!open || dismissible === false || closeOnEscape === false) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (typeof onClose === 'function') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeOnEscape, dismissible, onClose, open]);

  if (!open) return null;

  return (
    <div
      className="mobile-sheet-scrim"
      onClick={() => {
        if (dismissible === false || closeOnBackdrop === false) return;
        if (typeof onClose === 'function') onClose();
      }}
      role="presentation"
      data-mobile-sheet-open="true"
      data-close-on-escape={closeOnEscape ? 'true' : 'false'}
    >
      <div
        className={`mobile-bottom-sheet ${className}`.trim()}
        style={{ maxHeight: height }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Dialog'}
      >
        <div className="mobile-sheet-handle" />
        <div className="mobile-sheet-header">
          <h3>{title}</h3>
          <button
            type="button"
            className="mobile-sheet-close-btn"
            onClick={onClose}
            aria-label="Close"
            disabled={dismissible === false}
          >
            <X size={20} />
          </button>
        </div>
        <div className="mobile-sheet-body">{children}</div>
        {actions ? <div className="mobile-sheet-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

export default MobileBottomSheet;
