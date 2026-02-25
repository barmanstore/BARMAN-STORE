import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { User, Shield, LogOut, ChevronDown, Settings, X, ShoppingCart, CreditCard } from 'lucide-react';
import { resolveMediaSourceForDisplay } from '../services/api';
import './UserMenu.css';

function UserMenu({ user, setUser, inMobileNav = false, onNavigate = () => {} }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState('');
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 768;
  });
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const isMobileContext = inMobileNav && isMobileViewport;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    const handleEsc = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    const isMobile = window.innerWidth <= 768;
    const previousOverflow = document.body.style.overflow;
    if (isMobile && !isMobileContext) document.body.style.overflow = 'hidden';

    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen, isMobileContext]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileViewport(window.innerWidth <= 768);
      if (window.innerWidth > 768) {
        setMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    setUser(null);
    setMenuOpen(false);
    onNavigate();
    navigate('/');
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [user?.profile_image]);

  useEffect(() => {
    let cancelled = false;
    let revokeUrl = null;
    const run = async () => {
      if (avatarLoadFailed || !user?.profile_image) {
        setAvatarSrc('');
        return;
      }
      const resolved = await resolveMediaSourceForDisplay(user.profile_image);
      if (cancelled) {
        if (resolved.revoke && resolved.src) URL.revokeObjectURL(resolved.src);
        return;
      }
      setAvatarSrc(resolved.src || '');
      revokeUrl = resolved.revoke ? resolved.src : null;
    };
    run();
    return () => {
      cancelled = true;
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    };
  }, [user?.profile_image, avatarLoadFailed]);

  const profileImageSrc = !avatarLoadFailed ? avatarSrc : '';
  const closeAccountMenu = () => setMenuOpen(false);
  const closeAccountMenuAndNav = () => {
    setMenuOpen(false);
    onNavigate();
  };
  const handleAccountToggle = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setMenuOpen((prev) => !prev);
  };
  const renderAvatar = (className) => (
    <span className={className}>
      {profileImageSrc ? (
        <img
          src={profileImageSrc}
          alt={user?.name || 'User'}
          className="avatar-image"
          onError={() => setAvatarLoadFailed(true)}
        />
      ) : user?.name ? (
        getInitials(user.name)
      ) : (
        <User size={18} />
      )}
    </span>
  );

  return (
    <div className={`user-menu-container ${isMobileContext ? 'inline-mode' : ''}`} ref={menuRef}>
      {user ? (
        <>
          {/* Logged in - Show user avatar button */}
          <button 
            type="button"
            className="user-menu-button logged-in"
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onClick={handleAccountToggle}
            aria-label="Account menu"
            aria-expanded={menuOpen}
          >
            {renderAvatar('user-avatar')}
            <span className="user-menu-label">Account</span>
            <ChevronDown size={16} className={`chevron ${menuOpen ? 'open' : ''}`} />
          </button>

          {/* Dropdown menu */}
          {menuOpen && (
            <>
              {isMobileContext ? (
                <div className="user-dropdown user-dropdown-inline open">
                  <div className="dropdown-header">
                    {renderAvatar('dropdown-avatar')}
                    <div className="dropdown-user-info">
                      <span className="dropdown-user-name">{user.name || 'User'}</span>
                      <span className="dropdown-user-email">{user.email || user.phone || 'No email'}</span>
                    </div>
                    <button
                      type="button"
                      className="dropdown-close-btn"
                      aria-label="Close account menu"
                      onClick={closeAccountMenu}
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="dropdown-divider"></div>

                  <div className="dropdown-menu">
                    <Link to="/profile" className="dropdown-item" onClick={closeAccountMenuAndNav}>
                      <User size={18} />
                      <span>My Profile</span>
                    </Link>
                    {user.role === 'customer' && (
                      <Link to="/my-credit" className="dropdown-item" onClick={closeAccountMenuAndNav}>
                        <CreditCard size={18} />
                        <span>My Credit History</span>
                      </Link>
                    )}
                    <div className="dropdown-divider"></div>
                    <Link to="/change-password" className="dropdown-item" onClick={closeAccountMenuAndNav}>
                      <Settings size={18} />
                      <span>Change Password</span>
                    </Link>
                    <button className="dropdown-item logout-item" onClick={handleLogout}>
                      <LogOut size={18} />
                      <span>Sign out</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className="user-menu-overlay"
                    aria-label="Close account menu"
                    onClick={closeAccountMenu}
                  />
                  <div className="user-dropdown fade-in-up open">
                    <div className="dropdown-header">
                      {renderAvatar('dropdown-avatar')}
                      <div className="dropdown-user-info">
                        <span className="dropdown-user-name">{user.name || 'User'}</span>
                        <span className="dropdown-user-email">{user.email || user.phone || 'No email'}</span>
                      </div>
                      <button
                        type="button"
                        className="dropdown-close-btn"
                        aria-label="Close account menu"
                        onClick={closeAccountMenu}
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <div className="dropdown-divider"></div>

                    <div className="dropdown-menu">
                      <Link to="/profile" className="dropdown-item" onClick={closeAccountMenu}>
                        <User size={18} />
                        <span>My Profile</span>
                      </Link>

                      {user.role === 'admin' && (
                        <Link to="/admin" className="dropdown-item admin-item" onClick={closeAccountMenu}>
                          <Shield size={18} />
                          <span>Admin Panel</span>
                        </Link>
                      )}
                      <Link to="/my-orders" className="dropdown-item" onClick={closeAccountMenu}>
                        <ShoppingCart size={18} />
                        <span>My Orders</span>
                      </Link>

                      {user.role === 'customer' && (
                        <Link to="/my-credit" className="dropdown-item" onClick={closeAccountMenu}>
                          <CreditCard size={18} />
                          <span>My Credit History</span>
                        </Link>
                      )}

                      <div className="dropdown-divider"></div>

                      <Link to="/change-password" className="dropdown-item" onClick={closeAccountMenu}>
                        <Settings size={18} />
                        <span>Change Password</span>
                      </Link>

                      <button className="dropdown-item logout-item" onClick={handleLogout}>
                        <LogOut size={18} />
                        <span>Sign out</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </>
      ) : (
        <>
          {/* Not logged in - Show Sign in button */}
          <Link to="/login" className="user-menu-button sign-in-btn" onClick={onNavigate}>
            <span>Sign in</span>
          </Link>
        </>
      )}
    </div>
  );
}

export default UserMenu;
