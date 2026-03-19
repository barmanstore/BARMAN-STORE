import { BrowserRouter } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import ErrorBoundary from './shared/components/ErrorBoundary';
import AppShell from './shared/components/AppShell';
import { WindowManagerProvider } from './shared/components/window/WindowManagerProvider';
import useLockBodyScroll from './shared/hooks/useLockBodyScroll';
import { safeLocalStorageGet, safeLocalStorageRemove } from './shared/utils/storage';
import { useNotificationsInbox } from './features/notifications/hooks/useNotificationsInbox';
import { AppRoutes } from './app/appRoutes';
import './index.css';
import './App.css';
import * as info from './shared/info.js';

const routerBasename = (() => {
  const base = String(import.meta.env.BASE_URL || '/');
  return base === '/' ? '/' : base.replace(/\/$/, '');
})();

const getPublicFileUrl = (filename) => {
  const base = String(import.meta.env.BASE_URL || '/');
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const cleanFile = String(filename || '').replace(/^\/+/, '');
  return `${normalizedBase}${cleanFile}`;
};
function App() {
  const [cartCount, setCartCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [user, setUser] = useState(null);
  const headerRef = useRef(null);
  const logoImage = getPublicFileUrl(info.LOGO_URL || 'logo.png');
  const isAdminUser = String(user?.role || '').trim().toLowerCase() === 'admin';
  const closeMobileMenu = () => setMobileMenuOpen(false);
  const callHref = `tel:${String(info.CONTACT || '').replace(/[^\d+]/g, '')}`;
  const whatsappDigits = String(info.WHATSAPP_NUMBER || '').replace(/\D/g, '');
  const whatsappText = encodeURIComponent(
    String(info.WHATSAPP_DEFAULT_TEXT || 'Hello Barman Store, I need help with my order.')
  );
  const whatsappHref = whatsappDigits
    ? `https://wa.me/${whatsappDigits}?text=${whatsappText}`
    : '';
  const notificationProps = useNotificationsInbox({ user, isAdminUser });
  const routesElement = (
    <AppRoutes
      cartCount={cartCount}
      setCartCount={setCartCount}
      setUser={setUser}
      user={user}
      notificationProps={notificationProps}
    />
  );

  useLockBodyScroll(mobileMenuOpen);

  useEffect(() => {
    // Check for existing user session
    const savedUser = safeLocalStorageGet('user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (_) {
        safeLocalStorageRemove('user');
        setUser(null);
      }
    }
  }, []);

  useEffect(() => {
    const syncUserFromStorage = () => {
      const savedUser = safeLocalStorageGet('user');
      if (!savedUser) {
        setUser(null);
        return;
      }
      try {
        setUser(JSON.parse(savedUser));
      } catch (_) {
        safeLocalStorageRemove('user');
        setUser(null);
      }
    };
    window.addEventListener('storage', syncUserFromStorage);
    window.addEventListener('user-updated', syncUserFromStorage);
    return () => {
      window.removeEventListener('storage', syncUserFromStorage);
      window.removeEventListener('user-updated', syncUserFromStorage);
    };
  }, []);

  useEffect(() => {
    const syncCartCountFromStorage = () => {
      try {
        const saved = JSON.parse(safeLocalStorageGet('barman_cart') || '[]');
        const rows = Array.isArray(saved) ? saved : [];
        const total = rows.reduce((sum, item) => sum + Math.max(0, Number(item?.quantity || 0)), 0);
        setCartCount(total);
      } catch (_) {
        setCartCount(0);
      }
    };
    syncCartCountFromStorage();
    window.addEventListener('storage', syncCartCountFromStorage);
    return () => window.removeEventListener('storage', syncCartCountFromStorage);
  }, []);

  useEffect(() => {
    const isVisible = (element) => {
      if (!element || !(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const findTopMostCloseControl = () => {
      const selector = [
        '[data-modal-close="true"]',
        '.app-modal-close-btn',
        '.mobile-sheet-close-btn',
        '.invoice-close-btn',
        '.dropdown-close-btn',
        '.close-btn',
      ].join(', ');
      const candidates = Array.from(document.querySelectorAll(selector)).filter(isVisible);
      if (candidates.length === 0) return null;
      return candidates[candidates.length - 1];
    };

    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      if (mobileMenuOpen) {
        setMobileMenuOpen(false);
        return;
      }
      if (document.querySelector('[data-window-modal-root="true"]')) {
        return;
      }
      const mobileSheets = Array.from(document.querySelectorAll('[data-mobile-sheet-open="true"]'));
      const topMobileSheet = mobileSheets.length ? mobileSheets[mobileSheets.length - 1] : null;
      if (topMobileSheet?.getAttribute('data-close-on-escape') === 'false') {
        return;
      }
      const closer = findTopMostCloseControl();
      if (closer) {
        event.preventDefault();
        closer.click();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    const node = headerRef.current;
    if (!node) return undefined;

    const updateHeaderHeight = () => {
      const nextHeight = Math.ceil(node.getBoundingClientRect().height || 0);
      document.documentElement.style.setProperty('--app-header-height', `${Math.max(0, nextHeight)}px`);
    };

    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight);
    let resizeObserver;
    if (typeof window.ResizeObserver === 'function') {
      resizeObserver = new window.ResizeObserver(() => updateHeaderHeight());
      resizeObserver.observe(node);
    }

    return () => {
      window.removeEventListener('resize', updateHeaderHeight);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, []);

  return (
    <ErrorBoundary>
      <WindowManagerProvider>
        <BrowserRouter
          basename={routerBasename}
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <AppShell
            headerRef={headerRef}
            mobileMenuOpen={mobileMenuOpen}
            onToggleMobileMenu={() => setMobileMenuOpen((prev) => !prev)}
            onCloseMobileMenu={closeMobileMenu}
            logoImage={logoImage}
            cartCount={cartCount}
            user={user}
            setUser={setUser}
            isAdminUser={isAdminUser}
            notificationProps={notificationProps}
            callHref={callHref}
            whatsappHref={whatsappHref}
            publicFileUrl={getPublicFileUrl}
            setCartCount={setCartCount}
            routesElement={routesElement}
          />
        </BrowserRouter>
      </WindowManagerProvider>
    </ErrorBoundary>
  );
}

export default App;


