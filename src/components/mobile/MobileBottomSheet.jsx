import { X } from 'lucide-react';
import './MobileBottomSheet.css';

function MobileBottomSheet({
  open,
  title,
  onClose,
  children,
  actions = null,
  height = '80vh',
  className = ''
}) {
  if (!open) return null;

  return (
    <div className="mobile-sheet-scrim" onClick={onClose} role="presentation">
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
          <button type="button" className="mobile-sheet-close-btn" onClick={onClose} aria-label="Close">
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
