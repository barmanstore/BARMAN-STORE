const validateProfileUpdateInputs = async ({
  current,
  input,
  normalizeEmail,
  normalizePhone,
  parsePhoneInput,
  dbGetAsync,
  isAdmin,
  isSelf,
  targetUserId,
} = {}) => {
  const { name, email, phone, address, profile_image, role } = input || {};
  if (!current) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }

  if (isAdmin && !isSelf) {
    if (current.role === 'admin') {
      const error = new Error('Admin users cannot be modified');
      error.status = 400;
      throw error;
    }
    const emailVerified = Number(current.email_verified || 0) === 1;
    const phoneVerified = Number(current.phone_verified || 0) === 1;
    if (!emailVerified || !phoneVerified) {
      const error = new Error('User type can be changed only when both email and phone are verified');
      error.status = 403;
      throw error;
    }
    const nextRole = String(role || current.role).trim().toLowerCase() === 'admin' ? 'admin' : 'customer';
    return {
      mode: 'admin-role-update',
      nextRole,
    };
  }

  const phoneParsed = phone !== undefined ? parsePhoneInput(phone) : { value: current.phone, error: null };
  if (phoneParsed.error) {
    const error = new Error(phoneParsed.error);
    error.status = 400;
    throw error;
  }

  const requestedPhone = phoneParsed.value;
  const currentEmail = normalizeEmail(current.email);
  const currentPhone = normalizePhone(current.phone);
  const emailValue = email !== undefined ? normalizeEmail(email) : currentEmail;
  const emailChanged = email !== undefined && emailValue !== currentEmail;
  const phoneChangedRequested = phone !== undefined && requestedPhone !== currentPhone;

  if (emailValue) {
    const existing = await dbGetAsync('SELECT id FROM users WHERE email = ? AND id != ?', [emailValue, targetUserId]);
    if (existing) {
      const error = new Error('Email already in use');
      error.status = 400;
      throw error;
    }
  }
  if (requestedPhone) {
    const existing = await dbGetAsync('SELECT id FROM users WHERE phone = ? AND id != ?', [requestedPhone, targetUserId]);
    if (existing) {
      const allowDeferredSelfFlow = isSelf && !isAdmin && phoneChangedRequested;
      if (!allowDeferredSelfFlow) {
        const error = new Error('Phone number already in use');
        error.status = 400;
        throw error;
      }
    }
  }

  return {
    mode: 'profile-update',
    input: { name, email, phone, address, profile_image },
    current,
    requestedPhone,
    currentEmail,
    currentPhone,
    emailValue,
    emailChanged,
    phoneChangedRequested,
  };
};

module.exports = { validateProfileUpdateInputs };
