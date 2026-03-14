import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { MessageCircle, Phone } from 'lucide-react';
import { useState, useEffect, lazy, Suspense, useRef } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import Header from './components/header/Header';
import { analyticsApi, notificationsApi } from './services/api';
import useLockBodyScroll from './hooks/useLockBodyScroll';
import useIsMobile from './hooks/useIsMobile';
import './index.css';
import './App.css';
import * as info from './pages/info.js';

const Home = lazy(() => import('./pages/Home'));
const Products = lazy(() => import('./pages/Products'));
const Cart = lazy(() => import('./pages/Cart'));
const Checkout = lazy(() => import('./pages/Checkout'));
const Login = lazy(() => import('./pages/login'));
const Admin = lazy(() => import('./pages/Admin'));
const CreditHistory = lazy(() => import('./pages/CreditHistory'));
const OrderHistory = lazy(() => import('./pages/OrderHistory'));
const OrderTracking = lazy(() => import('./pages/OrderTracking'));
const OrderDetails = lazy(() => import('./pages/OrderDetails'));
const Profile = lazy(() => import('./pages/Profile'));
const MyBills = lazy(() => import('./pages/MyBills'));
const ProductRecommendations = lazy(() => import('./pages/ProductRecommendations'));
const StoreInfo = lazy(() => import('./pages/StoreInfo'));
const StorePage = lazy(() => import('./pages/StorePage'));


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

const VISITOR_SESSION_STORAGE_KEY = 'visitor_session_id';

const safeLocalStorageGet = (key) => {
  try {
    return window.localStorage.getItem(key);
  } catch (_) {
    return null;
  }
};

const safeLocalStorageSet = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (_) {
    return false;
  }
};

