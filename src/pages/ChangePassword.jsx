import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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

function ChangePassword() {
  const [identifierType, setIdentifierType] = useState('email'); // 'email' or 'phone'
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [identifierLocked, setIdentifierLocked] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let storedUser = null;
    try {
      const raw = localStorage.getItem('user');
      storedUser = raw ? JSON.parse(raw) : null;
    } catch (_) {
      storedUser = null;
    }

    const params = new URLSearchParams(location.search);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    // Validate identifier
    if (identifierType === 'email' && !validateEmail(email)) {
      setError('Please enter a valid email address');
      setLoading(false);
      return;
    }
    if (identifierType === 'phone' && !isValidIndianPhone(phone)) {
      setError(PHONE_POLICY_MESSAGE);
      setLoading(false);
      return;
    }

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
      await authApi.changePassword(
        identifierType === 'email' ? email : null,
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
        // Ignore local storage errors here.
      }
      setSuccess('Password changed successfully! This window will close.');
      setTimeout(() => {
        try {
          window.open('', '_self');
          window.close();
        } catch (_) {
          // Ignore close errors and fall back to navigation.
        }
        setTimeout(() => {
          navigate('/login');
        }, 250);
      }, 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <h1>Change Password</h1>
        <p className="login-subtitle">Enter your account details and a new password</p>
        
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}
        
        <form onSubmit={handleSubmit}>
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
                placeholder="Enter your email"
                required={identifierType === 'email'}
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
                placeholder="Enter your phone (e.g., 123-456-7890)"
                required={identifierType === 'phone'}
                disabled={identifierLocked || loading}
              />
              <small style={{ color: 'var(--color-text)', opacity: 0.7 }}>
                Enter your registered phone number (10 digits, optional +91 prefix)
              </small>
            </div>
          )}
          
          <div className="form-group">
            <label htmlFor="currentPassword">Current Password</label>
            <input
              type="password"
              id="currentPassword"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter your current password"
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="newPassword">New Password</label>
            <input
              type="password"
              id="newPassword"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter your new password"
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm New Password</label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your new password"
              required
            />
          </div>
          
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Changing Password...' : 'Change Password'}
          </button>
        </form>
        
        <p className="login-link">
          Remember your password? <Link to="/login">Back to Login</Link>
        </p>
      </div>
    </div>
  );
}

export default ChangePassword;
