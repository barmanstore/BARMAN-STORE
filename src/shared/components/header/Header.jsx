import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Menu,
  X,
  Package,
  ClipboardList,
  Home as HomeIcon,
  Store,
  Shield,
  FileText,
  Lightbulb,
  BellRing,
  ChevronDown,
  ShoppingCart,
} from 'lucide-react';
import HeaderSearchBar from './HeaderSearchBar';
import HeaderCartIcon from './HeaderCartIcon';
import UserMenu from '../UserMenu';
import { truncateUserName } from '../../utils/formatters';
import useIsMobile from '../../hooks/useIsMobile';
import * as info from '../../info.js';

const Header = memo(function Header({
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
}) {
  const isMobile = useIsMobile();
  const isSimpleInbox = isMobile;
  const [ordersMenuOpen, setOrdersMenuOpen] = useState(false);

  return (
    <header className="header" ref={headerRef}>
      <div className="header-content">
        <button
          className="mobile-menu-btn"
          aria-expanded={mobileMenuOpen}
          aria-controls="app-mobile-nav"
          aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          onClick={onToggleMobileMenu}
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        <Link to="/" className="logo">
          <img src={logoImage} alt="Logo" className="logo-image" />
          <span className="logo-bar">{info.TITLE}</span>
        </Link>

        <nav id="app-mobile-nav" className={`nav ${mobileMenuOpen ? 'nav-open' : ''}`}>
          <Link to="/" className="mobile-nav-only" onClick={onCloseMobileMenu}>
            <HomeIcon size={20} /> Home
          </Link>
          <Link to="/products" onClick={onCloseMobileMenu}>
            <Store size={20} /> Shop
          </Link>
          <div
            className="orders-menu header-nav-primary"
            role="group"
            aria-label="Orders"
            onMouseLeave={() => setOrdersMenuOpen(false)}
          >
            <button
              type="button"
              className="orders-trigger"
              aria-haspopup="menu"
              aria-expanded={ordersMenuOpen}
              aria-controls="orders-submenu"
              aria-label="Orders menu"
              onClick={() => setOrdersMenuOpen((prev) => !prev)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setOrdersMenuOpen(true);
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setOrdersMenuOpen(false);
                }
              }}
            >
              <ClipboardList size={20} /> Orders <ChevronDown size={15} />
            </button>
            <div
              id="orders-submenu"
              className={`orders-submenu ${ordersMenuOpen ? 'open' : ''}`}
              role="menu"
              aria-label="Orders submenu"
            >
              <Link to="/order-history" className="orders-submenu-item" role="menuitem" onClick={onCloseMobileMenu}>
                <ClipboardList size={18} /> Order History
              </Link>
              <Link to="/order-tracking" className="orders-submenu-item" role="menuitem" onClick={onCloseMobileMenu}>
                <Package size={18} /> Track
              </Link>
              <Link to="/my-bills" className="orders-submenu-item" role="menuitem" onClick={onCloseMobileMenu}>
                <FileText size={18} /> Bills
              </Link>
              <Link to="/product-requests" className="orders-submenu-item" role="menuitem" onClick={onCloseMobileMenu}>
                <Lightbulb size={18} /> Request Product
              </Link>
            </div>
          </div>
          <Link to="/order-history" className="mobile-nav-only" onClick={onCloseMobileMenu}>
            <ClipboardList size={20} /> Order History
          </Link>
          <Link to="/order-tracking" className="mobile-nav-only" onClick={onCloseMobileMenu}>
            <Package size={20} /> Track
          </Link>
          <Link to="/my-bills" className="mobile-nav-only" onClick={onCloseMobileMenu}>
            <FileText size={20} /> Bills
          </Link>
          <Link to="/product-requests" className="mobile-nav-only" onClick={onCloseMobileMenu}>
            <Lightbulb size={20} /> Request Product
          </Link>
          <Link to="/cart" className="cart-link mobile-nav-only" onClick={onCloseMobileMenu}>
            <ShoppingCart size={20} />
            {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
          </Link>
          {user?.role === 'admin' && (
            <Link to="/admin" onClick={onCloseMobileMenu} className="mobile-admin-link">
              <Shield size={20} /> Admin Panel
            </Link>
          )}

          <div className="mobile-user-menu">
            <UserMenu user={user} setUser={setUser} inMobileNav onNavigate={onCloseMobileMenu} />
          </div>
        </nav>

        <div className="header-right-tools">
          <HeaderSearchBar />
          <HeaderCartIcon count={cartCount} onClick={onCloseMobileMenu} />
          {user?.id ? (
            <div className={`notification-inbox ${notificationPanelOpen ? 'open' : ''}`} ref={notificationInboxRef}>
              <button
                type="button"
                className="notification-inbox-toggle"
                onClick={onToggleNotificationPanel}
                aria-expanded={notificationPanelOpen}
                aria-label="Notification Inbox"
              >
                <BellRing size={16} />
                {unreadNotificationCount > 0 && (
                  <em className="notification-unread-count">{unreadNotificationCount}</em>
                )}
              </button>
              {notificationPanelOpen ? (
                <div className={`notification-inbox-panel ${isSimpleInbox ? 'notification-inbox-panel-simple' : ''}`}>
                  <div className="notification-inbox-head">
                    <strong>Notification Inbox</strong>
                  </div>
                  {notificationFeedback?.text ? (
                    <p
                      className={`notification-compose-feedback ${notificationFeedback.type === 'error' ? 'error' : 'success'}`}
                      role={notificationFeedback.type === 'error' ? 'alert' : 'status'}
                    >
                      {notificationFeedback.text}
                    </p>
                  ) : null}
                  {isSimpleInbox ? null : (
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
                            onChange={(e) => onRecipientSearchChange(e.target.value)}
                            placeholder="Search customers..."
                          />
                          {selectedRecipientIds.length > 0 ? (
                            <div className="notification-selected-strip">
                              <span>{selectedRecipientIds.length} selected</span>
                              <button
                                type="button"
                                onClick={onClearRecipientSelection}
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
                                      onChange={() => onToggleRecipientSelection(recipientId)}
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
                        onChange={(e) => onMessageDraftChange(e.target.value)}
                        placeholder={isAdminUser ? 'Write message to selected customers...' : 'Write message for admin...'}
                        maxLength={1000}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (!messageSending) {
                              void onSendInboxMessage();
                            }
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="notification-compose-send"
                        onClick={onSendInboxMessage}
                        disabled={messageSending}
                      >
                        {messageSending ? 'Sending...' : 'Send Message'}
                      </button>
                      {messageFeedback.text ? (
                        <p
                          className={`notification-compose-feedback ${messageFeedback.type === 'error' ? 'error' : 'success'}`}
                          role={messageFeedback.type === 'error' ? 'alert' : 'status'}
                        >
                          {messageFeedback.text}
                        </p>
                      ) : null}
                    </div>
                  )}
                  {notifications.length === 0 ? (
                    <p className="notification-inbox-empty">No notifications yet.</p>
                  ) : (
                    <ul className={`notification-inbox-list ${isSimpleInbox ? 'simple' : ''}`}>
                      {notifications.slice(0, isSimpleInbox ? 6 : notifications.length).map((notice) => {
                        const href = onResolveNotificationHref(notice);
                        const isExpanded = Number(expandedNotificationId || 0) === Number(notice?.id || 0);
                        return (
                          <li key={notice.id}>
                            {isSimpleInbox ? (
                              <Link
                                to={href}
                                className={`notification-inbox-item ${isSimpleInbox ? 'simple' : ''} ${notice?.is_read ? 'is-read' : 'is-unread'}`}
                                onClick={() => {
                                  onToggleNotificationPanel();
                                  if (!notice?.is_read) onMarkNotificationRead(notice.id);
                                }}
                              >
                                <div className="notification-item-head">
                                  <strong>{notice.title}</strong>
                                  <div className="notification-item-head-right">
                                    <small>{new Date(notice.created_at || Date.now()).toLocaleString()}</small>
                                  </div>
                                </div>
                                <p className="notification-item-message collapsed">{notice.message}</p>
                                <span className="notification-item-link">Open</span>
                              </Link>
                            ) : (
                              <div
                                className={`notification-inbox-item ${notice?.is_read ? 'is-read' : 'is-unread'} ${isExpanded ? 'is-expanded' : 'is-collapsed'}`}
                              >
                                <button
                                  type="button"
                                  className="notification-item-trigger"
                                  aria-expanded={isExpanded}
                                  aria-controls={`notification-message-${notice.id}`}
                                  onClick={() => { void onToggleNotificationExpanded(notice); }}
                                >
                                  <div className="notification-item-head">
                                    <strong>{notice.title}</strong>
                                    <div className="notification-item-head-right">
                                      <small>{new Date(notice.created_at || Date.now()).toLocaleString()}</small>
                                      <ChevronDown size={14} className={`notification-expand-icon ${isExpanded ? 'expanded' : ''}`} />
                                    </div>
                                  </div>
                                </button>
                                <p
                                  id={`notification-message-${notice.id}`}
                                  className={`notification-item-message ${isExpanded ? 'expanded' : 'collapsed'}`}
                                >
                                  {notice.message}
                                </p>
                                <div className="notification-item-actions">
                                  <Link
                                    to={href}
                                    onClick={() => {
                                      onToggleNotificationPanel();
                                      if (!notice?.is_read) onMarkNotificationRead(notice.id);
                                    }}
                                  >
                                    Open
                                  </Link>
                                </div>
                              </div>
                            )}
                          </li>
                        );
                      })}
                      {isSimpleInbox ? null : (notificationsHasMore ? (
                        <li>
                          <button
                            type="button"
                            className="notification-load-more"
                            onClick={() => { void onLoadOlderNotifications(); }}
                          >
                            Load older
                          </button>
                        </li>
                      ) : null)}
                      {isSimpleInbox && notifications.length > 6 ? (
                        <li>
                          <p className="notification-simple-hint">Showing latest 6 notifications.</p>
                        </li>
                      ) : null}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="desktop-user-menu">
            <UserMenu user={user} setUser={setUser} onNavigate={onCloseMobileMenu} />
          </div>
        </div>
      </div>
    </header>
  );
});

export default Header;

