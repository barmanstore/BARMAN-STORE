import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import { isValidIndianPhone, normalizeIndianPhone, PHONE_POLICY_MESSAGE } from '../utils/phone';
import './login.css';

const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};
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
    if (!validateEmail(email)) {
      return { error: 'Please enter a valid email address' };
    }
    return { email, phone: null, type: 'email' };
  }
  if (!isValidIndianPhone(raw)) {
    return { error: PHONE_POLICY_MESSAGE };
  }
  return { email: null, phone: normalizeIndianPhone(raw), type: 'phone' };
};

function Login({ setUser }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resetReason, setResetReason] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const qpEmail = String(params.get('email') || '').trim().toLowerCase();
    const qpPhone = normalizeIndianPhone(params.get('phone') || '');
    const qpToken = String(params.get('token') || '').trim();
    const qpPhoneToken = String(params.get('phoneToken') || '').trim();
    if (qpEmail) {
      setIdentifier(qpEmail);
    } else if (qpPhone) {
      setIdentifier(qpPhone);
    }
    if (qpToken || qpPhoneToken) {
      setSuccess('Verification token detected. Sign in and complete verification from your Profile page.');
    }
  }, []);

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
          setError('Enter at least one contact: email or phone');
          setLoading(false);
          return;
        }
        if (normalizedRegisterEmail && !validateEmail(normalizedRegisterEmail)) {
          setError('Please enter a valid email address');
          setLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setError('Password and confirm password do not match');
          setLoading(false);
          return;
        }
        if (registerPhone && !normalizedRegisterPhone) {
          setError(PHONE_POLICY_MESSAGE);
          setLoading(false);
          return;
        }
        if (!validateStrongPassword(password)) {
          setError('Password must be at least 10 characters and include uppercase, lowercase, number, and special character');
          setLoading(false);
          return;
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
        if (parsed.error) {
          setError(parsed.error);
          setLoading(false);
          return;
        }
        data = parsed.type === 'email'
          ? await authApi.login(parsed.email, password)
          : await authApi.loginWithPhone(parsed.phone, password);
      }

      localStorage.setItem('user', JSON.stringify({ ...data.user, token: data.token }));
      setUser({ ...data.user, token: data.token });

      if (data.user.must_change_password) {
        const forceParams = new URLSearchParams();
        forceParams.set('force', '1');
        const nextEmail = String(data.user?.email || '').trim().toLowerCase();
        const nextPhone = normalizeIndianPhone(data.user?.phone || '');
        if (nextEmail) {
          forceParams.set('email', nextEmail);
        } else if (nextPhone) {
          forceParams.set('phone', nextPhone);
        }
        navigate(`/change-password?${forceParams.toString()}`);
      } else if (data.user.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResetRequest = async () => {
    try {
      setError('');
      setSuccess('');
      if (String(resetReason || '').trim().length < 5) {
        setError('Please provide a short reason (min 5 characters) for admin review');
        return;
      }
      const parsed = parseIdentifier(identifier);
      if (parsed.error) {
        setError('Enter your email or phone first to request reset');
        return;
      }
      await authApi.requestPasswordReset(parsed.email, parsed.phone, resetReason || null);
      setSuccess('Reset request sent to admin');
    } catch (err) {
      setError(err.message || 'Failed to submit reset request');
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
            ? 'Sign up for BARMAN STORE account'
            : 'Sign in with email or phone number'}
        </p>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

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

              <div className="form-group">
                <label htmlFor="registerEmail">Email (Optional)</label>
                <input
                  type="email"
                  id="registerEmail"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  placeholder="Enter your email (optional)"
                />
                <small style={{ color: 'var(--color-text)', opacity: 0.7 }}>
                  Either email or phone is required
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="registerPhone">Phone Number (Optional)</label>
                <input
                  type="tel"
                  id="registerPhone"
                  value={registerPhone}
                  onChange={(e) => setRegisterPhone(e.target.value)}
                  placeholder="Enter your phone number (optional)"
                />
                <small style={{ color: 'var(--color-text)', opacity: 0.7 }}>
                  Either email or phone is required
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="address">Address (Optional)</label>
                <input
                  type="text"
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Enter your address (optional)"
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
                placeholder="Enter email or phone number"
                required
              />
              <small style={{ color: 'var(--color-text)', opacity: 0.7 }}>
                System automatically detects email or India phone number
              </small>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
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
                placeholder="Re-enter your password"
                required
              />
            </div>
          )}

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? 'Please wait...' : (isRegistering ? 'Create Account' : 'Sign In')}
          </button>
        </form>

        <div className="login-footer">
          <p>
            {isRegistering ? (
              <>
                Already have an account?{' '}
                <a href="#" onClick={(e) => { e.preventDefault(); switchMode(false); }}>
                  Sign in
                </a>
              </>
            ) : (
              <>
                Don't have an account?{' '}
                <a href="#" onClick={(e) => { e.preventDefault(); switchMode(true); }}>
                  Create one
                </a>
                <br />
                <span style={{ marginTop: '0.5rem', display: 'block' }}>
                  <Link to="/change-password" style={{ color: 'var(--color-secondary)', fontWeight: 700, textDecoration: 'none' }}>
                    Change Password
                  </Link>
                </span>
                <span style={{ marginTop: '0.5rem', display: 'block' }}>
                  <input
                    type="text"
                    value={resetReason}
                    onChange={(e) => setResetReason(e.target.value)}
                    placeholder="Reset reason (required for admin review)"
                    style={{ width: '100%', marginBottom: '0.4rem' }}
                  />
                  <button type="button" className="login-button" onClick={handleResetRequest}>
                    Request Admin Password Reset
                  </button>
                </span>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
