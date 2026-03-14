import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, CreditCard, MapPin, HelpCircle, ShieldCheck, Receipt, BellRing } from 'lucide-react';
import MobileAccountLayout from '../components/mobile/MobileAccountLayout';
import './StorePage.css';

const readLocalUser = () => {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(window.localStorage.getItem('user') || 'null');
  } catch (_) {
    return null;
  }
};

function StorePage({
  notifications = [],
  unreadNotificationCount = 0,
  onResolveNotificationHref = () => '/profile',
  onMarkNotificationRead = () => {},
}) {
  const [user, setUser] = useState(() => readLocalUser());
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const navigate = useNavigate();
  const isAdminUser = String(user?.role || '').trim().toLowerCase() === 'admin';
  const isLoggedIn = Boolean(
    user?.id
    || String(user?.token || '').trim()
    || String(user?.supabase_session?.access_token || '').trim()
    || String(user?.email || '').trim()
    || String(user?.phone || '').trim()
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const syncUser = () => setUser(readLocalUser());
    window.addEventListener('storage', syncUser);
    window.addEventListener('user-updated', syncUser);
    return () => {
      window.removeEventListener('storage', syncUser);
      window.removeEventListener('user-updated', syncUser);
    };
  }, []);

  return (
    <MobileAccountLayout>
      <div className="store-page">

      {isAdminUser ? (
        <section className="store-section">
          <h2>Store</h2>
          <div className="store-links">
            <Link to="/admin" className="store-link">
              <span>
                <ShieldCheck size={18} />
                Admin Panel
              </span>
            </Link>
          </div>
        </section>
      ) : null}

      <section className="store-section">
        <h2>My Account</h2>
        <div className="store-links">
          <button
            type="button"
            className="store-link store-link-button"
            onClick={() => {
              if (!isLoggedIn) {
                navigate('/login');
                return;
              }
              setNotificationsOpen((prev) => !prev);
            }}
            aria-expanded={notificationsOpen}
          >
            <span>
              <BellRing size={18} />
              Notifications
            </span>
            {isLoggedIn && unreadNotificationCount > 0 ? (
              <em className="store-badge">{unreadNotificationCount}</em>
            ) : (
              <span className="store-link-meta">
                {isLoggedIn ? (notificationsOpen ? 'Hide' : 'View') : 'Login'}
              </span>
            )}
          </button>
          {isLoggedIn && notificationsOpen ? (
            <div className="store-notifications-panel">
              {notifications.length === 0 ? (
                <p className="store-notifications-empty">No notifications yet.</p>
              ) : (
                <div className="notification-inbox-list simple">
                  {notifications.slice(0, 6).map((notice) => {
                    const href = onResolveNotificationHref(notice);
                    return (
                      <article
                        key={notice.id}
                        className={`notification-inbox-item simple ${notice?.is_read ? 'is-read' : 'is-unread'}`}
                      >
                        <div className="notification-item-head">
                          <strong>{notice.title}</strong>
                          <div className="notification-item-head-right">
                            <small>{new Date(notice.created_at || Date.now()).toLocaleString()}</small>
                          </div>
                        </div>
                        <p className="notification-item-message collapsed">{notice.message}</p>
                        <Link
                          to={href}
                          className="notification-item-link"
                          onClick={() => {
                            setNotificationsOpen(false);
                            if (!notice?.is_read) onMarkNotificationRead(notice.id);
                          }}
                        >
                          Open
                        </Link>
                      </article>
                    );
                  })}
                  {notifications.length > 6 ? (
                    <p className="notification-simple-hint">Showing latest 6 notifications.</p>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
          <Link to="/order-history" className="store-link">
            <span>
              <Receipt size={18} />
              Order History
            </span>
          </Link>
          <Link to="/my-bills" className="store-link">
            <span>
              <FileText size={18} />
              Bill History / Invoices
            </span>
          </Link>
          <Link to="/my-credit" className="store-link">
            <span>
              <CreditCard size={18} />
              Credit Khata
            </span>
          </Link>
          <Link to="/profile" className="store-link">
            <span>
              <MapPin size={18} />
              Saved Addresses
            </span>
          </Link>
        </div>
      </section>

      <section className="store-section">
        <h2>Support</h2>
        <div className="store-links">
          <Link to="/store-info#store-help" className="store-link">
            <span>
              <HelpCircle size={18} />
              Help / Support
            </span>
          </Link>
          <Link to="/store-info#store-terms" className="store-link">
            <span>
              <ShieldCheck size={18} />
              Terms and Conditions
            </span>
          </Link>
          <Link to="/store-info#store-privacy" className="store-link">
            <span>
              <ShieldCheck size={18} />
              Privacy Policy
            </span>
          </Link>
        </div>
      </section>

      </div>
    </MobileAccountLayout>
  );
}

export default StorePage;
