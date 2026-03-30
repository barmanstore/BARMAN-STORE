import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../providers/SessionProvider';
import { authApi } from '../../shared/services/api';
import { validateEmail } from '../../shared/utils/validation';
import MobileAccountLayout from '../../shared/components/mobile/MobileAccountLayout';
import './Login.css';

const sanitizeSupabaseUrl = (value) => String(value || '').trim().replace(/\/+$/, '');
const normalizeBasePath = (value) => {
  const raw = String(value || '/').trim();
  if (!raw || raw === '/') return '';
  return `/${raw.replace(/^\/+|\/+$/g, '')}`;
};
const resolveOAuthRedirectUrl = () => {
  if (typeof window === 'undefined') return '';
  const explicitRedirect = String(import.meta.env.VITE_OAUTH_REDIRECT_URL || '').trim();
  if (explicitRedirect) return explicitRedirect;
  const basePath = normalizeBasePath(import.meta.env.BASE_URL || '/');
  return `${window.location.origin}${basePath}/login`;
};
const isValidAbsoluteHttpUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_) {
    return false;
  }
};
const parseOAuthCallbackParams = () => {
  if (typeof window === 'undefined') {
    return {
      accessToken: '',
      refreshToken: '',
      oauthError: '',
      authCode: '',
      hasCallbackParams: false,
    };
  }

  const hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
  const queryParams = new URLSearchParams(window.location.search || '');

  const pick = (...keys) => {
    for (const key of keys) {
      const fromHash = String(hashParams.get(key) || '').trim();
      if (fromHash) return fromHash;
      const fromQuery = String(queryParams.get(key) || '').trim();
      if (fromQuery) return fromQuery;
    }
    return '';
  };

  const accessToken = pick('access_token');
  const refreshToken = pick('refresh_token');
  const oauthError = decodeURIComponent(pick('error_description', 'error'));
  const authCode = pick('code');
  const hasCallbackParams = [
    accessToken,
    refreshToken,
    oauthError,
    authCode,
    pick('provider_token'),
    pick('token_type'),
    pick('expires_in'),
    pick('state'),
  ].some(Boolean);

  return {
    accessToken,
    refreshToken,
    oauthError,
    authCode,
    hasCallbackParams,
  };
};

const isLikelyInAppBrowser = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = String(navigator.userAgent || '');
  return /(FBAN|FBAV|Instagram|Line\/|WhatsApp|wv\)|\bwv\b)/i.test(ua);
};

const parseIdentifier = (rawValue) => {
  const raw = String(rawValue || '').trim();
  if (!raw) return { error: 'Enter your email address' };
  const email = raw.toLowerCase();
  if (!validateEmail(email)) return { error: 'Please enter a valid email address' };
  return { type: 'email', email, phone: null };
};

