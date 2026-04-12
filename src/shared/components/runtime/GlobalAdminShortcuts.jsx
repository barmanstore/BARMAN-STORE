import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getAdminTabHref } from '../../../features/admin/config/adminSidebarConfig';
import { useRoutePolicy } from '../../../providers/RoutePolicyProvider';
import { useSession } from '../../../providers/SessionProvider';
import { hasCapability } from '../../auth/capabilities';
import { openBackofficePopup } from '../../utils/backofficePopup';

const SHORTCUT_EDITABLE_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[contenteditable=""]',
  '[role="textbox"]',
].join(', ');

const isShortcutEditableTarget = (target) => {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
  return Boolean(target.closest(SHORTCUT_EDITABLE_SELECTOR));
};

const hasActiveModalDialog = () => {
  if (typeof document === 'undefined') return false;
  return Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));
};

function GlobalAdminShortcuts() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useSession();
  const routePolicy = useRoutePolicy();
  const shortcutSequenceRef = useRef(0);
  const canUseBackofficeShortcuts = hasCapability(user, 'view_backoffice');
  const allowShortcuts = routePolicy.runtime.allowAdminShortcuts;
  const inAdminArea = routePolicy.runtime.isAdminArea;

  useEffect(() => {
    if (!canUseBackofficeShortcuts || !allowShortcuts) return undefined;

    const handleKeyDown = (event) => {
      if (event.defaultPrevented || event.repeat) return;
      if (typeof document !== 'undefined') {
        if (document.visibilityState !== 'visible') return;
        if (typeof document.hasFocus === 'function' && !document.hasFocus()) return;
      }
      if (isShortcutEditableTarget(event.target)) return;
      if (hasActiveModalDialog()) return;

      const key = String(event.key || '').toLowerCase();
      const isBillingShortcut = key === 'b'
        && event.altKey
        && !event.ctrlKey
        && !event.metaKey
        && !event.shiftKey;
      const isPurchaseShortcut = key === 'p'
        && (event.altKey || event.ctrlKey)
        && !event.metaKey
        && !event.shiftKey;

      if (!isBillingShortcut && !isPurchaseShortcut) {
        return;
      }

      if (isBillingShortcut) {
        event.preventDefault();
        const popupResult = openBackofficePopup('billing');
        if (popupResult.status === 'blocked') {
          shortcutSequenceRef.current += 1;
          const next = new URLSearchParams();
          next.set('shortcut', 'billing-focus');
          next.set('shortcutToken', String(shortcutSequenceRef.current));
          navigate(`${getAdminTabHref('billing')}?${next.toString()}`, {
            replace: inAdminArea,
          });
        }
        return;
      }

      event.preventDefault();
      shortcutSequenceRef.current += 1;
      const next = new URLSearchParams(location.search || '');
      next.set('shortcut', 'open-po');
      next.set('shortcutToken', String(shortcutSequenceRef.current));
      navigate(`${getAdminTabHref('purchases')}?${next.toString()}`, {
        replace: inAdminArea,
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [allowShortcuts, canUseBackofficeShortcuts, inAdminArea, location.search, navigate]);

  return null;
}

export default GlobalAdminShortcuts;
