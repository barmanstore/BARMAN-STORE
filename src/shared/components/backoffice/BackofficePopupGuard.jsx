import { useMemo } from 'react';
import { OverlayEntry } from '../../../providers/OverlayProvider';
import { useRoutePolicy } from '../../../providers/RoutePolicyProvider';
import useBackofficePopupStatus from '../../hooks/useBackofficePopupStatus';
import useLockBodyScroll from '../../hooks/useLockBodyScroll';
import { focusBackofficePopup } from '../../utils/backofficePopup';
import './BackofficePopupShell.css';

function BackofficePopupGuard() {
  const routePolicy = useRoutePolicy();
  const billingPopupStatus = useBackofficePopupStatus('billing');
  const purchasePopupStatus = useBackofficePopupStatus('purchase');
  const openPopups = useMemo(
    () => [billingPopupStatus, purchasePopupStatus].filter((entry) => entry?.isOpen),
    [billingPopupStatus, purchasePopupStatus]
  );
  const hasOpenPopups = !routePolicy.runtime.isPopupRoute && openPopups.length > 0;

  useLockBodyScroll(hasOpenPopups);

  if (!hasOpenPopups) return null;

  const primaryPopup = openPopups[0];
  const singlePopup = openPopups.length === 1;

  const handleBackdropClick = () => {
    if (!singlePopup) return;
    focusBackofficePopup(primaryPopup.kind);
  };

  return (
    <OverlayEntry
      active={hasOpenPopups}
      id="backoffice-popup-guard"
      type="overlay"
      zIndex={4200}
      onEscape={singlePopup ? handleBackdropClick : null}
    >
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
      </div>
    </OverlayEntry>
  );
}

export default BackofficePopupGuard;
