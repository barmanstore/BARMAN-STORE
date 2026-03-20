import { Link, useLocation } from 'react-router-dom';
import { MessageCircle, Phone } from 'lucide-react';
import { Suspense, useEffect, useRef, useState } from 'react';
import Header from './header/Header';
import useIsMobile from '../hooks/useIsMobile';
import { analyticsApi } from '../services/api';
import { safeLocalStorageGet, safeLocalStorageSet } from '../utils/storage';
import BackofficePopupGuard from './backoffice/BackofficePopupGuard';
import * as info from '../info.js';

const VISITOR_SESSION_STORAGE_KEY = 'visitor_session_id';

const createVisitorSessionId = () => {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
};

const runWhenIdle = (task, timeout = 1000) => {
  if (typeof window === 'undefined' || typeof task !== 'function') return () => {};
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(() => task(), { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(() => task(), Math.min(timeout, 250));
  return () => window.clearTimeout(id);
};

function VisitorTracker() {
  const location = useLocation();
  const sessionIdRef = useRef('');
  const latestPathRef = useRef('/');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let existingSessionId = String(safeLocalStorageGet(VISITOR_SESSION_STORAGE_KEY) || '').trim();
    if (!existingSessionId) {
      existingSessionId = createVisitorSessionId();
      safeLocalStorageSet(VISITOR_SESSION_STORAGE_KEY, existingSessionId);
    }
    sessionIdRef.current = existingSessionId;
    latestPathRef.current = `${location.pathname || '/'}${location.search || ''}`;
    const cancelIdle = runWhenIdle(() => {
      analyticsApi.startSession({
        session_id: existingSessionId,
        path: latestPathRef.current,
        referrer: typeof document !== 'undefined' ? document.referrer || '' : '',
      }).catch(() => {});
    }, 1200);
    return () => cancelIdle();
  }, []);

  useEffect(() => {
    const currentPath = `${location.pathname || '/'}${location.search || ''}`;
    latestPathRef.current = currentPath;
    if (!sessionIdRef.current) return;
    const cancelIdle = runWhenIdle(() => {
      analyticsApi.heartbeat({
        session_id: sessionIdRef.current,
        path: currentPath,
      }).catch(() => {});
    }, 900);
    return () => cancelIdle();
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const interval = window.setInterval(() => {
      if (!sessionIdRef.current) return;
      if (document.visibilityState !== 'visible') return;
      analyticsApi.heartbeat({
        session_id: sessionIdRef.current,
        path: latestPathRef.current || '/',
      }).catch(() => {});
    }, 45000);
    return () => window.clearInterval(interval);
  }, []);

  return null;
}

