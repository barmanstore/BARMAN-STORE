import { BrowserRouter } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import AppShell from './components/AppShell';
import { notificationsApi } from './services/api';
import useLockBodyScroll from './hooks/useLockBodyScroll';
import { safeLocalStorageGet, safeLocalStorageRemove } from './utils/storage';
import './index.css';
import './App.css';
import * as info from './pages/info.js';

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

  const notificationProps = {
    notificationPanelOpen,
    onToggleNotificationPanel: toggleNotificationPanel,
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
    onToggleRecipientSelection: toggleRecipientSelection,
    onSendInboxMessage: sendInboxMessage,
    onLoadOlderNotifications: loadOlderNotifications,
    onResolveNotificationHref: resolveNotificationHref,
    onToggleNotificationExpanded: toggleNotificationExpanded,
    onMarkNotificationRead: markNotificationRead,
    onRecipientSearchChange: handleRecipientSearchChange,
    onMessageDraftChange: handleMessageDraftChange,
    onClearRecipientSelection: clearRecipientSelection,
  };

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
          notificationProps={notificationProps}
          callHref={callHref}
          whatsappHref={whatsappHref}
          publicFileUrl={getPublicFileUrl}
          setCartCount={setCartCount}
        />
    </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
