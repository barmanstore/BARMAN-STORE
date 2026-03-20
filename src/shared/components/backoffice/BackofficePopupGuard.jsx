import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import useInertBackground from '../../hooks/useInertBackground';
import useBackofficePopupStatus from '../../hooks/useBackofficePopupStatus';
import { focusBackofficePopup } from '../../utils/backofficePopup';
import './BackofficePopupShell.css';

function BackofficePopupGuard() {
  const location = useLocation();
  const isPopupRoute = location.pathname.startsWith('/popup');
  const billingPopupStatus = useBackofficePopupStatus('billing');
  const purchasePopupStatus = useBackofficePopupStatus('purchase');
  const openPopups = useMemo(
    () => [billingPopupStatus, purchasePopupStatus].filter((entry) => entry?.isOpen),
    [billingPopupStatus, purchasePopupStatus]
  );
  const hasOpenPopups = !isPopupRoute && openPopups.length > 0;

  useInertBackground(hasOpenPopups);

  useEffect(() => {
    if (!hasOpenPopups || typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [hasOpenPopups]);

  if (!hasOpenPopups || typeof document === 'undefined') return null;

  const primaryPopup = openPopups[0];
  const singlePopup = openPopups.length === 1;

  const handleBackdropClick = () => {
    if (!singlePopup) return;
    focusBackofficePopup(primaryPopup.kind);
  };

  return createPortal(
    <div className="backoffice-popup-guard" data-backoffice-popup-guard="true">
      <button
        type="button"
        className="backoffice-popup-guard__scrim"
        aria-label={singlePopup ? `Focus ${primaryPopup.label} window` : 'Popup workspace is open'}
        onClick={handleBackdropClick}
      />
      <div
        className="backoffice-popup-guard__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="backoffice-popup-guard-title"
        aria-describedby="backoffice-popup-guard-copy"
      >
        <h2 id="backoffice-popup-guard-title">
          {singlePopup ? `${primaryPopup.label} is open in another window` : 'Backoffice popup windows are open'}
        </h2>
        <p id="backoffice-popup-guard-copy">
          {singlePopup
            ? 'This page is locked while the popup workspace is active. Focus that window or close it to continue here.'
            : 'This page is locked while popup workspaces are active. Focus one of them or close them to continue here.'}
        </p>
        <div className="backoffice-popup-guard__actions">
          {openPopups.map((popup, index) => (
            <button
              key={popup.kind}
              type="button"
              className="admin-btn"
              onClick={() => focusBackofficePopup(popup.kind)}
              autoFocus={index === 0}
            >
              Focus {popup.label}
            </button>
          ))}
        </div>
        <p className="backoffice-popup-guard__hint">
          Close the popup window to unlock the background page.
        </p>
      </div>
    </div>,
    document.body
  );
}

export default BackofficePopupGuard;
