import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, LogOut, User } from 'lucide-react';
import { useSession } from '../../../providers/SessionProvider';
import { resolveMediaSourceForDisplay } from '../../services/api';
import './MobileAccountHeader.css';

const getInitials = (name) => {
  const trimmed = String(name || '').trim();
  if (!trimmed) return '?';
  return trimmed
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
};

function MobileAccountHeader({ headerRef = null }) {
  const navigate = useNavigate();
  const { user, clearUser } = useSession();
  const [failedAvatarSrc, setFailedAvatarSrc] = useState('');
  const [avatarSrc, setAvatarSrc] = useState('');

  useEffect(() => {
    let cancelled = false;
    let revokeUrl = null;
    const run = async () => {
      if (failedAvatarSrc === user?.profile_image || !user?.profile_image) {
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
  }, [user?.profile_image, failedAvatarSrc]);

  const handleLogin = () => navigate('/login');
  const handleLogout = () => {
    clearUser();
    navigate('/products');
  };

  const displayName = String(user?.name || '').trim() || 'Guest';
  const displaySub = String(user?.email || user?.phone || '').trim();

  return (
    <header className="mobile-account-header" ref={headerRef}>
      <div className="mobile-account-card">
        <div className="mobile-account-avatar" aria-hidden="true">
          {failedAvatarSrc === user?.profile_image ? null : avatarSrc ? (
            <img
              src={avatarSrc}
              alt={displayName}
              onError={() => setFailedAvatarSrc(user?.profile_image || '')}
            />
          ) : displayName ? (
            <span>{getInitials(displayName)}</span>
          ) : (
            <User size={18} />
          )}
        </div>
        <div className="mobile-account-text">
          <h1>{displayName}</h1>
          {displaySub ? <p>{displaySub}</p> : <p>Account & support center</p>}
        </div>
        <div className="mobile-account-action">
          {user?.id ? (
            <button type="button" className="mobile-account-btn" onClick={handleLogout}>
              <LogOut size={16} />
              Logout
            </button>
          ) : (
            <button type="button" className="mobile-account-btn" onClick={handleLogin}>
              <LogIn size={16} />
              Login
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export default MobileAccountHeader;
