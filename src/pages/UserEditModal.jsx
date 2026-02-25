import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { usersApi } from '../services/api';
import useIsMobile from '../hooks/useIsMobile';
import MobileBottomSheet from '../components/mobile/MobileBottomSheet';
import { isValidIndianPhone, normalizeIndianPhone, PHONE_POLICY_MESSAGE } from '../utils/phone';
import './UserEditModal.css';

function UserEditModal({ user, onClose, onSave, isCreate = false }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    role: 'customer',
  });
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
        role: user.role || 'customer',
      });
    }
  }, [user, isCreate]);

  const isRoleEditAllowed = isCreate || (Boolean(user?.email_verified) && Boolean(user?.phone_verified));
  const isAdminTarget = !isCreate && user?.role === 'admin';
  const roleEditBlockedMessage = isAdminTarget
    ? 'Admin users cannot be modified here.'
    : 'User type can be changed only when both email and phone are verified.';

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

    if (!isCreate && !isRoleEditAllowed) {
      setError(roleEditBlockedMessage);
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (isCreate) {
        const normalizedPhone = formData.phone ? normalizeIndianPhone(formData.phone) : '';
        await usersApi.create({
          name: formData.name.trim(),
          email: formData.email.trim() || null,
          phone: normalizedPhone || null,
          address: formData.address.trim() || null,
          role: 'customer',
        });
        setSuccess('Customer created successfully');
      } else {
        await usersApi.update(user.id, { role: formData.role === 'admin' ? 'admin' : 'customer' });
        setSuccess('User type updated successfully');
      }
      setTimeout(() => {
        onSave();
        onClose();
      }, 700);
    } catch (err) {
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
          </>
        ) : (
          <>
            <div className="user-static-summary">
              <p><strong>Name:</strong> {formData.name || '-'}</p>
              <p><strong>Email:</strong> {formData.email || '-'}</p>
              <p><strong>Phone:</strong> {formData.phone || '-'}</p>
              <p><strong>Email status:</strong> {user?.email_verified ? 'Verified' : 'Unverified'}</p>
              <p><strong>Phone status:</strong> {user?.phone_verified ? 'Verified' : 'Unverified'}</p>
            </div>
            {!isRoleEditAllowed && (
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
                <span className="info-text">Only user type is editable in admin user edit mode.</span>
              )}
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
            disabled={loading || (!isCreate && (!isRoleEditAllowed || isAdminTarget))}
          >
            {loading ? 'Saving...' : (isCreate ? 'Add Customer' : 'Update User Type')}
          </button>
        </div>
      </form>
    </>
  );

  if (isMobile) {
    return (
      <MobileBottomSheet
        open
        title={isCreate ? 'Add New Customer' : 'Update User Type'}
        onClose={onClose}
        className="user-edit-sheet"
      >
        {formContent}
      </MobileBottomSheet>
    );
  }

  return (
    <div className="user-edit-overlay">
      <div className="user-edit-modal fade-in-up">
        <div className="user-edit-header">
          <h2>{isCreate ? 'Add New Customer' : 'Update User Type'}</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <X size={24} />
          </button>
        </div>
        {formContent}
      </div>
    </div>
  );
}

export default UserEditModal;
