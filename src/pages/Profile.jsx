import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User, Phone, MapPin, Mail, Save, CheckCircle, 
  AlertCircle, ArrowLeft, Camera, Trash2
} from 'lucide-react';
import { authApi, usersApi, resolveMediaSourceForDisplay } from '../services/api';
import { isValidIndianPhone, normalizeIndianPhone, PHONE_POLICY_MESSAGE } from '../utils/phone';
import { validateEmail } from '../utils/validation';
import MobileAccountLayout from '../components/mobile/MobileAccountLayout';
import './Profile.css';

function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [displayProfileImageSrc, setDisplayProfileImageSrc] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [emailVerificationToken, setEmailVerificationToken] = useState('');
  const [emailVerificationTokenType, setEmailVerificationTokenType] = useState('token');
  const [verificationLoading, setVerificationLoading] = useState('');
  const [phoneCancelLoading, setPhoneCancelLoading] = useState(false);
  const [verificationRequestStatus, setVerificationRequestStatus] = useState({ email: null, phone: null });
  const [phoneChangeRequest, setPhoneChangeRequest] = useState(null);
  const [authModeInfo, setAuthModeInfo] = useState({
    supabaseEnabled: false,
    supabaseMode: 'hybrid',
    supabaseClientReady: false,
    emailProvider: 'legacy',
  });
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    profile_image: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    country: 'India',
  });
  
  const [validationIssues, setValidationIssues] = useState([]);

  useEffect(() => {
    setImageLoadFailed(false);
  }, [formData.profile_image]);

  useEffect(() => {
    let cancelled = false;
    let revokeUrl = null;
    const run = async () => {
      if (imageLoadFailed || !formData.profile_image) {
        setDisplayProfileImageSrc('');
        return;
      }
      const resolved = await resolveMediaSourceForDisplay(formData.profile_image);
      if (cancelled) {
        if (resolved.revoke && resolved.src) URL.revokeObjectURL(resolved.src);
        return;
      }
      setDisplayProfileImageSrc(resolved.src || '');
      revokeUrl = resolved.revoke ? resolved.src : null;
    };
    run();
    return () => {
      cancelled = true;
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    };
  }, [formData.profile_image, imageLoadFailed]);

  useEffect(() => {
    loadProfile();
  }, []);

  const applyVerificationRequestStatus = (payload = {}) => {
    setVerificationRequestStatus({
      email: payload?.email || null,
      phone: payload?.phone || null,
    });
  };

  const refreshVerificationRequestStatus = async () => {
    try {
      const statusPayload = await authApi.getMyContactVerificationRequestStatus();
      applyVerificationRequestStatus(statusPayload || {});
    } catch (_) {
      // best effort only
    }
  };

  const refreshPhoneChangeRequestStatus = async () => {
    try {
      const payload = await authApi.getMyPhoneChangeRequestStatus();
      setPhoneChangeRequest(payload?.request || null);
    } catch (_) {
      // best effort only
    }
  };

  const getPhoneChangeStatusClassName = () => {
    const status = String(phoneChangeRequest?.status || '').trim().toLowerCase();
    return status ? `phone-change-status ${status}` : '';
  };

  const getPhoneChangeStatusMessage = () => {
    const status = String(phoneChangeRequest?.status || '').trim().toUpperCase();
    const requestedPhone = String(phoneChangeRequest?.new_phone || '').trim();
    if (!status || !requestedPhone) return '';
    if (status === 'PENDING_VALIDATION') {
      return 'Phone update is pending. You will be notified once it is updated.';
    }
    if (status === 'APPROVED') {
      return `Phone update to ${requestedPhone} was approved and applied.`;
    }
    if (status === 'REJECTED') {
      return phoneChangeRequest?.rejection_reason
        ? `Phone update was rejected: ${phoneChangeRequest.rejection_reason}`
        : 'Latest phone update request was rejected.';
    }
    return '';
  };

  const getEmailRequestStatusClassName = () => {
    const status = String(verificationRequestStatus?.email?.status || '').trim().toLowerCase();
    return status ? `request-status ${status}` : '';
  };

  const getEmailRequestStatusMessage = () => {
    const status = String(verificationRequestStatus?.email?.status || '').trim().toLowerCase();
    if (!status) return 'Admin will review and send your code/link via email.';
    if (status === 'pending') return 'Verification request is pending admin review (email).';
    if (status === 'sent') return 'Admin has sent your verification code/link via email. Enter it below.';
    if (status === 'rejected') return 'Verification request was rejected by admin. You can request again.';
    if (status === 'completed') return 'Latest verification request is already completed.';
    return `Latest verification request status: ${status}.`;
  };

  const loadProfile = async () => {
    try {
      const savedUser = localStorage.getItem('user');
      if (!savedUser) {
        navigate('/login');
        return;
      }

      let userData = null;
      try {
        userData = JSON.parse(savedUser);
      } catch (_) {
        localStorage.removeItem('user');
        navigate('/login');
        return;
      }
      setUser(userData);
      
      // Load full profile from server
      const [profile, requestStatusPayload, phoneChangeStatusPayload, resetModePayload, emailStatusPayload] = await Promise.all([
        usersApi.getById(userData.id),
        authApi.getMyContactVerificationRequestStatus().catch(() => null),
        authApi.getMyPhoneChangeRequestStatus().catch(() => null),
        authApi.getResetMode().catch(() => null),
        authApi.getEmailVerificationStatus().catch(() => null),
      ]);
      applyVerificationRequestStatus(requestStatusPayload || {});
      setPhoneChangeRequest(phoneChangeStatusPayload?.request || null);
      const emailProvider = String(emailStatusPayload?.provider || '').trim().toLowerCase() || 'legacy';
      setAuthModeInfo({
        supabaseEnabled: Boolean(resetModePayload?.supabase_auth_enabled),
        supabaseMode: String(resetModePayload?.supabase_auth_mode || 'hybrid').toLowerCase() === 'strict' ? 'strict' : 'hybrid',
        supabaseClientReady: Boolean(resetModePayload?.supabase_client_ready),
        emailProvider,
      });
      setEmailVerificationTokenType(emailProvider === 'supabase' ? 'token_hash' : 'token');
      
      let addressData = {};
      if (profile.address) {
        try {
          addressData = JSON.parse(profile.address);
        } catch (e) {}
      }
      
      setFormData({
        name: profile.name || '',
        email: profile.email || '',
        phone: profile.phone || '',
        profile_image: profile.profile_image || '',
        ...addressData
      });
      setEmailVerified(Boolean(profile.email_verified));
      setPhoneVerified(Boolean(profile.phone_verified));
      
      // Validate profile completeness
      validateProfile(profile, addressData);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const validateProfile = (profile, address) => {
    const issues = [];
    
    if (profile.email && !validateEmail(profile.email)) {
      issues.push({ field: 'email', message: 'Enter a valid email or keep it blank' });
    }
    if (!profile.phone || !isValidIndianPhone(profile.phone)) {
      issues.push({ field: 'phone', message: PHONE_POLICY_MESSAGE });
    }
    if (!profile.email_verified && !profile.phone_verified) {
      issues.push({ field: 'verification', message: 'Verify at least one contact method (email or phone)' });
    }
    if (!address.street) issues.push({ field: 'street', message: 'Street address is required' });
    if (!address.city) issues.push({ field: 'city', message: 'City is required' });
    if (!address.state) issues.push({ field: 'state', message: 'State is required' });
    if (!address.zip) issues.push({ field: 'zip', message: 'Postal code is required' });
    
    setValidationIssues(issues);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear validation issues when user starts editing
    if (validationIssues.find(i => i.field === name)) {
      setValidationIssues(prev => prev.filter(i => i.field !== name));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const normalizedEmail = String(formData.email || '').trim().toLowerCase();
      if (normalizedEmail && !validateEmail(normalizedEmail)) {
        setError('Enter a valid email or leave it blank');
        setSaving(false);
        return;
      }
      if (!isValidIndianPhone(formData.phone)) {
        setError(PHONE_POLICY_MESSAGE);
        setSaving(false);
        return;
      }
      const address = {
        street: formData.street,
        city: formData.city,
        state: formData.state,
        zip: formData.zip,
        country: formData.country
      };

      const updateResponse = await usersApi.update(user.id, {
        name: formData.name,
        email: normalizedEmail || null,
        phone: normalizeIndianPhone(formData.phone),
        profile_image: formData.profile_image || null,
        address: JSON.stringify(address)
      });
      const {
        phone_change_request: nextPhoneChangeRequest = null,
        message: updateMessage = '',
        ...updatedProfile
      } = updateResponse || {};

      // Update local storage
      const updatedUser = {
        ...user,
        ...updatedProfile,
        token: user?.token
      };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      window.dispatchEvent(new Event('user-updated'));
      setUser(updatedUser);
      setFormData((prev) => ({
        ...prev,
        name: updatedProfile?.name ?? prev.name,
        email: updatedProfile?.email ?? '',
        phone: updatedProfile?.phone ?? '',
        profile_image: updatedProfile?.profile_image || '',
      }));
      setEmailVerified(Boolean(updatedProfile?.email_verified));
      setPhoneVerified(Boolean(updatedProfile?.phone_verified));
      setPhoneChangeRequest(nextPhoneChangeRequest || null);
      setEmailVerificationToken('');
      await refreshVerificationRequestStatus();
      await refreshPhoneChangeRequestStatus();
      
      setSuccess(updateMessage || 'Profile updated successfully!');
      
      // Re-validate
      validateProfile(
        {
          ...updatedProfile,
          phone: updatedProfile?.phone || '',
          email_verified: Boolean(updatedProfile?.email_verified),
          phone_verified: Boolean(updatedProfile?.phone_verified),
        },
        address
      );
      
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const PROFILE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

  const dataUrlSizeBytes = (dataUrl) => {
    const payload = String(dataUrl || '').split(',')[1] || '';
    const pad = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((payload.length * 3) / 4) - pad);
  };

  const loadImageElement = (file) => new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to read image file'));
    };
    img.src = objectUrl;
  });

  const optimizeImageForProfile = async (file) => {
    const img = await loadImageElement(file);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image optimization is not supported in this browser');

    // Square crop with slight upward bias keeps faces better centered in avatar circles.
    const srcW = img.width;
    const srcH = img.height;
    const cropSize = Math.min(srcW, srcH);
    const offsetX = Math.max(0, Math.floor((srcW - cropSize) / 2));
    const offsetY = Math.max(0, Math.floor((srcH - cropSize) / 2.4));

    let target = Math.min(1200, cropSize);
    let quality = 0.9;
    let dataUrl = '';

    for (let attempt = 0; attempt < 8; attempt += 1) {
      canvas.width = target;
      canvas.height = target;
      ctx.clearRect(0, 0, target, target);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, target, target);
      ctx.drawImage(img, offsetX, offsetY, cropSize, cropSize, 0, 0, target, target);

      dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrlSizeBytes(dataUrl) <= PROFILE_IMAGE_MAX_BYTES) {
        return dataUrl;
      }

      if (quality > 0.62) {
        quality -= 0.08;
      } else {
        target = Math.floor(target * 0.85);
      }
    }

    if (dataUrlSizeBytes(dataUrl) > PROFILE_IMAGE_MAX_BYTES) {
      throw new Error('Image is too large even after optimization. Please choose a smaller photo.');
    }
    return dataUrl;
  };

  const handleProfileImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    setError(null);
    setSuccess(null);

    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowed.has(file.type)) {
      setError('Please choose a JPEG, PNG, or WEBP image.');
      return;
    }

    setImageUploading(true);
    try {
      const imageBase64 = await optimizeImageForProfile(file);
      const response = await usersApi.uploadProfileImage(user.id, imageBase64);
      const nextImage = response?.profile_image || '';
      setFormData((prev) => ({ ...prev, profile_image: nextImage }));
      const updatedUser = { ...user, profile_image: nextImage };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      window.dispatchEvent(new Event('user-updated'));
      setSuccess('Profile image updated.');
    } catch (err) {
      setError(err.message || 'Failed to upload profile image');
    } finally {
      setImageUploading(false);
      e.target.value = '';
    }
  };

  const normalizedDraftEmail = String(formData.email || '').trim().toLowerCase();
  const normalizedSavedEmail = String(user?.email || '').trim().toLowerCase();
  const normalizedDraftPhone = normalizeIndianPhone(formData.phone || '');
  const normalizedSavedPhone = normalizeIndianPhone(user?.phone || '');
  const emailDraftChanged = normalizedDraftEmail !== normalizedSavedEmail;
  const phoneDraftChanged = normalizedDraftPhone !== normalizedSavedPhone;
  const pendingPhoneChangeRequest = String(phoneChangeRequest?.status || '').trim().toUpperCase() === 'PENDING_VALIDATION';

  const handleRequestEmailVerification = async () => {
    try {
      setError(null);
      setSuccess(null);
      if (emailDraftChanged) {
        setError('Save email changes first, then request verification');
        return;
      }
      if (!normalizedSavedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedSavedEmail)) {
        setError('Enter a valid email and save profile first');
        return;
      }
      setVerificationLoading('email_request');
      const response = await authApi.requestMyEmailVerification();
      await refreshVerificationRequestStatus();
      setSuccess(response?.message || 'Verification request sent to admin');
    } catch (err) {
      setError(err.message || 'Failed to request email verification');
    } finally {
      setVerificationLoading('');
    }
  };

  const handleConfirmEmailVerification = async () => {
    try {
      setError(null);
      setSuccess(null);
      const token = String(emailVerificationToken || '').trim();
      if (!normalizedSavedEmail) {
        setError('Save a valid email first');
        return;
      }
      if (!token) {
        setError(emailVerificationTokenType === 'token_hash'
          ? 'Email verification token_hash is required'
          : 'Email verification token is required');
        return;
      }
      setVerificationLoading('email_confirm');
      const response = await authApi.confirmEmailVerification(
        normalizedSavedEmail,
        token,
        emailVerificationTokenType === 'token_hash' ? { tokenHash: token } : undefined
      );
      setEmailVerified(true);
      setEmailVerificationToken('');
      const updatedUser = { ...user, email_verified: true };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      window.dispatchEvent(new Event('user-updated'));
      await refreshVerificationRequestStatus();
      setSuccess(response?.message || 'Email verified successfully');
      validateProfile(
        { ...formData, email_verified: true, phone_verified: phoneVerified, phone: normalizedDraftPhone || formData.phone },
        {
          street: formData.street,
          city: formData.city,
          state: formData.state,
          zip: formData.zip,
          country: formData.country
        }
      );
    } catch (err) {
      setError(err.message || 'Failed to confirm email verification');
    } finally {
      setVerificationLoading('');
    }
  };

  const handleCancelPendingPhoneChange = async () => {
    try {
      setError(null);
      setSuccess(null);
      setPhoneCancelLoading(true);
      const response = await authApi.cancelMyPhoneChangeRequest();
      setPhoneChangeRequest(response?.request || null);
      await refreshPhoneChangeRequestStatus();
      setSuccess(response?.message || 'Pending phone update request cancelled');
    } catch (err) {
      setError(err.message || 'Failed to cancel phone update request');
    } finally {
      setPhoneCancelLoading(false);
    }
  };

  const handleRemoveProfileImage = async () => {
    if (!user?.id) return;
    setError(null);
    setSuccess(null);
    setImageUploading(true);
    try {
      await usersApi.update(user.id, { profile_image: null });
      setFormData((prev) => ({ ...prev, profile_image: '' }));
      const updatedUser = { ...user, profile_image: null };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      window.dispatchEvent(new Event('user-updated'));
      setSuccess('Profile image removed.');
    } catch (err) {
      setError(err.message || 'Failed to remove profile image');
    } finally {
      setImageUploading(false);
    }
  };

  if (loading) {
    return (
      <MobileAccountLayout>
        <div className="profile-page">
          <div className="loading-container">
            <User size={40} className="spinning" />
            <p>Loading profile...</p>
          </div>
        </div>
      </MobileAccountLayout>
    );
  }

  return (
    <MobileAccountLayout>
      <div className="profile-page">
        <div className="profile-header fade-in-up">
          <button className="back-btn" onClick={() => navigate('/')}>
            <ArrowLeft size={20} /> Back
          </button>
          <h1>My Profile</h1>
          <p>Manage your account information</p>
        </div>

      {/* Validation Issues Warning */}
      {validationIssues.length > 0 && (
        <div className="validation-warning fade-in-up">
          <AlertCircle size={24} />
          <div className="warning-content">
            <h3>Complete Your Profile for Orders</h3>
            <p>The following information is required to place orders:</p>
            <ul className="issues-list">
              {validationIssues.map((issue, idx) => (
                <li key={idx}>
                  <span className="issue-icon">•</span>
                  {issue.message}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="success-alert fade-in-up">
          <CheckCircle size={20} />
          <span>{success}</span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="error-alert fade-in-up">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      <div className="profile-content">
        <form onSubmit={handleSubmit} className="profile-form slide-in-up">
          
          {/* Personal Information */}
          <div className="form-section">
            <h2><User size={20} /> Personal Information</h2>

            <div className="profile-image-section">
              <div className="profile-image-preview">
                {displayProfileImageSrc && !imageLoadFailed ? (
                  <img
                    src={displayProfileImageSrc}
                    alt="Profile"
                    onError={() => setImageLoadFailed(true)}
                  />
                ) : (
                  <span>{(formData.name || 'U').slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <div className="profile-image-actions">
                <label className="image-upload-btn">
                  <Camera size={16} />
                  {imageUploading ? 'Uploading...' : 'Upload Photo'}
                  <input
                    id="profile-image-upload"
                    name="profile_image_upload"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleProfileImageUpload}
                    disabled={imageUploading}
                    style={{ display: 'none' }}
                  />
                </label>
                <span className="image-adjust-note">Auto-cropped and optimized below 2MB</span>
                {formData.profile_image && (
                  <button
                    type="button"
                    className="image-remove-btn"
                    onClick={handleRemoveProfileImage}
                    disabled={imageUploading}
                  >
                    <Trash2 size={16} /> Remove
                  </button>
                )}
              </div>
            </div>
            
            <div className="form-group">
              <label htmlFor="name">Full Name *</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                placeholder="Your full name"
                autoComplete="name"
                className={validationIssues.find(i => i.field === 'name') ? 'error-field' : ''}
              />
            </div>

            <div className="form-row two-col">
              <div className="form-group">
                <label htmlFor="email">
                  <Mail size={16} /> Email Address
                  {formData.email && (
                    <span
                      className={`verification-pill ${emailVerified ? 'verified' : 'unverified'}`}
                      title={emailVerified ? 'Verified email' : 'Unverified email'}
                    >
                      {emailVerified ? 'Verified' : 'Unverified'}
                    </span>
                  )}
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="your@email.com"
                autoComplete="email"
                  className={validationIssues.find(i => i.field === 'email') ? 'error-field' : ''}
                />
                {formData.email && (
                  <div className="verification-tools">
                    {emailDraftChanged && (
                      <span className="verification-note">Save email changes before verification actions</span>
                    )}
                    {!emailVerified && (
                      <>
                        <span className={`verification-note ${getEmailRequestStatusClassName()}`}>
                          {getEmailRequestStatusMessage()}
                        </span>
                        <div className="verification-actions">
                          <button
                            type="button"
                            className="verify-btn"
                            onClick={handleRequestEmailVerification}
                            disabled={verificationLoading === 'email_request' || emailDraftChanged}
                          >
                            {verificationLoading === 'email_request'
                              ? 'Requesting...'
                              : (authModeInfo.emailProvider === 'supabase'
                                ? 'Send Verification Email'
                                : 'Request Verification')}
                          </button>
                          <div className="verify-token-group">
                            <select
                              id="email-verification-token-type"
                              name="email_verification_token_type"
                              value={emailVerificationTokenType}
                              onChange={(e) => setEmailVerificationTokenType(e.target.value)}
                              disabled={emailDraftChanged}
                            >
                              <option value="token">token</option>
                              <option value="token_hash">token_hash</option>
                            </select>
                            <input
                              id="email-verification-token"
                              name="email_verification_token"
                              type="text"
                              value={emailVerificationToken}
                              onChange={(e) => setEmailVerificationToken(e.target.value)}
                              placeholder={emailVerificationTokenType === 'token_hash' ? 'Enter email token_hash' : 'Enter email token'}
                              disabled={emailDraftChanged}
                            />
                          </div>
                          <button
                            type="button"
                            className="verify-btn secondary"
                            onClick={handleConfirmEmailVerification}
                            disabled={verificationLoading === 'email_confirm' || emailDraftChanged}
                          >
                            {verificationLoading === 'email_confirm' ? 'Confirming...' : 'Confirm Email'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="phone">
                  <Phone size={16} /> Phone Number *
                  {formData.phone && (
                    <span
                      className={`verification-pill ${phoneVerified ? 'verified' : 'unverified'}`}
                      title={phoneVerified ? 'Verified phone' : 'Unverified phone'}
                    >
                      {phoneVerified ? 'Verified' : 'Unverified'}
                    </span>
                  )}
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  required
                  placeholder="+91 98765 43210"
                autoComplete="tel"
                  className={validationIssues.find(i => i.field === 'phone') ? 'error-field' : ''}
                />
                {phoneChangeRequest && (
                  <span className={`verification-note ${getPhoneChangeStatusClassName()}`}>
                    {getPhoneChangeStatusMessage()}
                  </span>
                )}
                {pendingPhoneChangeRequest && (
                  <div className="verification-tools">
                    <span className="verification-note">Current phone: {normalizedSavedPhone || '-'}</span>
                    <span className="verification-note">Requested phone: {phoneChangeRequest?.new_phone || '-'}</span>
                    <div className="verification-actions">
                      <button
                        type="button"
                        className="verify-btn secondary"
                        onClick={handleCancelPendingPhoneChange}
                        disabled={phoneCancelLoading || saving}
                      >
                        {phoneCancelLoading ? 'Cancelling...' : 'Cancel Pending Request'}
                      </button>
                    </div>
                  </div>
                )}
                {formData.phone && (
                  <div className="verification-tools">
                    {phoneDraftChanged && (
                      <span className="verification-note">Save phone changes to submit update request</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Shipping Address */}
          <div className="form-section">
            <h2><MapPin size={20} /> Shipping Address</h2>
            <p className="section-help">This address will be used for all orders</p>
            
            <div className="form-group">
              <label htmlFor="street">Street Address *</label>
              <input
                type="text"
                id="street"
                name="street"
                value={formData.street}
                onChange={handleInputChange}
                placeholder="123 Main Street, Apartment 4B"
                autoComplete="street-address"
                className={validationIssues.find(i => i.field === 'street') ? 'error-field' : ''}
              />
            </div>

            <div className="form-row three-col">
              <div className="form-group">
                <label htmlFor="city">City *</label>
                <input
                  type="text"
                  id="city"
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  placeholder="Mumbai"
                autoComplete="address-level2"
                  className={validationIssues.find(i => i.field === 'city') ? 'error-field' : ''}
                />
              </div>
              <div className="form-group">
                <label htmlFor="state">State/Region *</label>
                <input
                  type="text"
                  id="state"
                  name="state"
                  value={formData.state}
                  onChange={handleInputChange}
                  placeholder="Maharashtra"
                autoComplete="address-level1"
                  className={validationIssues.find(i => i.field === 'state') ? 'error-field' : ''}
                />
              </div>
              <div className="form-group">
                <label htmlFor="zip">Postal Code *</label>
                <input
                  type="text"
                  id="zip"
                  name="zip"
                  value={formData.zip}
                  onChange={handleInputChange}
                  placeholder="400001"
                autoComplete="postal-code"
                  className={validationIssues.find(i => i.field === 'zip') ? 'error-field' : ''}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="country">Country</label>
              <input
                type="text"
                id="country"
                name="country"
                value={formData.country}
                onChange={handleInputChange}
                placeholder="India"
                autoComplete="country"
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="form-actions">
            <button type="button" className="cancel-btn" onClick={() => navigate('/')}>
              Cancel
            </button>
            <button type="submit" className="save-btn" disabled={saving}>
              <Save size={18} />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>

        {/* Quick Actions */}
        <div className="quick-actions slide-in-up">
          <h3>Quick Actions</h3>
          <button className="action-btn" onClick={() => navigate('/cart')}>
            View Cart
          </button>
          <button className="action-btn" onClick={() => navigate('/my-credit')}>
            View Credit History
          </button>
          <button className="action-btn" onClick={() => navigate('/my-bills')}>
            View Bills
          </button>
          <button className="action-btn" onClick={() => navigate('/product-requests')}>
            Request Missing Product
          </button>
        </div>
      </div>
    </div>
    </MobileAccountLayout>
  );
}

export default Profile;