function AppShell({
  headerRef,
  mobileMenuOpen,
  onToggleMobileMenu,
  onCloseMobileMenu,
  logoImage,
  cartCount,
  user,
  setUser,
  isAdminUser,
  notificationProps,
  callHref,
  whatsappHref,
  publicFileUrl,
  setCartCount,
  routesElement,
}) {
  const {
    notificationPanelOpen,
    onToggleNotificationPanel,
    notifications,
    unreadNotificationCount,
    notificationsHasMore,
    expandedNotificationId,
    messageDraft,
    messageRecipients,
    selectedRecipientIds,
    recipientSearch,
    messageSending,
    messageFeedback,
    notificationInboxRef,
    onToggleRecipientSelection,
    onSendInboxMessage,
    onLoadOlderNotifications,
    onResolveNotificationHref,
    onToggleNotificationExpanded,
    onMarkNotificationRead,
    onRecipientSearchChange,
    onMessageDraftChange,
    onClearRecipientSelection,
  } = notificationProps || {};
  const location = useLocation();
  const isMobile = useIsMobile();
  const isHomeRoute = location.pathname === '/' || location.pathname === '';
  const isPopupRoute = location.pathname.startsWith('/popup');
  const shouldHideChrome = isMobile && !isHomeRoute;
  const quickContactRef = useRef(null);
  const dragStateRef = useRef({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startPosX: 0,
    startPosY: 0,
    moved: false,
  });
  const suppressClickRef = useRef(false);
  const QUICK_CONTACT_POS_KEY = 'barman_quick_contact_pos_v1';
  const [isDragging, setIsDragging] = useState(false);
  const [quickContactPos, setQuickContactPos] = useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = JSON.parse(window.localStorage.getItem(QUICK_CONTACT_POS_KEY) || 'null');
      if (!stored || typeof stored !== 'object') return null;
      const x = Number(stored.x);
      const y = Number(stored.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { x, y };
    } catch (_) {
      return null;
    }
  });
  const resolvePublicFileUrl = publicFileUrl || ((filename) => String(filename || ''));

  useEffect(() => {
    if (isPopupRoute) {
      document.body.classList.remove('mobile-hide-chrome');
      return undefined;
    }
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('mobile-hide-chrome', shouldHideChrome);
    return () => {
      document.body.classList.remove('mobile-hide-chrome');
    };
  }, [isPopupRoute, shouldHideChrome]);

  useEffect(() => {
    if (shouldHideChrome && mobileMenuOpen) {
      onCloseMobileMenu();
    }
  }, [shouldHideChrome, mobileMenuOpen, onCloseMobileMenu]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (quickContactPos) return;
    const node = quickContactRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const padding = 12;
    const maxX = Math.max(padding, window.innerWidth - rect.width - padding);
    const maxY = Math.max(padding, window.innerHeight - rect.height - padding);
    const next = {
      x: Math.max(padding, Math.min(maxX, Math.round(window.innerWidth - rect.width - padding))),
      y: Math.max(padding, Math.min(maxY, Math.round(window.innerHeight * 0.55))),
    };
    setQuickContactPos(next);
  }, [quickContactPos]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!quickContactPos) return;
    try {
      window.localStorage.setItem(QUICK_CONTACT_POS_KEY, JSON.stringify(quickContactPos));
    } catch (_) {
      // ignore storage errors
    }
  }, [quickContactPos]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleResize = () => {
      const node = quickContactRef.current;
      if (!node || !quickContactPos) return;
      const rect = node.getBoundingClientRect();
      const padding = 12;
      const maxX = Math.max(padding, window.innerWidth - rect.width - padding);
      const maxY = Math.max(padding, window.innerHeight - rect.height - padding);
      const nextX = Math.max(padding, Math.min(maxX, quickContactPos.x));
      const nextY = Math.max(padding, Math.min(maxY, quickContactPos.y));
      if (nextX !== quickContactPos.x || nextY !== quickContactPos.y) {
        setQuickContactPos({ x: nextX, y: nextY });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [quickContactPos]);

  const handleQuickContactPointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const node = quickContactRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const padding = 12;
    const maxX = Math.max(padding, window.innerWidth - rect.width - padding);
    const maxY = Math.max(padding, window.innerHeight - rect.height - padding);
    const startX = event.clientX;
    const startY = event.clientY;
    const startPosX = Math.max(padding, Math.min(maxX, quickContactPos?.x ?? rect.left));
    const startPosY = Math.max(padding, Math.min(maxY, quickContactPos?.y ?? rect.top));

    dragStateRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX,
      startY,
      startPosX,
      startPosY,
      moved: false,
    };
    setIsDragging(true);

    try {
      node.setPointerCapture(event.pointerId);
    } catch (_) {
      // ignore pointer capture failures
    }
  };

  const handleQuickContactPointerMove = (event) => {
    const state = dragStateRef.current;
    if (!state.active || state.pointerId !== event.pointerId) return;
    const node = quickContactRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const padding = 12;
    const maxX = Math.max(padding, window.innerWidth - rect.width - padding);
    const maxY = Math.max(padding, window.innerHeight - rect.height - padding);
    const deltaX = event.clientX - state.startX;
    const deltaY = event.clientY - state.startY;
    const moved = Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4;
    const nextX = Math.max(padding, Math.min(maxX, state.startPosX + deltaX));
    const nextY = Math.max(padding, Math.min(maxY, state.startPosY + deltaY));
    dragStateRef.current.moved = state.moved || moved;
    setQuickContactPos({ x: nextX, y: nextY });
  };

  const handleQuickContactPointerUp = (event) => {
    const state = dragStateRef.current;
    if (!state.active || state.pointerId !== event.pointerId) return;
    dragStateRef.current.active = false;
    setIsDragging(false);
    try {
      quickContactRef.current?.releasePointerCapture(event.pointerId);
    } catch (_) {
      // ignore pointer capture failures
    }
    if (state.moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 180);
    }
  };

  const handleQuickContactClickCapture = (event) => {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
  };

  if (isPopupRoute) {
    return (
      <div className="app app-popup" data-window-background-root="true">
        <main className="main-content main-content-popup">
          <Suspense
            fallback={(
              <div className="route-loading" role="status" aria-live="polite">
                <span className="route-loading__spinner" aria-hidden="true" />
                <span className="route-loading__text">Loading workspace...</span>
              </div>
            )}
          >
            {routesElement}
          </Suspense>
        </main>
      </div>
    );
  }

  return (
    <div className="app" data-window-background-root="true">
      <VisitorTracker />
      <BackofficePopupGuard />
      <Header
        headerRef={headerRef}
        mobileMenuOpen={mobileMenuOpen}
        onToggleMobileMenu={onToggleMobileMenu}
        onCloseMobileMenu={onCloseMobileMenu}
        logoImage={logoImage}
        cartCount={cartCount}
        user={user}
        setUser={setUser}
        isAdminUser={isAdminUser}
        notificationPanelOpen={notificationPanelOpen}
        onToggleNotificationPanel={onToggleNotificationPanel}
        notifications={notifications}
        unreadNotificationCount={unreadNotificationCount}
        notificationsHasMore={notificationsHasMore}
        expandedNotificationId={expandedNotificationId}
        messageDraft={messageDraft}
        messageRecipients={messageRecipients}
        selectedRecipientIds={selectedRecipientIds}
        recipientSearch={recipientSearch}
        messageSending={messageSending}
        messageFeedback={messageFeedback}
        notificationInboxRef={notificationInboxRef}
        onToggleRecipientSelection={onToggleRecipientSelection}
        onSendInboxMessage={onSendInboxMessage}
        onLoadOlderNotifications={onLoadOlderNotifications}
        onResolveNotificationHref={onResolveNotificationHref}
        onToggleNotificationExpanded={onToggleNotificationExpanded}
        onMarkNotificationRead={onMarkNotificationRead}
        onRecipientSearchChange={onRecipientSearchChange}
        onMessageDraftChange={onMessageDraftChange}
        onClearRecipientSelection={onClearRecipientSelection}
      />
      {mobileMenuOpen ? (
        <button className="mobile-nav-backdrop" aria-label="Close menu" onClick={onCloseMobileMenu} />
      ) : null}

      <main className="main-content">
        <Suspense
          fallback={(
            <div className="route-loading" role="status" aria-live="polite">
              <span className="route-loading__spinner" aria-hidden="true" />
              <span className="route-loading__text">Loading Barman Store...</span>
            </div>
          )}
        >
          {routesElement}
        </Suspense>
      </main>
      <div
        className={`quick-contact-fab ${isDragging ? 'dragging' : ''}`}
        aria-label="Quick contact options"
        ref={quickContactRef}
        style={
          quickContactPos
            ? { transform: `translate3d(${quickContactPos.x}px, ${quickContactPos.y}px, 0)` }
            : undefined
        }
        onPointerDown={handleQuickContactPointerDown}
        onPointerMove={handleQuickContactPointerMove}
        onPointerUp={handleQuickContactPointerUp}
        onPointerCancel={handleQuickContactPointerUp}
        onClickCapture={handleQuickContactClickCapture}
      >
        {whatsappHref ? (
          <a
            href={whatsappHref}
            className="quick-contact-btn chat"
            target="_blank"
            rel="noreferrer"
            aria-label="Chat on WhatsApp"
          >
            <MessageCircle size={18} />
            <span>Chat</span>
          </a>
        ) : null}
        <a href={callHref} className="quick-contact-btn call" aria-label="Call store">
          <Phone size={18} />
          <span>Call</span>
        </a>
      </div>

      <footer className="footer">
        <div className="footer-content">
          <div className="footer-section footer-brand">
            <h3>{info.TITLE}</h3>
            <p>{info.SUB_TITLE}</p>
          </div>
          <div className="footer-section footer-links">
            <h4>Quick Links</h4>
            <div className="footer-links-list">
              <Link to="/products">Shop</Link>
              <Link to="/cart">Cart</Link>
              <Link to="/my-bills">My Bills</Link>
              <Link to="/product-requests">Product Requests</Link>
              <a href={resolvePublicFileUrl('terms-of-service.html')}>Terms of Service</a>
              <a href={resolvePublicFileUrl('privacy-policy.html')}>Privacy Policy</a>
              <a href={resolvePublicFileUrl('data-deletion.html')}>Data Deletion</a>
            </div>
          </div>
          <div className="footer-section footer-contact">
            <h4>CONTACT US</h4>
            <div className="footer-contact-list">
              <p>Email: {info.EMAIL}</p>
              <p>Phone: {info.CONTACT}</p>
              {info.SHOP_ADDRESS ? <p>Address: {info.SHOP_ADDRESS}</p> : null}
              {info.COUNTER_HOURS ? <p>Counter Hours: {info.COUNTER_HOURS}</p> : null}
              {whatsappHref ? (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noreferrer"
                  className="footer-whatsapp-link"
                >
                  WhatsApp Chat
                </a>
              ) : null}
              {info.SHOP_LOCATION_URL ? (
                <a
                  href={info.SHOP_LOCATION_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="footer-location-link"
                >
                  Shop Location
                </a>
              ) : null}
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2026 {info.TITLE}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

export default AppShell;

