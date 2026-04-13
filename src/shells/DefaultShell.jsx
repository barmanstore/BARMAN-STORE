import { Link } from 'react-router-dom';
import { Phone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Header from '../shared/components/header/Header';
import useLockBodyScroll from '../shared/hooks/useLockBodyScroll';
import { useOverlayStackEntry } from '../providers/OverlayProvider';
import * as info from '../shared/info.js';

function DefaultShell({
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
  children,
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
    notificationFeedback,
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
  const headerRef = useRef(null);
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
  const currentYear = new Date().getFullYear();
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

  useLockBodyScroll(mobileMenuOpen);

  useOverlayStackEntry({
    active: mobileMenuOpen,
    id: 'mobile-menu',
    type: 'chrome',
    zIndex: 1600,
    onEscape: onCloseMobileMenu,
  });

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

  return (
    <div className="app app-default-shell" data-window-background-root="true">
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
        notificationFeedback={notificationFeedback}
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
        {children}
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

        <a href={callHref} className="quick-contact-btn call" aria-label="Call store">
          <Phone size={18} />
          <span>Call</span>
        </a>
      </div>

      <footer className="footer">
        <div className="footer-content">
          <div className="footer-brand">
            <h3>{info.TITLE}</h3>
            <p>{info.SUB_TITLE}</p>
          </div>
          <div className="footer-inline-stack">
            <div className="footer-inline-links" aria-label="Quick links">
              <Link to="/products">Shop</Link>
              <a href={resolvePublicFileUrl('terms-of-service.html')}>Terms</a>
            </div>
            <div className="footer-inline-action" aria-label="Primary contact">
              {whatsappHref ? (
                <a href={whatsappHref} target="_blank" rel="noreferrer">
                  WhatsApp
                </a>
              ) : (
                <a href={`tel:${info.CONTACT}`}>Call</a>
              )}
            </div>
          </div>
          <div className="footer-bottom">
            <p>
              &copy; {currentYear} {info.TITLE}
              {info.COUNTER_HOURS ? ` · ${info.COUNTER_HOURS}` : ''}
              {info.ONLINE_STORE_URL ? (
                <>
                  {' '}
                  ·{' '}
                  <a href={info.ONLINE_STORE_URL} target="_blank" rel="noreferrer">
                    Online Store
                  </a>
                </>
              ) : null}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default DefaultShell;
