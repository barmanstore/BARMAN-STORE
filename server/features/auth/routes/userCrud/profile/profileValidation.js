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
  const {
    name,
    email,
    phone,
    address,
    profile_image,
    role,
    credit_limit: creditLimitRaw,
  } = input || {};
  if (!current) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }

  const parseCreditLimitInput = () => {
    if (creditLimitRaw === undefined) {
      return {
        provided: false,
        value: Number(current.credit_limit || 0),
      };
    }
    if (creditLimitRaw === null || String(creditLimitRaw).trim() === '') {
      return {
        provided: true,
        value: 0,
      };
    }
    const parsedCreditLimit = Number(creditLimitRaw);
    if (!Number.isFinite(parsedCreditLimit) || parsedCreditLimit < 0) {
      const error = new Error('Credit limit must be a number greater than or equal to 0');
      error.status = 400;
      throw error;
    }
    return {
      provided: true,
      value: parsedCreditLimit,
    };
  };

  if (isAdmin && !isSelf) {
    if (current.role === 'admin') {
      const error = new Error('Admin users cannot be modified');
      error.status = 400;
      throw error;
    }
    const creditLimit = parseCreditLimitInput();
    let nextRole = current.role;
    if (role !== undefined) {
      nextRole =
        String(role || current.role)
          .trim()
          .toLowerCase() === 'admin'
          ? 'admin'
          : 'customer';
      if (nextRole !== current.role) {
        const emailVerified = Number(current.email_verified || 0) === 1;
        const phoneVerified = Number(current.phone_verified || 0) === 1;
        if (!emailVerified || !phoneVerified) {
          const error = new Error(
            'User type can be changed only when both email and phone are verified'
          );
          error.status = 403;
          throw error;
        }
      }
    }
    return {
      mode: 'admin-managed-update',
      nextRole,
      nextCreditLimit: creditLimit.value,
    };
  }

  if (creditLimitRaw !== undefined) {
    const error = new Error('Only admins can update credit limit');
    error.status = 403;
    throw error;
  }

  const phoneParsed =
    phone !== undefined ? parsePhoneInput(phone) : { value: current.phone, error: null };
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
    const existing = await dbGetAsync('SELECT id FROM users WHERE email = ? AND id != ?', [
      emailValue,
      targetUserId,
    ]);
    if (existing) {
      const error = new Error('Email already in use');
      error.status = 400;
      throw error;
    }
  }
  if (requestedPhone) {
    const existing = await dbGetAsync('SELECT id FROM users WHERE phone = ? AND id != ?', [
      requestedPhone,
      targetUserId,
    ]);
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