function Login() {
  const { setUser } = useSession();
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [devOtpCode, setDevOtpCode] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [step, setStep] = useState('request');
  const [pendingIdentifier, setPendingIdentifier] = useState(null);
  const [showRegisterPrompt, setShowRegisterPrompt] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [authMeta, setAuthMeta] = useState({
    loaded: false,
    supabaseEnabled: false,
    supabaseOauthReady: false,
    supabaseUrl: '',
  });
  const oauthHandledRef = useRef(false);
  const oauthRedirectTimerRef = useRef(null);
  const navigate = useNavigate();

  const isSupabaseSocialReady = Boolean(
    authMeta.supabaseEnabled && authMeta.supabaseOauthReady && authMeta.supabaseUrl
  );

  useEffect(() => {
    let cancelled = false;
    const loadAuthMeta = async () => {
      try {
        const payload = await authApi.getResetMode();
        if (cancelled) return;
        const oauthReady = payload?.supabase_oauth_ready ?? payload?.auth_methods?.oauth ?? payload?.supabase_client_ready;
        setAuthMeta({
          loaded: true,
          supabaseEnabled: Boolean(payload?.supabase_auth_enabled),
          supabaseOauthReady: Boolean(oauthReady),
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
    return () => {
      if (oauthRedirectTimerRef.current) {
        clearTimeout(oauthRedirectTimerRef.current);
        oauthRedirectTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (oauthHandledRef.current || typeof window === 'undefined') return;
    oauthHandledRef.current = true;

    const run = async () => {
      const {
        accessToken,
        refreshToken,
        oauthError,
        authCode,
        hasCallbackParams,
      } = parseOAuthCallbackParams();
      const cleanUrl = `${window.location.pathname}${window.location.search}`;

      if (oauthError) {
        window.history.replaceState({}, document.title, cleanUrl);
        setError(oauthError);
        return;
      }
      if (!accessToken) {
        if (authCode || hasCallbackParams) {
          window.history.replaceState({}, document.title, cleanUrl);
          setError(
            isLikelyInAppBrowser()
              ? 'OAuth was blocked by the in-app browser. Open this site in Chrome or Safari and try again.'
              : 'OAuth callback did not return an access token. Please retry login from a regular browser.'
          );
        }
        return;
      }

      window.history.replaceState({}, document.title, cleanUrl);

      try {
        if (oauthRedirectTimerRef.current) {
          clearTimeout(oauthRedirectTimerRef.current);
          oauthRedirectTimerRef.current = null;
        }
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
        setUser(nextUser);
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

  const handleRequestOtp = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    setDevOtpCode('');
    setShowRegisterPrompt(false);
    try {
      const parsed = parseIdentifier(identifier);
      if (parsed.error) throw new Error(parsed.error);
      const payload = {
        email: parsed.email,
        phone: null,
        mode: authMode,
      };
      const response = await authApi.requestLoginOtp(payload);
      const nextDevOtpCode = String(response?.dev_otp_code || '').trim();
      setPendingIdentifier(parsed);
      setStep('verify');
      setDevOtpCode(nextDevOtpCode);
      if (nextDevOtpCode) {
        setOtp(nextDevOtpCode);
      }
      setSuccess(nextDevOtpCode ? `OTP sent to email. Local dev code: ${nextDevOtpCode}` : 'OTP sent to email.');
    } catch (err) {
      setDevOtpCode('');
      if (err?.payload?.register_required) {
        setShowRegisterPrompt(true);
      }
      if (err?.payload?.login_required) {
        setAuthMode('login');
      }
      setError(err?.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const parsed = pendingIdentifier || parseIdentifier(identifier);
      if (!parsed || parsed.error) throw new Error(parsed?.error || 'Enter your email first');
      const code = String(otp || '').trim();
      if (!code) throw new Error('Enter the OTP code');
      const response = await authApi.verifyLoginOtp({
        email: parsed.email,
        phone: null,
        otp: code,
        mode: authMode,
      });
      const persisted = {
        ...(response?.user || {}),
        token: response?.token,
        auth_provider: response?.auth_provider || 'otp',
        supabase_session: response?.supabase_session || null,
      };
      setUser(persisted);
      if (persisted.role === 'admin') {
        navigate('/admin', { replace: true });
        return;
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(err?.message || 'Failed to verify OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = (provider) => {
    const normalizedProvider = String(provider || '').trim().toLowerCase();
    if (normalizedProvider !== 'google' && normalizedProvider !== 'facebook') return;
    setError('');
    if (isLikelyInAppBrowser()) {
      setError('OAuth is usually blocked inside in-app browsers. Open this site in Chrome or Safari and try again.');
      return;
    }
    if (!isSupabaseSocialReady) {
      setError('Social login is not configured yet. Enable Supabase auth and provider keys first.');
      return;
    }
    try {
      setOauthLoading(normalizedProvider);
      const redirectTo = resolveOAuthRedirectUrl();
      if (!isValidAbsoluteHttpUrl(redirectTo)) {
        throw new Error('OAuth redirect URL is invalid. Set VITE_OAUTH_REDIRECT_URL correctly.');
      }
      const supabaseAuthBase = sanitizeSupabaseUrl(authMeta.supabaseUrl);
      if (!isValidAbsoluteHttpUrl(supabaseAuthBase)) {
        throw new Error('SUPABASE_URL is invalid. Check your environment configuration.');
      }
      const params = new URLSearchParams({
        provider: normalizedProvider,
        redirect_to: redirectTo,
      });
      if (normalizedProvider === 'google') {
        params.set('scopes', 'email profile');
      } else if (normalizedProvider === 'facebook') {
        params.set('scopes', 'email,public_profile');
      }
      if (oauthRedirectTimerRef.current) clearTimeout(oauthRedirectTimerRef.current);
      oauthRedirectTimerRef.current = window.setTimeout(() => {
        setOauthLoading('');
        setError('OAuth redirect did not start. Check mobile popup/redirect settings and browser tracking protection.');
      }, 2500);
      window.location.replace(`${supabaseAuthBase}/auth/v1/authorize?${params.toString()}`);
    } catch (err) {
      if (oauthRedirectTimerRef.current) {
        clearTimeout(oauthRedirectTimerRef.current);
        oauthRedirectTimerRef.current = null;
      }
      setOauthLoading('');
      setError(err?.message || 'Unable to start social sign-in');
    }
  };

  const switchToRequestStep = () => {
    setStep('request');
    setOtp('');
    setDevOtpCode('');
    setPendingIdentifier(null);
    setShowRegisterPrompt(false);
    setError('');
    setSuccess('');
  };

  const switchAuthMode = (mode) => {
    setAuthMode(mode === 'register' ? 'register' : 'login');
    switchToRequestStep();
  };

  return (
    <MobileAccountLayout>
      <div className="otp-login-page">
        <section className="otp-login-card">
          <p className="otp-kicker">Secure Login</p>
          <h1>{authMode === 'register' ? 'Register with OTP' : 'Sign in with OTP'}</h1>

        <div className="auth-view-switch">
          <button
            type="button"
            className={`switch-btn ${authMode === 'login' ? 'active' : ''}`}
            onClick={() => switchAuthMode('login')}
            disabled={loading}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`switch-btn ${authMode === 'register' ? 'active' : ''}`}
            onClick={() => switchAuthMode('register')}
            disabled={loading}
          >
            Register
          </button>
        </div>

        {error ? <div className="error-message">{error}</div> : null}
        {success ? <div className="success-message">{success}</div> : null}
        {showRegisterPrompt && authMode === 'login' ? (
          <div className="register-prompt-box">
            <p>Account not found. Please register first.</p>
            <button type="button" className="login-button secondary" onClick={() => switchAuthMode('register')} disabled={loading}>
              Register Now
            </button>
          </div>
        ) : null}

        {step === 'request' ? (
          <form className="otp-form" onSubmit={handleRequestOtp}>
            <div className="form-group">
              <label htmlFor="identifier">Email</label>
              <input
                id="identifier"
                name="identifier"
                type="email"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="name@example.com"
                required
                autoComplete="username"
              />
            </div>
            <button type="submit" className="login-button" disabled={loading}>
              {loading ? 'Sending OTP...' : 'Send OTP'}
            </button>
          </form>
        ) : (
          <form className="otp-form" onSubmit={handleVerifyOtp}>
            <div className="otp-step-pill">
              Code sent to {pendingIdentifier?.email || 'your email'}
            </div>
            {devOtpCode ? (
              <div className="success-message">
                Local dev OTP is prefilled: <strong>{devOtpCode}</strong>
              </div>
            ) : null}
            <div className="form-group">
              <label htmlFor="otp">Enter OTP</label>
              <input
                id="otp"
                name="otp"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="6-digit OTP"
                required
                autoComplete="one-time-code"
              />
            </div>
            <button type="submit" className="login-button" disabled={loading}>
              {loading ? 'Verifying...' : (authMode === 'register' ? 'Verify and Register' : 'Verify and Sign In')}
            </button>
            <button type="button" className="login-button secondary" onClick={switchToRequestStep} disabled={loading}>
              Edit Contact
            </button>
          </form>
        )}

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
        </section>
      </div>
    </MobileAccountLayout>
  );
}

export default Login;

