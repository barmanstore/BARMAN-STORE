import React from 'react';
import {
  User,
  Phone,
  MapPin,
  Mail,
  Save,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Camera,
  Trash2
} from 'lucide-react';
import MobileAccountLayout from '../../../components/mobile/MobileAccountLayout';

const ProfileView = ({
  loading,
  user,
  success,
  error,
  validationIssues,
  formData,
  displayProfileImageSrc,
  imageLoadFailed,
  imageUploading,
  onImageError,
  handleProfileImageUpload,
  handleRemoveProfileImage,
  handleInputChange,
  handleSubmit,
  saving,
  onBack,
  onCancel,
  onNavigateCart,
  onNavigateCredit,
  onNavigateBills,
  onNavigateRequests,
  emailVerified,
  phoneVerified,
  emailDraftChanged,
  phoneDraftChanged,
  getEmailRequestStatusClassName,
  getEmailRequestStatusMessage,
  handleRequestEmailVerification,
  verificationLoading,
  authModeInfo,
  emailVerificationTokenType,
  setEmailVerificationTokenType,
  emailVerificationToken,
  setEmailVerificationToken,
  handleConfirmEmailVerification,
  phoneChangeRequest,
  getPhoneChangeStatusClassName,
  getPhoneChangeStatusMessage,
  pendingPhoneChangeRequest,
  normalizedSavedPhone,
  handleCancelPendingPhoneChange,
  phoneCancelLoading,
}) => {
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
          <button className="back-btn" onClick={onBack}>
            <ArrowLeft size={20} /> Back
          </button>
          <h1>My Profile</h1>
          <p>Manage your account information</p>
        </div>

        {validationIssues.length > 0 && (
          <div className="validation-warning fade-in-up">
            <AlertCircle size={24} />
            <div className="warning-content">
              <h3>Complete Your Profile for Orders</h3>
              <p>The following information is required to place orders:</p>
              <ul className="issues-list">
                {validationIssues.map((issue, idx) => (
                  <li key={idx}>
                    <span className="issue-icon">?</span>
                    {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {success && (
          <div className="success-alert fade-in-up">
            <CheckCircle size={20} />
            <span>{success}</span>
          </div>
        )}

        {error && (
          <div className="error-alert fade-in-up">
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}

        <div className="profile-content">
          <form onSubmit={handleSubmit} className="profile-form slide-in-up">
            <div className="form-section">
              <h2><User size={20} /> Personal Information</h2>

              <div className="profile-image-section">
                <div className="profile-image-preview">
                  {displayProfileImageSrc && !imageLoadFailed ? (
                    <img
                      src={displayProfileImageSrc}
                      alt="Profile"
                      onError={onImageError}
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

            <div className="form-actions">
              <button type="button" className="cancel-btn" onClick={onCancel}>
                Cancel
              </button>
              <button type="submit" className="save-btn" disabled={saving}>
                <Save size={18} />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>

          <div className="quick-actions slide-in-up">
            <h3>Quick Actions</h3>
            <button className="action-btn" onClick={onNavigateCart}>
              View Cart
            </button>
            <button className="action-btn" onClick={onNavigateCredit}>
              View Credit History
            </button>
            <button className="action-btn" onClick={onNavigateBills}>
              View Bills
            </button>
            <button className="action-btn" onClick={onNavigateRequests}>
              Request Missing Product
            </button>
          </div>
        </div>
      </div>
    </MobileAccountLayout>
  );
};

export default ProfileView;
