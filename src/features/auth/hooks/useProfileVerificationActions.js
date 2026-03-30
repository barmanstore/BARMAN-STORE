const useProfileVerificationActions = ({
  authApi,
  emailDraftChanged,
  normalizedSavedEmail,
  emailVerificationToken,
  emailVerificationTokenType,
  normalizedDraftPhone,
  phoneVerified,
  formData,
  user,
  setUser,
  setEmailVerified,
  setEmailVerificationToken,
  setError,
  setSuccess,
  setVerificationLoading,
  setPhoneCancelLoading,
  setPhoneChangeRequest,
  refreshVerificationRequestStatus,
  refreshPhoneChangeRequestStatus,
  validateProfile,
}) => {
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

  return {
    handleRequestEmailVerification,
    handleConfirmEmailVerification,
    handleCancelPendingPhoneChange,
  };
};

export default useProfileVerificationActions;