const safeLocalStorageRemove = (key) => {
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch (_) {
    return false;
  }
};

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
  callHref,
  whatsappHref,
  setCartCount,
}) {
  const location = useLocation();
  const isMobile = useIsMobile();
  const isHomeRoute = location.pathname === '/' || location.pathname === '';
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
  const homeRouteElement = isMobile ? <Navigate to="/products" replace /> : <Home />;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('mobile-hide-chrome', shouldHideChrome);
    return () => {
      document.body.classList.remove('mobile-hide-chrome');
    };
  }, [shouldHideChrome]);

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
    <div className="app">
      <VisitorTracker />
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

      {/* Main Content */}
      <main className="main-content">
        <Suspense fallback={<div style={{ padding: '24px' }}>Loading...</div>}>
          <Routes>
            <Route path="/" element={homeRouteElement} />
            <Route path="/products" element={<Products setCartCount={setCartCount} />} />
            <Route path="/cart" element={<Cart cartCount={cartCount} setCartCount={setCartCount} />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/login" element={<Login setUser={setUser} />} />
            <Route path="/admin" element={<Admin user={user} />} />
            <Route path="/admin/users/:userId/credit" element={<CreditHistory user={user} />} />
            <Route path="/my-credit" element={<CreditHistory user={user} />} />
            <Route path="/order-history" element={<OrderHistory />} />
            <Route path="/my-orders" element={<Navigate to="/order-history" replace />} />
            <Route path="/orders/:id" element={<OrderDetails />} />
            <Route path="/order-tracking" element={<OrderTracking />} />
            <Route path="/order-tracking/:orderId" element={<OrderTracking />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/my-bills" element={<MyBills />} />
            <Route path="/product-requests" element={<ProductRecommendations />} />
            <Route path="/store-info" element={<StoreInfo />} />
            <Route
              path="/store"
              element={(
                <StorePage
                  notifications={notifications}
                  unreadNotificationCount={unreadNotificationCount}
                  onResolveNotificationHref={onResolveNotificationHref}
                  onMarkNotificationRead={onMarkNotificationRead}
                />
              )}
            />
          </Routes>
        </Suspense>
      </main>
      <div
        className={`quick-contact-fab ${dragStateRef.current.active ? 'dragging' : ''}`}
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

      {/* Footer */}
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
              <a href={getPublicFileUrl('terms-of-service.html')}>Terms of Service</a>
              <a href={getPublicFileUrl('privacy-policy.html')}>Privacy Policy</a>
              <a href={getPublicFileUrl('data-deletion.html')}>Data Deletion</a>
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

function App() {
  const [cartCount, setCartCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [notificationsNextBeforeId, setNotificationsNextBeforeId] = useState(null);
  const [notificationsHasMore, setNotificationsHasMore] = useState(false);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [expandedNotificationId, setExpandedNotificationId] = useState(null);
  const [messageDraft, setMessageDraft] = useState('');
  const [messageRecipients, setMessageRecipients] = useState([]);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState([]);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [messageSending, setMessageSending] = useState(false);
  const [messageFeedback, setMessageFeedback] = useState({ type: '', text: '' });
  const notificationInboxRef = useRef(null);
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
  const toggleNotificationPanel = () => setNotificationPanelOpen((prev) => !prev);
  const handleRecipientSearchChange = (value) => setRecipientSearch(value);
  const handleMessageDraftChange = (value) => setMessageDraft(value);
  const clearRecipientSelection = () => {
    setSelectedRecipientIds([]);
    setRecipientSearch('');
  };

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

  useEffect(() => {
    let isCancelled = false;
    let timerId = null;
    let bootstrapTimerId = null;

    const unpackNotificationPayload = (payload) => {
      if (Array.isArray(payload)) {
        return {
          items: payload,
          nextBeforeId: null,
          hasMore: false,
        };
      }
      const items = Array.isArray(payload?.items) ? payload.items : [];
      return {
        items,
        nextBeforeId: Number(payload?.paging?.next_before_id || 0) || null,
        hasMore: Boolean(payload?.paging?.has_more),
      };
    };

    const loadNotifications = async (silent = false) => {
      if (!user?.id) {
        if (!isCancelled) {
          setNotifications([]);
          setUnreadNotificationCount(0);
          setNotificationsNextBeforeId(null);
          setNotificationsHasMore(false);
        }
        return;
      }
      try {
        const [rows, unreadCount] = await Promise.all([
          notificationsApi.listMine({ unreadOnly: false, limit: 40 }),
          notificationsApi.getUnreadCount(),
        ]);
        if (isCancelled) return;
        const unpacked = unpackNotificationPayload(rows);
        setNotifications(unpacked.items);
        setNotificationsNextBeforeId(unpacked.nextBeforeId);
        setNotificationsHasMore(unpacked.hasMore);
        setUnreadNotificationCount(Number(unreadCount?.count || 0));
      } catch (_) {
        if (!silent && !isCancelled) {
          setNotifications([]);
          setUnreadNotificationCount(0);
          setNotificationsNextBeforeId(null);
          setNotificationsHasMore(false);
        }
      }
    };

    if (user?.id) {
      bootstrapTimerId = window.setTimeout(() => {
        if (!isCancelled) {
          void loadNotifications(false);
        }
      }, 700);
      timerId = window.setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        void loadNotifications(true);
      }, 45000);
    } else {
      setNotifications([]);
      setUnreadNotificationCount(0);
      setNotificationsNextBeforeId(null);
      setNotificationsHasMore(false);
    }

    return () => {
      isCancelled = true;
      if (timerId) window.clearInterval(timerId);
      if (bootstrapTimerId) window.clearTimeout(bootstrapTimerId);
    };
  }, [user?.id]);

  const reloadNotifications = async () => {
    if (!user?.id) return;
    try {
      const [rows, unreadCount] = await Promise.all([
        notificationsApi.listMine({ unreadOnly: false, limit: 40 }),
        notificationsApi.getUnreadCount(),
      ]);
      const items = Array.isArray(rows)
        ? rows
        : (Array.isArray(rows?.items) ? rows.items : []);
      setNotifications(items);
      setNotificationsNextBeforeId(Number(rows?.paging?.next_before_id || 0) || null);
      setNotificationsHasMore(Boolean(rows?.paging?.has_more));
      setUnreadNotificationCount(Number(unreadCount?.count || 0));
    } catch (_) {
      // ignore refresh errors
    }
  };

  const loadOlderNotifications = async () => {
    if (!user?.id || !notificationsHasMore || !notificationsNextBeforeId) return;
    try {
      const rows = await notificationsApi.listMine({
        unreadOnly: false,
        limit: 40,
        beforeId: notificationsNextBeforeId,
      });
      const items = Array.isArray(rows)
        ? rows
        : (Array.isArray(rows?.items) ? rows.items : []);
      setNotifications((prev) => {
        const seen = new Set((prev || []).map((row) => Number(row?.id || 0)));
        const nextRows = [...prev];
        items.forEach((row) => {
          const id = Number(row?.id || 0);
          if (!id || seen.has(id)) return;
          nextRows.push(row);
          seen.add(id);
        });
        return nextRows;
      });
      setNotificationsNextBeforeId(Number(rows?.paging?.next_before_id || 0) || null);
      setNotificationsHasMore(Boolean(rows?.paging?.has_more));
    } catch (_) {
      // ignore load-more errors
    }
  };

  useEffect(() => {
    if (!notificationPanelOpen || !user?.id || !isAdminUser) {
      setMessageRecipients([]);
      setSelectedRecipientIds([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const rows = await notificationsApi.listMessageRecipients(recipientSearch, 20);
        if (cancelled) return;
        setMessageRecipients(Array.isArray(rows) ? rows : []);
      } catch (_) {
        if (!cancelled) setMessageRecipients([]);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [notificationPanelOpen, user?.id, isAdminUser, recipientSearch]);

  useEffect(() => {
    if (!notificationPanelOpen) {
      setMessageFeedback({ type: '', text: '' });
      setExpandedNotificationId(null);
    }
  }, [notificationPanelOpen]);

  const resolveNotificationHref = (notice) => {
    const metadata = notice?.metadata && typeof notice.metadata === 'object'
      ? notice.metadata
      : {};
    const metadataRoute = String(metadata?.route || '').trim();
    if (metadataRoute.startsWith('/')) return metadataRoute;
    const entityType = String(notice?.entity_type || '').trim().toLowerCase();
    const issueId = Number(notice?.issue_id || metadata?.issue_id || 0) || null;
    const creditEntryId = Number(metadata?.credit_entry_id || 0) || null;
    const targetUserId = Number(metadata?.user_id || 0) || null;
    const orderId = Number(notice?.entity_id || metadata?.order_id || 0) || null;
    const recommendationId = Number(notice?.entity_id || metadata?.recommendation_id || 0) || null;
    if (entityType === 'order') {
      return orderId ? `/orders/${orderId}` : '/order-history';
    }
    if (entityType === 'product_recommendation') {
      if (user?.role === 'admin') {
        return recommendationId
          ? `/admin?tab=customer-requests&recommendationId=${encodeURIComponent(String(recommendationId))}`
          : '/admin?tab=customer-requests';
      }
      return '/product-requests';
    }
    if (entityType === 'credit_entry_issue') {
      const params = new URLSearchParams();
      if (issueId) params.set('focusIssue', String(issueId));
      if (creditEntryId) params.set('focusEntry', String(creditEntryId));
      if (user?.role === 'admin') {
        params.set('returnTab', 'customer-requests');
        if (targetUserId) {
          const query = params.toString();
          return `/admin/users/${targetUserId}/credit${query ? `?${query}` : ''}`;
        }
        return '/admin?tab=customer-requests';
      }
      const query = params.toString();
      return query ? `/my-credit?${query}` : '/my-credit';
    }
    return user?.role === 'admin' ? '/admin' : '/profile';
  };

  const markNotificationRead = async (id) => {
    const targetId = Number(id || 0);
    if (!targetId) return;
    try {
      await notificationsApi.markRead(targetId);
      setNotifications((prev) => prev.map((row) => (
        Number(row?.id || 0) === targetId
          ? { ...row, is_read: true, read_at: row?.read_at || new Date().toISOString() }
          : row
      )));
      setUnreadNotificationCount((prev) => Math.max(0, Number(prev || 0) - 1));
    } catch (_) {
      // ignore mark-read failures in inbox
    }
  };

  const toggleNotificationExpanded = async (notice) => {
    const targetId = Number(notice?.id || 0);
    if (!targetId) return;
    const shouldExpand = Number(expandedNotificationId || 0) !== targetId;
    setExpandedNotificationId((prev) => (Number(prev || 0) === targetId ? null : targetId));
    if (shouldExpand && !notice?.is_read) {
      await markNotificationRead(targetId);
    }
  };

  const toggleRecipientSelection = (recipientId) => {
    const id = Number(recipientId || 0);
    if (!id) return;
    setSelectedRecipientIds((prev) => (
      prev.includes(id)
        ? prev.filter((value) => value !== id)
        : [...prev, id]
    ));
  };

  const sendInboxMessage = async () => {
    const message = String(messageDraft || '').trim();
    if (!message) {
      setMessageFeedback({ type: 'error', text: 'Message is required.' });
      return;
    }
    try {
      setMessageSending(true);
      setMessageFeedback({ type: '', text: '' });
      if (isAdminUser) {
        if (!selectedRecipientIds.length) {
          setMessageFeedback({ type: 'error', text: 'Select at least one customer.' });
          return;
        }
        const result = await notificationsApi.sendMessageToCustomers({
          recipient_user_ids: selectedRecipientIds,
          message,
        });
        const sentCount = Number(result?.sent_count || selectedRecipientIds.length);
        setMessageFeedback({ type: 'success', text: `Message sent to ${sentCount} customer(s).` });
        setSelectedRecipientIds([]);
        setRecipientSearch('');
      } else {
        await notificationsApi.sendMessageToAdmin(message);
        setMessageFeedback({ type: 'success', text: 'Message sent to admin inbox.' });
      }
      setMessageDraft('');
      await reloadNotifications();
    } catch (error) {
      setMessageFeedback({ type: 'error', text: error?.message || 'Failed to send message.' });
    } finally {
      setMessageSending(false);
    }
  };

  useEffect(() => {
    if (!notificationPanelOpen) return undefined;
    const handleClickOutside = (event) => {
      if (!notificationInboxRef.current) return;
      if (notificationInboxRef.current.contains(event.target)) return;
      setNotificationPanelOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [notificationPanelOpen]);

  return (
    <ErrorBoundary>
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
          notificationPanelOpen={notificationPanelOpen}
          onToggleNotificationPanel={toggleNotificationPanel}
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
          onToggleRecipientSelection={toggleRecipientSelection}
          onSendInboxMessage={sendInboxMessage}
          onLoadOlderNotifications={loadOlderNotifications}
          onResolveNotificationHref={resolveNotificationHref}
          onToggleNotificationExpanded={toggleNotificationExpanded}
          onMarkNotificationRead={markNotificationRead}
          onRecipientSearchChange={handleRecipientSearchChange}
          onMessageDraftChange={handleMessageDraftChange}
          onClearRecipientSelection={clearRecipientSelection}
          callHref={callHref}
          whatsappHref={whatsappHref}
          setCartCount={setCartCount}
        />
    </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
