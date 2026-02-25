import { BrowserRouter, HashRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { ShoppingCart, Menu, X, Package, ClipboardList, Home as HomeIcon, Store, Shield } from 'lucide-react';
import { useState, useEffect, lazy, Suspense, useRef } from 'react';
import UserMenu from './components/UserMenu';
import ErrorBoundary from './components/ErrorBoundary';
import { analyticsApi } from './services/api';
import './index.css';
import './App.css';
import * as info from './pages/info.js';
import logoImage from '../logo.png';

const Home = lazy(() => import('./pages/Home'));
const Products = lazy(() => import('./pages/Products'));
const Cart = lazy(() => import('./pages/Cart'));
const Checkout = lazy(() => import('./pages/Checkout'));
const Login = lazy(() => import('./pages/login'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));
const Admin = lazy(() => import('./pages/Admin'));
const CreditHistory = lazy(() => import('./pages/CreditHistory'));
const OrderHistory = lazy(() => import('./pages/OrderHistory'));
const OrderTracking = lazy(() => import('./pages/OrderTracking'));
const MyOrders = lazy(() => import('./pages/MyOrders'));
const OrderDetails = lazy(() => import('./pages/OrderDetails'));
const Profile = lazy(() => import('./pages/Profile'));


// React Router v7 future flags to opt-in early and suppress warnings
const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true
};

const isGitHubPagesHost = (() => {
  if (typeof window === 'undefined') return false;
  return /\.github\.io$/i.test(window.location.hostname);
})();

const Router = isGitHubPagesHost ? HashRouter : BrowserRouter;
const routerBasename = (() => {
  if (isGitHubPagesHost) return '/';
  const base = String(import.meta.env.BASE_URL || '/');
  return base === '/' ? '/' : base.replace(/\/$/, '');
})();

const getGitHubPagesHashUrl = (path = '/') => {
  if (typeof window === 'undefined') return path;
  const normalizedPath = String(path || '/').startsWith('/') ? String(path) : `/${path}`;
  const basePath = String(import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return `${window.location.origin}${basePath}/#${normalizedPath}`;
};

const VISITOR_SESSION_STORAGE_KEY = 'visitor_session_id';

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
    let existingSessionId = String(window.localStorage.getItem(VISITOR_SESSION_STORAGE_KEY) || '').trim();
    if (!existingSessionId) {
      existingSessionId = createVisitorSessionId();
      window.localStorage.setItem(VISITOR_SESSION_STORAGE_KEY, existingSessionId);
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
  const closeMobileMenu = () => setMobileMenuOpen(false);

  useEffect(() => {
    // Check for existing user session
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (_) {
        localStorage.removeItem('user');
        setUser(null);
      }
    }
  }, []);

  useEffect(() => {
    const syncUserFromStorage = () => {
      const savedUser = localStorage.getItem('user');
      if (!savedUser) {
        setUser(null);
        return;
      }
      try {
        setUser(JSON.parse(savedUser));
      } catch (_) {
        localStorage.removeItem('user');
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
    if (!isGitHubPagesHost || typeof window === 'undefined') return;
    const currentHash = String(window.location.hash || '');
    if (currentHash && currentHash.startsWith('#/')) return;

    const basePath = String(import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    const pathWithoutBase = window.location.pathname.replace(basePath, '') || '/';
    const normalizedPath = pathWithoutBase.startsWith('/') ? pathWithoutBase : `/${pathWithoutBase}`;

    if (normalizedPath === '/') return;

    const target = getGitHubPagesHashUrl(normalizedPath);
    window.location.replace(target + window.location.search);
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
      <Router basename={routerBasename} future={routerFuture}>
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
              <span className="logo-bar">BAR</span>
              <span className="logo-man">MAN</span>
              <span className="logo-store">STORE</span>
            </Link>

            <nav id="app-mobile-nav" className={`nav ${mobileMenuOpen ? 'nav-open' : ''}`}>
              <Link to="/" onClick={closeMobileMenu}>
                <HomeIcon size={20} /> Home
              </Link>
              <Link to="/products" onClick={closeMobileMenu}>
                <Store size={20} /> Products
              </Link>
              <Link to="/order-history" onClick={closeMobileMenu}>
                <ClipboardList size={20} /> Orders
              </Link>
              <Link to="/order-tracking" onClick={closeMobileMenu}>
                <Package size={20} /> Track
              </Link>
              {user && (
                <Link to="/my-orders" onClick={closeMobileMenu} className="mobile-my-orders-link">
                  <ShoppingCart size={20} /> My Orders
                </Link>
              )}
              <Link to="/cart" className="cart-link" onClick={closeMobileMenu}>
                <ShoppingCart size={20} />
                {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
              </Link>
              {user?.role === 'admin' && (
                <Link to="/admin" onClick={closeMobileMenu} className="mobile-admin-link">
                  <Shield size={20} /> Admin Panel
                </Link>
              )}
              
              {/* Combined User Menu (Profile, Login/Logout, Admin) */}
              <UserMenu user={user} setUser={setUser} inMobileNav onNavigate={closeMobileMenu} />
            </nav>
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
              <Route path="/change-password" element={<ChangePassword />} />
              <Route path="/admin" element={<Admin user={user} />} />
              <Route path="/admin/users/:userId/credit" element={<CreditHistory user={user} />} />
              <Route path="/my-credit" element={<CreditHistory user={user} />} />
              <Route path="/order-history" element={<OrderHistory />} />
              <Route path="/my-orders" element={<MyOrders />} />
              <Route path="/orders/:id" element={<OrderDetails />} />
              <Route path="/order-tracking" element={<OrderTracking />} />
              <Route path="/order-tracking/:orderId" element={<OrderTracking />} />
              <Route path="/profile" element={<Profile />} />
            </Routes>
          </Suspense>
        </main>

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
              </div>
            </div>
            <div className="footer-section footer-contact">
              <h4>CONTACT US</h4>
              <div className="footer-contact-list">
                <p>Email: {info.EMAIL}</p>
                <p>Phone: {info.CONTACT}</p>
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; 2026 {info.TITLE}. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </Router>
    </ErrorBoundary>
  );
}

export default App;
