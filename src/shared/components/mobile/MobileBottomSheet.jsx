import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import useFocusTrap from '../../hooks/useFocusTrap';
import useInertBackground from '../../hooks/useInertBackground';
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
  const reactId = useId();
  const sheetRef = useRef(null);
  const titleId = title ? `mobile-sheet-${String(reactId).replace(/[:]/g, '')}-title` : undefined;

  useLockBodyScroll(open);
  useFocusTrap(sheetRef, open);
  useInertBackground(open);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const sheet = (
    <div
      className="mobile-sheet-scrim"
      onClick={() => {
        if (dismissible === false || closeOnBackdrop === false) return;
        if (typeof onClose === 'function') onClose();
      }}
      role="presentation"
      data-mobile-sheet-open="true"
      data-close-on-escape={closeOnEscape ? 'true' : 'false'}
      data-mobile-sheet-root="true"
    >
      <div
        ref={sheetRef}
        className={`mobile-bottom-sheet ${className}`.trim()}
        style={{ maxHeight: height }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={title ? undefined : 'Dialog'}
        tabIndex={-1}
      >
        <div className="mobile-sheet-handle" />
        <div className="mobile-sheet-header">
          <h3 id={titleId}>{title}</h3>
          <button
            type="button"
            className="mobile-sheet-close-btn"
            onClick={onClose}
            aria-label="Close"
            disabled={dismissible === false}
            data-modal-close="true"
          >
            <X size={20} />
          </button>
        </div>
        <div className="mobile-sheet-body">{children}</div>
        {actions ? <div className="mobile-sheet-actions">{actions}</div> : null}
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}

export default MobileBottomSheet;
