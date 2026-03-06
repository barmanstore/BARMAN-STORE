import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { ShoppingCart, Menu, X, Package, ClipboardList, Home as HomeIcon, Store, Shield, FileText, Lightbulb, BellRing, ChevronDown, MessageCircle, Phone } from 'lucide-react';
import { useState, useEffect, lazy, Suspense, useRef } from 'react';
import UserMenu from './components/UserMenu';
import ErrorBoundary from './components/ErrorBoundary';
import { analyticsApi, notificationsApi } from './services/api';
import { truncateUserName } from './utils/formatters';
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
    analyticsApi.startSession({
      session_id: existingSessionId,
      path: latestPathRef.current,
      referrer: typeof document !== 'undefined' ? document.referrer || '' : '',
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const currentPath = `${location.pathname || '/'}${location.search || ''}`;
    latestPathRef.current = currentPath;
    if (!sessionIdRef.current) return;
    analyticsApi.heartbeat({
      session_id: sessionIdRef.current,
      path: currentPath,
    }).catch(() => {});
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const interval = window.setInterval(() => {
      if (!sessionIdRef.current) return;
      analyticsApi.heartbeat({
        session_id: sessionIdRef.current,
        path: latestPathRef.current || '/',
      }).catch(() => {});
    }, 30000);
    return () => window.clearInterval(interval);
  }, []);

  return null;
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
    let isCancelled = false;
    let timerId = null;

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
      loadNotifications(false);
      timerId = window.setInterval(() => loadNotifications(true), 30000);
    } else {
      setNotifications([]);
      setUnreadNotificationCount(0);
      setNotificationsNextBeforeId(null);
      setNotificationsHasMore(false);
    }

    return () => {
      isCancelled = true;
      if (timerId) window.clearInterval(timerId);
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

  useEffect(() => {
    if (!mobileMenuOpen) {
      document.body.style.overflow = '';
      return undefined;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);

  return (
    <ErrorBoundary>
      <BrowserRouter
        basename={routerBasename}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
      <div className="app">
        <VisitorTracker />
        {/* Header */}
        <header className="header">
          <div className="header-content">
            <button
              className="mobile-menu-btn"
              aria-expanded={mobileMenuOpen}
              aria-controls="app-mobile-nav"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              onClick={() => setMobileMenuOpen((prev) => !prev)}
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            <Link to="/" className="logo">
              <img src={logoImage} alt="Logo" className="logo-image" />
              <span className="logo-bar">{info.TITLE}</span>
            </Link>

            <nav id="app-mobile-nav" className={`nav ${mobileMenuOpen ? 'nav-open' : ''}`}>
              <Link to="/" onClick={closeMobileMenu}>
                <HomeIcon size={20} /> Home
              </Link>
              <Link to="/products" onClick={closeMobileMenu}>
                <Store size={20} /> Products
              </Link>
              <div className="orders-menu" role="group" aria-label="Orders">
                <button type="button" className="orders-trigger" aria-haspopup="menu" aria-label="Orders menu">
                  <ClipboardList size={20} /> Orders <ChevronDown size={16} />
                </button>
                <div className="orders-submenu" role="menu" aria-label="Orders submenu">
                  <Link to="/order-history" className="orders-submenu-item" role="menuitem" onClick={closeMobileMenu}>
                    <ClipboardList size={18} /> Order History
                  </Link>
                  <Link to="/order-tracking" className="orders-submenu-item" role="menuitem" onClick={closeMobileMenu}>
                    <Package size={18} /> Track
                  </Link>
                  <Link to="/my-bills" className="orders-submenu-item" role="menuitem" onClick={closeMobileMenu}>
                    <FileText size={18} /> Bills
                  </Link>
                  <Link to="/product-requests" className="orders-submenu-item" role="menuitem" onClick={closeMobileMenu}>
                    <Lightbulb size={18} /> Request Product
                  </Link>
                </div>
              </div>
              <Link to="/order-history" className="mobile-nav-only" onClick={closeMobileMenu}>
                <ClipboardList size={20} /> Order History
              </Link>
              <Link to="/order-tracking" className="mobile-nav-only" onClick={closeMobileMenu}>
                <Package size={20} /> Track
              </Link>
              <Link to="/my-bills" className="mobile-nav-only" onClick={closeMobileMenu}>
                <FileText size={20} /> Bills
              </Link>
              <Link to="/product-requests" className="mobile-nav-only" onClick={closeMobileMenu}>
                <Lightbulb size={20} /> Request Product
              </Link>
              <Link to="/cart" className="cart-link mobile-nav-only" onClick={closeMobileMenu}>
                <ShoppingCart size={20} />
                {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
              </Link>
              {user?.role === 'admin' && (
                <Link to="/admin" onClick={closeMobileMenu} className="mobile-admin-link">
                  <Shield size={20} /> Admin Panel
                </Link>
              )}
              
              {/* Combined User Menu (Profile, Login/Logout, Admin) */}
              <div className="mobile-user-menu">
                <UserMenu user={user} setUser={setUser} inMobileNav onNavigate={closeMobileMenu} />
              </div>
            </nav>
            <div className="header-right-tools">
              <Link to="/cart" className="header-cart-link" onClick={closeMobileMenu} aria-label="Open cart">
                <ShoppingCart size={20} />
                {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
              </Link>
              {user?.id ? (
                <div className={`notification-inbox ${notificationPanelOpen ? 'open' : ''}`} ref={notificationInboxRef}>
                  <button
                    type="button"
                    className="notification-inbox-toggle"
                    onClick={() => setNotificationPanelOpen((prev) => !prev)}
                    aria-expanded={notificationPanelOpen}
                    aria-label="Notification Inbox"
                  >
                    <BellRing size={16} />
                    {unreadNotificationCount > 0 && (
                      <em className="notification-unread-count">{unreadNotificationCount}</em>
                    )}
                  </button>
                  {notificationPanelOpen ? (
                    <div className="notification-inbox-panel">
                      <div className="notification-inbox-head">
                        <strong>Notification Inbox</strong>
                      </div>
                      <div className="notification-compose-box">
                        <strong className="notification-compose-title">Conversation</strong>
                        {isAdminUser ? (
                          <>
                            <input
                              id="notification-recipient-search"
                              name="recipient_search"
                              type="text"
                              className="notification-compose-input"
                              value={recipientSearch}
                              onChange={(e) => setRecipientSearch(e.target.value)}
                              placeholder="Search customers..."
                            />
                            {selectedRecipientIds.length > 0 ? (
                              <div className="notification-selected-strip">
                                <span>{selectedRecipientIds.length} selected</span>
                                <button
                                  type="button"
                                  onClick={() => setSelectedRecipientIds([])}
                                >
                                  Clear
                                </button>
                              </div>
                            ) : null}
                            <div className="notification-recipient-list">
                              {messageRecipients.length === 0 ? (
                                <p className="notification-recipients-empty">No customers found.</p>
                              ) : (
                                messageRecipients.map((recipient) => {
                                  const recipientId = Number(recipient?.id || 0);
                                  const checked = selectedRecipientIds.includes(recipientId);
                                  return (
                                    <label key={recipientId} className="notification-recipient-item">
                                      <input
                                        id={`notification-recipient-${recipientId}`}
                                        name="recipient_user_ids"
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleRecipientSelection(recipientId)}
                                      />
                                      <span>
                                        {truncateUserName(recipient?.name || `Customer #${recipientId}`, 15)}
                                        {recipient?.phone ? ` (${recipient.phone})` : ''}
                                      </span>
                                    </label>
                                  );
                                })
                              )}
                            </div>
                          </>
                        ) : (
                          <p className="notification-compose-helper">Send a message to admin.</p>
                        )}
                        <input
                          id="notification-compose-message"
                          name="message"
                          type="text"
                          className="notification-compose-input notification-compose-message-input"
                          value={messageDraft}
                          onChange={(e) => setMessageDraft(e.target.value)}
                          placeholder={isAdminUser ? 'Write message to selected customers...' : 'Write message for admin...'}
                          maxLength={1000}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (!messageSending) {
                                void sendInboxMessage();
                              }
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="notification-compose-send"
                          onClick={sendInboxMessage}
                          disabled={messageSending}
                        >
                          {messageSending ? 'Sending...' : 'Send Message'}
                        </button>
                        {messageFeedback.text ? (
                          <p className={`notification-compose-feedback ${messageFeedback.type === 'error' ? 'error' : 'success'}`}>
                            {messageFeedback.text}
                          </p>
                        ) : null}
                      </div>
                      {notifications.length === 0 ? (
                        <p className="notification-inbox-empty">No notifications yet.</p>
                      ) : (
                        <div className="notification-inbox-list">
                          {notifications.map((notice) => {
                            const href = resolveNotificationHref(notice);
                            const isExpanded = Number(expandedNotificationId || 0) === Number(notice?.id || 0);
                            return (
                              <article
                                key={notice.id}
                                className={`notification-inbox-item ${notice?.is_read ? 'is-read' : 'is-unread'} ${isExpanded ? 'is-expanded' : 'is-collapsed'}`}
                                role="button"
                                tabIndex={0}
                                onClick={() => { void toggleNotificationExpanded(notice); }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    void toggleNotificationExpanded(notice);
                                  }
                                }}
                              >
                                <div className="notification-item-head">
                                  <strong>{notice.title}</strong>
                                  <div className="notification-item-head-right">
                                    <small>{new Date(notice.created_at || Date.now()).toLocaleString()}</small>
                                    <ChevronDown size={14} className={`notification-expand-icon ${isExpanded ? 'expanded' : ''}`} />
                                  </div>
                                </div>
                                <p className={`notification-item-message ${isExpanded ? 'expanded' : 'collapsed'}`}>{notice.message}</p>
                                <div className="notification-item-actions">
                                  <Link
                                    to={href}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setNotificationPanelOpen(false);
                                      if (!notice?.is_read) markNotificationRead(notice.id);
                                    }}
                                  >
                                    Open
                                  </Link>
                                </div>
                              </article>
                            );
                          })}
                          {notificationsHasMore ? (
                            <button
                              type="button"
                              className="notification-load-more"
                              onClick={() => { void loadOlderNotifications(); }}
                            >
                              Load older
                            </button>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="desktop-user-menu">
                <UserMenu user={user} setUser={setUser} onNavigate={closeMobileMenu} />
              </div>
            </div>
          </div>
        </header>
        {mobileMenuOpen ? <button className="mobile-nav-backdrop" aria-label="Close menu" onClick={closeMobileMenu} /> : null}

        {/* Main Content */}
        <main className="main-content">
          <Suspense fallback={<div style={{ padding: '24px' }}>Loading...</div>}>
            <Routes>
              <Route path="/" element={<Home />} />
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
            </Routes>
          </Suspense>
        </main>
        <div className="quick-contact-fab" aria-label="Quick contact options">
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
    </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
