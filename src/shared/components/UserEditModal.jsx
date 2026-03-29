import { useEffect, useState } from 'react';
import { usersApi } from '../services/api';
import useIsMobile from '../hooks/useIsMobile';
import MobileBottomSheet from './mobile/MobileBottomSheet';
import WindowModal from './window/WindowModal';
import CalculatedAmountInput from './CalculatedAmountInput';
import { validateAmountInput } from '../utils/amountExpression';
import { formatCurrency } from '../utils/formatters';
import { isValidIndianPhone, normalizeIndianPhone, PHONE_POLICY_MESSAGE } from '../utils/phone';
import './UserEditModal.css';

const formatCreditLimitLabel = (value) => (Number(value || 0) > 0 ? formatCurrency(value) : 'Unrestricted');
const formatVerificationLabel = (isVerified) => (isVerified ? 'Verified' : 'Pending verification');

function UserEditModal({ user, onClose, onSave, isCreate = false, createPrefill = null }) {
  const [formData, setFormData] = useState(() => ({
    name: isCreate ? String(createPrefill?.name || '') : '',
    email: isCreate ? String(createPrefill?.email || '') : '',
    phone: isCreate ? String(createPrefill?.phone || '') : '',
    address: isCreate ? String(createPrefill?.address || '') : '',
    credit_limit: isCreate && createPrefill?.credit_limit !== undefined && createPrefill?.credit_limit !== null
      ? String(createPrefill.credit_limit)
      : '',
    role: 'customer',
  }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [errors, setErrors] = useState({});
  const isMobile = useIsMobile();

  useEffect(() => {
    if (user && !isCreate) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        address: user.address || '',
        credit_limit: Number(user.credit_limit || 0) > 0 ? String(user.credit_limit) : '',
        role: user.role || 'customer',
      });
    }
  }, [user, isCreate]);

  const isRoleEditAllowed = isCreate || (Boolean(user?.email_verified) && Boolean(user?.phone_verified));
  const isAdminTarget = !isCreate && user?.role === 'admin';
  const roleEditBlockedMessage = isAdminTarget
    ? 'Existing admin users are read-only here.'
    : 'User type stays locked until both email and phone are verified.';

  const validateForm = () => {
    const nextErrors = {};

    if (isCreate) {
      if (!formData.name.trim()) {
        nextErrors.name = 'Name is required';
      } else if (formData.name.trim().length < 2) {
        nextErrors.name = 'Name must be at least 2 characters';
      }
      if (formData.phone && !isValidIndianPhone(formData.phone)) {
        nextErrors.phone = PHONE_POLICY_MESSAGE;
      }
    } else if (formData.role !== 'customer' && formData.role !== 'admin') {
      nextErrors.role = 'Choose a valid user type';
    }

    if (String(formData.credit_limit || '').trim() !== '') {
      const creditLimitResult = validateAmountInput(formData.credit_limit, { min: 0 });
      if (!creditLimitResult.valid) {
        nextErrors.credit_limit = creditLimitResult.message || 'Enter a valid credit limit';
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    if (!isCreate && isAdminTarget) {
      setError(roleEditBlockedMessage);
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const hasCreditLimit = String(formData.credit_limit || '').trim() !== '';
      const creditLimitResult = hasCreditLimit
        ? validateAmountInput(formData.credit_limit, { min: 0 })
        : { valid: true, value: 0 };
      if (!creditLimitResult.valid) {
        setErrors((prev) => ({
          ...prev,
          credit_limit: creditLimitResult.message || 'Enter a valid credit limit',
        }));
        setLoading(false);
        return;
      }
      const creditLimitValue = hasCreditLimit ? Number(creditLimitResult.value) : 0;

      let createdUser = null;
      if (isCreate) {
        const normalizedPhone = formData.phone ? normalizeIndianPhone(formData.phone) : '';
        const created = await usersApi.create({
          name: formData.name.trim(),
          email: formData.email.trim() || null,
          phone: normalizedPhone || null,
          address: formData.address.trim() || null,
          credit_limit: creditLimitValue,
          role: 'customer',
        });
        createdUser = created?.user || created || null;
        setSuccess('Customer created successfully');
      } else {
        const updatePayload = {
          credit_limit: creditLimitValue,
        };
        if (isRoleEditAllowed && !isAdminTarget) {
          updatePayload.role = formData.role === 'admin' ? 'admin' : 'customer';
        }
        await usersApi.update(user.id, updatePayload);
        setSuccess('Customer updated successfully');
      }
      await Promise.resolve(onSave?.(createdUser));
      onClose();
    } catch (err) {
      setSuccess('');
      setError(err.message || `Failed to ${isCreate ? 'create' : 'update'} user`);
    } finally {
      setLoading(false);
    }
  };

  const formContent = (
    <>
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <form onSubmit={handleSubmit} className="user-edit-form">
        {isCreate ? (
          <>
            <div className="form-group">
              <label htmlFor="name">Name</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Enter customer name"
                autoComplete="name"
                className={errors.name ? 'error' : ''}
              />
              {errors.name && <span className="field-error">{errors.name}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="Enter email (optional)"
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label htmlFor="phone">Phone</label>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="Enter Indian phone number"
                autoComplete="tel"
                className={errors.phone ? 'error' : ''}
              />
              {errors.phone && <span className="field-error">{errors.phone}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="address">Address</label>
              <input
                type="text"
                id="address"
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="Enter address (optional)"
                autoComplete="street-address"
              />
            </div>

            <div className="form-group">
              <label htmlFor="credit-limit">Credit Limit</label>
              <CalculatedAmountInput
                id="credit-limit"
                name="credit_limit"
                min={0}
                value={formData.credit_limit}
                onValueChange={(nextValue) => handleChange({ target: { name: 'credit_limit', value: nextValue } })}
                placeholder="Leave blank for unrestricted credit"
              />
              {errors.credit_limit && <span className="field-error">{errors.credit_limit}</span>}
              <span className="info-text">Blank means unrestricted credit. Provided email or phone stays pending until verification finishes.</span>
            </div>
          </>
        ) : (
          <>
            <div className="user-static-summary">
              <div className="user-static-summary-head">
                <strong>Identity Details</strong>
                <span className="user-static-summary-badge">Read only here</span>
              </div>
              <p><strong>Name:</strong> {formData.name || '-'}</p>
              <p><strong>Email:</strong> {formData.email || '-'}</p>
              <p><strong>Phone:</strong> {formData.phone || '-'}</p>
              <p><strong>Address:</strong> {formData.address || '-'}</p>
              <p><strong>Email status:</strong> {formatVerificationLabel(user?.email_verified)}</p>
              <p><strong>Phone status:</strong> {formatVerificationLabel(user?.phone_verified)}</p>
              <p><strong>Current credit limit:</strong> {formatCreditLimitLabel(user?.credit_limit)}</p>
            </div>
            <div className="user-edit-hint">
              Identity fields stay read-only in this admin edit flow. Email, phone, and verification changes must go through the contact verification flows so uniqueness checks and pending requests stay intact.
            </div>
            {(!isRoleEditAllowed || isAdminTarget) && (
              <span className="field-error">{roleEditBlockedMessage}</span>
            )}

            <div className="form-group">
              <label htmlFor="role">User Type</label>
              <select
                id="role"
                name="role"
                value={formData.role}
                onChange={handleChange}
                disabled={!isRoleEditAllowed || isAdminTarget}
                className={errors.role ? 'error' : ''}
              >
                <option value="customer">Customer</option>
                <option value="admin">Admin</option>
              </select>
              {errors.role && <span className="field-error">{errors.role}</span>}
              {isRoleEditAllowed && !isAdminTarget && (
                <span className="info-text">Role changes stay available only while both email and phone remain verified.</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="credit-limit">Credit Limit</label>
              <CalculatedAmountInput
                id="credit-limit"
                name="credit_limit"
                min={0}
                value={formData.credit_limit}
                onValueChange={(nextValue) => handleChange({ target: { name: 'credit_limit', value: nextValue } })}
                placeholder="Leave blank for unrestricted credit"
                disabled={isAdminTarget}
              />
              {errors.credit_limit && <span className="field-error">{errors.credit_limit}</span>}
              {!isAdminTarget ? (
                <span className="info-text">Leave blank for unrestricted credit. Stored value `0` means no enforced limit.</span>
              ) : null}
            </div>
          </>
        )}

        <div className="form-actions">
          <button type="button" className="cancel-btn" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            type="submit"
            className="submit-btn"
            disabled={loading || isAdminTarget}
          >
            {loading ? 'Saving...' : (isCreate ? 'Add Customer' : 'Save Customer')}
          </button>
        </div>
      </form>
    </>
  );

  if (isMobile) {
    return (
      <MobileBottomSheet
        open
        title={isCreate ? 'Add New Customer' : 'Edit Customer'}
        onClose={onClose}
        dismissible={!loading}
        className="user-edit-sheet"
      >
        {formContent}
      </MobileBottomSheet>
    );
  }

  return (
    <WindowModal
      open
      title={isCreate ? 'Add New Customer' : 'Edit Customer'}
      onClose={onClose}
      dismissible={!loading}
      dialogClassName="user-edit-modal fade-in-up"
      headerClassName="user-edit-header"
      closeButtonClassName="user-edit-modal-close-btn"
      initialSize={{ width: 520, height: isCreate ? 680 : 600 }}
    >
      {formContent}
    </WindowModal>
  );
}

export default UserEditModal;

