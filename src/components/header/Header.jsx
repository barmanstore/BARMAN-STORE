import { memo } from 'react';
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
import * as info from '../../pages/info.js';

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
          <Link to="/" onClick={onCloseMobileMenu}>
            <HomeIcon size={20} /> Home
          </Link>
          <Link to="/products" onClick={onCloseMobileMenu}>
            <Store size={20} /> Products
          </Link>
          <div className="orders-menu" role="group" aria-label="Orders">
            <button type="button" className="orders-trigger" aria-haspopup="menu" aria-label="Orders menu">
              <ClipboardList size={20} /> Orders <ChevronDown size={16} />
            </button>
            <div className="orders-submenu" role="menu" aria-label="Orders submenu">
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
                        <p className={`notification-compose-feedback ${messageFeedback.type === 'error' ? 'error' : 'success'}`}>
                          {messageFeedback.text}
                        </p>
                      ) : null}
                    </div>
                  )}
                  {notifications.length === 0 ? (
                    <p className="notification-inbox-empty">No notifications yet.</p>
                  ) : (
                    <div className={`notification-inbox-list ${isSimpleInbox ? 'simple' : ''}`}>
                      {notifications.slice(0, isSimpleInbox ? 6 : notifications.length).map((notice) => {
                        const href = onResolveNotificationHref(notice);
                        const isExpanded = Number(expandedNotificationId || 0) === Number(notice?.id || 0);
                        return (
                          <article
                            key={notice.id}
                            className={`notification-inbox-item ${isSimpleInbox ? 'simple' : ''} ${notice?.is_read ? 'is-read' : 'is-unread'} ${isExpanded ? 'is-expanded' : 'is-collapsed'}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => { void onToggleNotificationExpanded(notice); }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                void onToggleNotificationExpanded(notice);
                              }
                            }}
                          >
                            <div className="notification-item-head">
                              <strong>{notice.title}</strong>
                              <div className="notification-item-head-right">
                                <small>{new Date(notice.created_at || Date.now()).toLocaleString()}</small>
                                {!isSimpleInbox ? (
                                  <ChevronDown size={14} className={`notification-expand-icon ${isExpanded ? 'expanded' : ''}`} />
                                ) : null}
                              </div>
                            </div>
                            <p className={`notification-item-message ${isSimpleInbox ? 'collapsed' : (isExpanded ? 'expanded' : 'collapsed')}`}>{notice.message}</p>
                            {isSimpleInbox ? (
                              <Link
                                to={href}
                                className="notification-item-link"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleNotificationPanel();
                                  if (!notice?.is_read) onMarkNotificationRead(notice.id);
                                }}
                              >
                                Open
                              </Link>
                            ) : (
                              <div className="notification-item-actions">
                                <Link
                                  to={href}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleNotificationPanel();
                                    if (!notice?.is_read) onMarkNotificationRead(notice.id);
                                  }}
                                >
                                  Open
                                </Link>
                              </div>
                            )}
                          </article>
                        );
                      })}
                      {isSimpleInbox ? null : (notificationsHasMore ? (
                        <button
                          type="button"
                          className="notification-load-more"
                          onClick={() => { void onLoadOlderNotifications(); }}
                        >
                          Load older
                        </button>
                      ) : null)}
                      {isSimpleInbox && notifications.length > 6 ? (
                        <p className="notification-simple-hint">Showing latest 6 notifications.</p>
                      ) : null}
                    </div>
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
