import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

const parseIdentifier = (rawValue) => {
  const raw = String(rawValue || '').trim();
  if (!raw) return { error: 'Enter your email or phone number' };
  if (raw.includes('@')) {
    const email = raw.toLowerCase();
    if (!validateEmail(email)) return { error: 'Please enter a valid email address' };
    return { email, phone: null, type: 'email' };
  }
  if (!isValidIndianPhone(raw)) return { error: PHONE_POLICY_MESSAGE };
  return { email: null, phone: normalizeIndianPhone(raw), type: 'phone' };
};

const sanitizeSupabaseUrl = (value) => String(value || '').trim().replace(/\/+$/, '');

function Login({ setUser }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');
  const [address, setAddress] = useState('');
  const [resetReason, setResetReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [authMeta, setAuthMeta] = useState({
    loaded: false,
    resetMode: 'admin',
    supabaseEnabled: false,
    supabaseMode: 'hybrid',
    supabaseClientReady: false,
    supabaseUrl: '',
  });
  const oauthHandledRef = useRef(false);
  const navigate = useNavigate();

  const isSupabaseSocialReady = Boolean(
    authMeta.supabaseEnabled && authMeta.supabaseClientReady && authMeta.supabaseUrl
  );
  const isAdminResetFlow = String(authMeta.resetMode || '').toLowerCase() === 'admin';

  useEffect(() => {
    let cancelled = false;
    const loadAuthMeta = async () => {
      try {
        const payload = await authApi.getResetMode();
        if (cancelled) return;
        setAuthMeta({
          loaded: true,
          resetMode: String(payload?.mode || 'admin').toLowerCase(),
          supabaseEnabled: Boolean(payload?.supabase_auth_enabled),
          supabaseMode: String(payload?.supabase_auth_mode || 'hybrid').toLowerCase() === 'strict' ? 'strict' : 'hybrid',
          supabaseClientReady: Boolean(payload?.supabase_client_ready),
          supabaseUrl: sanitizeSupabaseUrl(payload?.supabase_url),
        });
      } catch (_) {
        if (cancelled) return;
        setAuthMeta((prev) => ({ ...prev, loaded: true }));
      }
    };
    loadAuthMeta();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (oauthHandledRef.current || typeof window === 'undefined') return;
    oauthHandledRef.current = true;

    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
      const qpEmail = String(params.get('email') || '').trim().toLowerCase();
      const qpPhone = normalizeIndianPhone(params.get('phone') || '');
      const qpToken = String(params.get('token') || '').trim();
      const qpPhoneToken = String(params.get('phoneToken') || '').trim();
      const hashType = String(hashParams.get('type') || '').trim().toLowerCase();
      const accessToken = String(hashParams.get('access_token') || '').trim();
      const refreshToken = String(hashParams.get('refresh_token') || '').trim();
      const oauthError = decodeURIComponent(String(hashParams.get('error_description') || hashParams.get('error') || '').trim());

      if (qpEmail) setIdentifier(qpEmail);
      if (!qpEmail && qpPhone) setIdentifier(qpPhone);
      if (qpToken || qpPhoneToken) {
        setSuccess('Verification token detected. Sign in and complete verification from your Profile page.');
      }
      if (oauthError) {
        setError(oauthError);
      }
      if (!accessToken) return;

      const nextUrl = `${window.location.pathname}${window.location.search}`;
      window.history.replaceState({}, document.title, nextUrl);

      if (hashType === 'recovery') {
        try {
          sessionStorage.setItem('supabase_recovery_access_token', accessToken);
        } catch (_) {
          // Ignore storage failures and continue with query fallback.
        }
        navigate('/change-password?recovery=1', { replace: true });
        return;
      }

      try {
        setLoading(true);
        setError('');
        const sessionPayload = await authApi.getSessionFromToken(accessToken);
        const nextToken = String(sessionPayload?.token || accessToken).trim();
        const mergedSession = refreshToken
          ? {
            access_token: accessToken,
            refresh_token: refreshToken || null,
            token_type: 'bearer',
          }
          : null;
        const nextUser = {
          ...(sessionPayload?.user || {}),
          token: nextToken,
          auth_provider: sessionPayload?.auth_provider || 'supabase',
          supabase_session: mergedSession,
        };
        localStorage.setItem('user', JSON.stringify(nextUser));
        setUser(nextUser);
        if (nextUser.must_change_password) {
          navigate('/change-password?force=1', { replace: true });
          return;
        }
        if (nextUser.role === 'admin') {
          navigate('/admin', { replace: true });
          return;
        }
        navigate('/', { replace: true });
      } catch (err) {
        setError(err?.message || 'Social sign-in failed');
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [navigate, setUser]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      let data;
      if (isRegistering) {
        const normalizedRegisterEmail = String(registerEmail || '').trim().toLowerCase();
        const normalizedRegisterPhone = registerPhone ? normalizeIndianPhone(registerPhone) : '';
        if (!normalizedRegisterEmail && !normalizedRegisterPhone) {
          throw new Error('Enter at least one contact: email or phone');
        }
        if (normalizedRegisterEmail && !validateEmail(normalizedRegisterEmail)) {
          throw new Error('Please enter a valid email address');
        }
        if (password !== confirmPassword) {
          throw new Error('Password and confirm password do not match');
        }
        if (registerPhone && !normalizedRegisterPhone) {
          throw new Error(PHONE_POLICY_MESSAGE);
        }
        if (!validateStrongPassword(password)) {
          throw new Error('Password must be at least 10 characters and include uppercase, lowercase, number, and special character');
        }
        data = await authApi.register(
          normalizedRegisterEmail || null,
          password,
          confirmPassword,
          name,
          normalizedRegisterPhone || null,
          address || null
        );
      } else {
        const parsed = parseIdentifier(identifier);
        if (parsed.error) throw new Error(parsed.error);
        data = parsed.type === 'email'
          ? await authApi.login(parsed.email, password)
          : await authApi.loginWithPhone(parsed.phone, password);
      }

      const persisted = {
        ...data.user,
        token: data.token,
        auth_provider: data.auth_provider || 'legacy',
        supabase_session: data.supabase_session || null,
      };
      localStorage.setItem('user', JSON.stringify(persisted));
      setUser(persisted);

      if (data.user.must_change_password) {
        const forceParams = new URLSearchParams();
        forceParams.set('force', '1');
        const nextEmail = String(data.user?.email || '').trim().toLowerCase();
        const nextPhone = normalizeIndianPhone(data.user?.phone || '');
        if (nextEmail) forceParams.set('email', nextEmail);
        if (!nextEmail && nextPhone) forceParams.set('phone', nextPhone);
        navigate(`/change-password?${forceParams.toString()}`);
      } else if (data.user.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err?.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResetRequest = async () => {
    try {
      setError('');
      setSuccess('');
      const parsed = parseIdentifier(identifier);
      if (parsed.error) {
        throw new Error('Enter your email or phone first to request reset');
      }
      const reason = String(resetReason || '').trim();
      if (isAdminResetFlow && reason.length < 5) {
        throw new Error('Please provide a short reason (min 5 characters) for admin review');
      }
      const response = await authApi.requestPasswordReset(parsed.email, parsed.phone, reason || null);
      setSuccess(response?.message || 'Password reset request submitted');
    } catch (err) {
      setError(err?.message || 'Failed to submit reset request');
    }
  };

  const handleSocialLogin = (provider) => {
    const normalizedProvider = String(provider || '').trim().toLowerCase();
    if (normalizedProvider !== 'google' && normalizedProvider !== 'facebook') return;
    setError('');
    if (!isSupabaseSocialReady) {
      setError('Social login is not configured yet. Enable Supabase auth and provider keys first.');
      return;
    }
    try {
      setOauthLoading(normalizedProvider);
      const redirectTo = `${window.location.origin}/login`;
      const params = new URLSearchParams({
        provider: normalizedProvider,
        redirect_to: redirectTo,
      });
      if (normalizedProvider === 'google') {
        params.set('scopes', 'email profile');
      } else if (normalizedProvider === 'facebook') {
        params.set('scopes', 'email,public_profile');
      }
      window.location.assign(`${sanitizeSupabaseUrl(authMeta.supabaseUrl)}/auth/v1/authorize?${params.toString()}`);
    } catch (err) {
      setOauthLoading('');
      setError(err?.message || 'Unable to start social sign-in');
    }
  };

  const switchMode = (registerMode) => {
    setIsRegistering(registerMode);
    setError('');
    setSuccess('');
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <h1>{isRegistering ? 'Create Account' : 'Welcome Back'}</h1>
        <p className="login-subtitle">
          {isRegistering
            ? 'Create your account with email or phone'
            : 'Sign in with email, phone, or social provider'}
        </p>

        <div className="auth-view-switch">
          <button
            type="button"
            className={`switch-btn ${!isRegistering ? 'active' : ''}`}
            onClick={() => switchMode(false)}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`switch-btn ${isRegistering ? 'active' : ''}`}
            onClick={() => switchMode(true)}
          >
            Register
          </button>
        </div>

        {error ? <div className="error-message">{error}</div> : null}
        {success ? <div className="success-message">{success}</div> : null}

        <form onSubmit={handleSubmit} className="login-form">
          {isRegistering && (
            <>
              <div className="form-group">
                <label htmlFor="name">Full Name</label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  required={isRegistering}
                />
              </div>

              <div className="form-row-two">
                <div className="form-group">
                  <label htmlFor="registerEmail">Email (Optional)</label>
                  <input
                    type="email"
                    id="registerEmail"
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    placeholder="name@example.com"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="registerPhone">Phone (Optional)</label>
                  <input
                    type="tel"
                    id="registerPhone"
                    value={registerPhone}
                    onChange={(e) => setRegisterPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="address">Address (Optional)</label>
                <input
                  type="text"
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Flat/Street/City"
                />
              </div>
            </>
          )}

          {!isRegistering && (
            <div className="form-group">
              <label htmlFor="identifier">Email or Phone</label>
              <input
                type="text"
                id="identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Email or India phone number"
                required
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>

          {isRegistering && (
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                required
              />
            </div>
          )}

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? 'Please wait...' : (isRegistering ? 'Create Account' : 'Sign In')}
          </button>
        </form>

        {!isRegistering && (
          <>
            <div className="oauth-divider"><span>or continue with</span></div>
            <div className="oauth-grid">
              <button
                type="button"
                className="oauth-btn google"
                disabled={!isSupabaseSocialReady || Boolean(oauthLoading)}
                onClick={() => handleSocialLogin('google')}
              >
                {oauthLoading === 'google' ? 'Redirecting...' : 'Google'}
              </button>
              <button
                type="button"
                className="oauth-btn facebook"
                disabled={!isSupabaseSocialReady || Boolean(oauthLoading)}
                onClick={() => handleSocialLogin('facebook')}
              >
                {oauthLoading === 'facebook' ? 'Redirecting...' : 'Facebook'}
              </button>
            </div>

            <div className="password-reset-box">
              <h3>Password Reset</h3>
              <p>
                {isAdminResetFlow
                  ? 'Enter your email/phone and a short reason for admin review.'
                  : 'Enter your email/phone to receive reset instructions.'}
              </p>
              <textarea
                value={resetReason}
                onChange={(e) => setResetReason(e.target.value)}
                placeholder={isAdminResetFlow ? 'Reason for reset request' : 'Optional note'}
                rows={2}
              />
              <button type="button" className="login-button secondary" onClick={handleResetRequest}>
                Request Password Reset
              </button>
            </div>
          </>
        )}

        <div className="login-footer">
          <p>
            <Link to="/change-password">Change Password</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
