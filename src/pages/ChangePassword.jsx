import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import { isValidIndianPhone, normalizeIndianPhone, PHONE_POLICY_MESSAGE } from '../utils/phone';
import './login.css';

const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());

const validateStrongPassword = (password) => {
  const value = String(password || '');
  return (
    value.length >= 10 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /[0-9]/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
};

function ChangePassword() {
  const [identifierType, setIdentifierType] = useState('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [identifierLocked, setIdentifierLocked] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryAccessToken, setRecoveryAccessToken] = useState('');
  const [supabaseRecoveryReady, setSupabaseRecoveryReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const loadMeta = async () => {
      try {
        const mode = await authApi.getResetMode();
        if (cancelled) return;
        setSupabaseRecoveryReady(Boolean(mode?.supabase_auth_enabled && mode?.supabase_client_ready));
      } catch (_) {
        if (cancelled) return;
        setSupabaseRecoveryReady(false);
      }
    };
    loadMeta();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let storedUser = null;
    try {
      const raw = localStorage.getItem('user');
      storedUser = raw ? JSON.parse(raw) : null;
    } catch (_) {
      storedUser = null;
    }

    const params = new URLSearchParams(location.search);
    const hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
    const hashType = String(hashParams.get('type') || '').trim().toLowerCase();
    const hashAccessToken = String(hashParams.get('access_token') || '').trim();
    const queryRecovery = params.get('recovery') === '1';
    const queryToken = String(params.get('access_token') || '').trim();
    let sessionRecoveryToken = '';
    try {
      sessionRecoveryToken = String(sessionStorage.getItem('supabase_recovery_access_token') || '').trim();
    } catch (_) {
      sessionRecoveryToken = '';
    }
    const resolvedRecoveryToken = hashAccessToken || queryToken || sessionRecoveryToken;
    const isRecoveryFromHash = hashType === 'recovery';
    const shouldUseRecoveryMode = Boolean((queryRecovery || isRecoveryFromHash) && resolvedRecoveryToken);
    if (shouldUseRecoveryMode) {
      setRecoveryMode(true);
      setIdentifierLocked(true);
      setRecoveryAccessToken(resolvedRecoveryToken);
      if (window.location.hash) {
        const cleanUrl = `${window.location.pathname}${window.location.search}`;
        window.history.replaceState({}, document.title, cleanUrl);
      }
      return;
    }

    const forcedFromQuery = params.get('force') === '1';
    const forcedFromSession = Boolean(storedUser?.must_change_password);
    const shouldLockIdentifier = forcedFromQuery || forcedFromSession;
    const qpEmail = String(params.get('email') || '').trim().toLowerCase();
    const qpPhone = normalizeIndianPhone(params.get('phone') || '');
    const sessionEmail = String(storedUser?.email || '').trim().toLowerCase();
    const sessionPhone = normalizeIndianPhone(storedUser?.phone || '');

    if (qpEmail && validateEmail(qpEmail)) {
      setIdentifierType('email');
      setEmail(qpEmail);
      setPhone('');
      setIdentifierLocked(shouldLockIdentifier);
      return;
    }
    if (sessionEmail && validateEmail(sessionEmail)) {
      setIdentifierType('email');
      setEmail(sessionEmail);
      setPhone('');
      setIdentifierLocked(shouldLockIdentifier);
      return;
    }
    if (qpPhone) {
      setIdentifierType('phone');
      setPhone(qpPhone);
      setEmail('');
      setIdentifierLocked(shouldLockIdentifier);
      return;
    }
    if (sessionPhone) {
      setIdentifierType('phone');
      setPhone(sessionPhone);
      setEmail('');
      setIdentifierLocked(shouldLockIdentifier);
      return;
    }
    setIdentifierLocked(false);
  }, [location.search]);

  const submitLabel = useMemo(() => {
    if (loading && recoveryMode) return 'Resetting Password...';
    if (loading) return 'Changing Password...';
    return recoveryMode ? 'Reset Password' : 'Change Password';
  }, [loading, recoveryMode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      setLoading(false);
      return;
    }
    if (!validateStrongPassword(newPassword)) {
      setError('Password must be at least 10 characters and include uppercase, lowercase, number, and special character');
      setLoading(false);
      return;
    }

    try {
      if (recoveryMode) {
        if (!supabaseRecoveryReady) {
          throw new Error('Supabase recovery reset is not enabled on server');
        }
        if (!recoveryAccessToken) {
          throw new Error('Recovery access token is missing');
        }
        const response = await authApi.completeRecoveryPasswordReset({
          access_token: recoveryAccessToken,
          new_password: newPassword,
          confirm_password: confirmPassword,
        });
        const nextUser = { ...response.user, token: response.token, auth_provider: response.auth_provider || 'supabase' };
        localStorage.setItem('user', JSON.stringify(nextUser));
        try {
          sessionStorage.removeItem('supabase_recovery_access_token');
        } catch (_) {
          // ignore
        }
        window.dispatchEvent(new Event('user-updated'));
        setSuccess('Password reset complete. Redirecting...');
        setTimeout(() => navigate('/profile'), 800);
        return;
      }

      if (identifierType === 'email' && !validateEmail(email)) {
        throw new Error('Please enter a valid email address');
      }
      if (identifierType === 'phone' && !isValidIndianPhone(phone)) {
        throw new Error(PHONE_POLICY_MESSAGE);
      }

      await authApi.changePassword(
        identifierType === 'email' ? String(email || '').trim().toLowerCase() : null,
        identifierType === 'phone' ? normalizeIndianPhone(phone) : null,
        currentPassword,
        newPassword,
        confirmPassword
      );

      try {
        const raw = localStorage.getItem('user');
        const currentUser = raw ? JSON.parse(raw) : null;
        if (currentUser && currentUser.must_change_password) {
          const updated = { ...currentUser, must_change_password: false };
          localStorage.setItem('user', JSON.stringify(updated));
          window.dispatchEvent(new Event('user-updated'));
        }
      } catch (_) {
        // ignore
      }

      setSuccess('Password changed successfully. Redirecting...');
      setTimeout(() => navigate('/login'), 850);
    } catch (err) {
      setError(err?.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <h1>{recoveryMode ? 'Reset Password' : 'Change Password'}</h1>
        <p className="login-subtitle">
          {recoveryMode
            ? 'Set a new password for your account'
            : 'Verify your account and set a new password'}
        </p>

        {error ? <div className="error-message">{error}</div> : null}
        {success ? <div className="success-message">{success}</div> : null}

        <form onSubmit={handleSubmit} className="login-form">
          {!recoveryMode && (
            <>
              <div className="login-method-toggle">
                <button
                  type="button"
                  className={`toggle-btn ${identifierType === 'email' ? 'active' : ''}`}
                  onClick={() => setIdentifierType('email')}
                  disabled={identifierLocked || loading}
                >
                  Email
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${identifierType === 'phone' ? 'active' : ''}`}
                  onClick={() => setIdentifierType('phone')}
                  disabled={identifierLocked || loading}
                >
                  Phone
                </button>
              </div>

              {identifierType === 'email' && (
                <div className="form-group">
                  <label htmlFor="email">Email</label>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    required
                    disabled={identifierLocked || loading}
                  />
                </div>
              )}

              {identifierType === 'phone' && (
                <div className="form-group">
                  <label htmlFor="phone">Phone Number</label>
                  <input
                    type="tel"
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    required
                    disabled={identifierLocked || loading}
                  />
                </div>
              )}

              <div className="form-group">
                <label htmlFor="currentPassword">Current Password</label>
                <input
                  type="password"
                  id="currentPassword"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  required
                  disabled={loading}
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="newPassword">New Password</label>
            <input
              type="password"
              id="newPassword"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm New Password</label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              required
              disabled={loading}
            />
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {submitLabel}
          </button>
        </form>

        <p className="auth-form-meta">
          Password policy: minimum 10 chars with uppercase, lowercase, number, and special character.
        </p>

        <p className="login-link">
          <Link to="/login">Back to Login</Link>
        </p>
      </div>
    </div>
  );
}

export default ChangePassword;
