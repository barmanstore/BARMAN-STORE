import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, usersApi, resolveMediaSourceForDisplay } from '../../services/api';
import { isValidIndianPhone, normalizeIndianPhone, PHONE_POLICY_MESSAGE } from '../../utils/phone';
import { validateEmail } from '../../utils/validation';
import ProfileView from './components/ProfileView';
import { getEmailRequestStatusClassName, getEmailRequestStatusMessage, getPhoneChangeStatusClassName, getPhoneChangeStatusMessage } from './utils/profileVerificationUtils';
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
  const [authModeInfo, setAuthModeInfo] = useState({ supabaseEnabled: false, supabaseMode: 'hybrid', supabaseClientReady: false, emailProvider: 'legacy' });
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', profile_image: '', street: '', city: '', state: '', zip: '', country: 'India' });
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

  return (
    <ProfileView
      loading={loading}
      user={user}
      success={success}
      error={error}
      validationIssues={validationIssues}
      formData={formData}
      displayProfileImageSrc={displayProfileImageSrc}
      imageLoadFailed={imageLoadFailed}
      imageUploading={imageUploading}
      onImageError={() => setImageLoadFailed(true)}
      handleProfileImageUpload={handleProfileImageUpload}
      handleRemoveProfileImage={handleRemoveProfileImage}
      handleInputChange={handleInputChange}
      handleSubmit={handleSubmit}
      saving={saving}
      onBack={() => navigate('/')}
      onCancel={() => navigate('/')}
      onNavigateCart={() => navigate('/cart')}
      onNavigateCredit={() => navigate('/my-credit')}
      onNavigateBills={() => navigate('/my-bills')}
      onNavigateRequests={() => navigate('/product-requests')}
      emailVerified={emailVerified}
      phoneVerified={phoneVerified}
      emailDraftChanged={emailDraftChanged}
      phoneDraftChanged={phoneDraftChanged}
      getEmailRequestStatusClassName={() => getEmailRequestStatusClassName(verificationRequestStatus)}
      getEmailRequestStatusMessage={() => getEmailRequestStatusMessage(verificationRequestStatus)}
      handleRequestEmailVerification={handleRequestEmailVerification}
      verificationLoading={verificationLoading}
      authModeInfo={authModeInfo}
      emailVerificationTokenType={emailVerificationTokenType}
      setEmailVerificationTokenType={setEmailVerificationTokenType}
      emailVerificationToken={emailVerificationToken}
      setEmailVerificationToken={setEmailVerificationToken}
      handleConfirmEmailVerification={handleConfirmEmailVerification}
      phoneChangeRequest={phoneChangeRequest}
      getPhoneChangeStatusClassName={() => getPhoneChangeStatusClassName(phoneChangeRequest)}
      getPhoneChangeStatusMessage={() => getPhoneChangeStatusMessage(phoneChangeRequest)}
      pendingPhoneChangeRequest={pendingPhoneChangeRequest}
      normalizedSavedPhone={normalizedSavedPhone}
      handleCancelPendingPhoneChange={handleCancelPendingPhoneChange}
      phoneCancelLoading={phoneCancelLoading}
    />
  );
}

export default Profile;
