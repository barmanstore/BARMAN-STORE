const validateOrderPayload = async ({
  payload,
  dbGetAsync,
  normalizeEmail,
  parsePhoneInput,
}) => {
  const {
    user_id = null,
    customer_name,
    customer_email = '',
    customer_phone = null,
    items = [],
  } = payload;

  if (!customer_name || !items.length) {
    throw new Error('Missing required fields');
  }
  if (!Number(user_id)) {
    throw new Error('AUTH_REQUIRED: Login is required to place orders');
  }
  const normalizedCustomerEmail = normalizeEmail(customer_email) || '';
  const account = await dbGetAsync(
    'SELECT id, role, email_verified, phone_verified FROM users WHERE id = ?',
    [user_id]
  );
  if (!account) {
    throw new Error('CUSTOMER_NOT_FOUND');
  }
  if (
    String(account.role || '').toLowerCase() !== 'admin' &&
    Number(account.email_verified || 0) !== 1 &&
    Number(account.phone_verified || 0) !== 1
  ) {
    throw new Error('INCOMPLETE_PROFILE: Verify at least one contact method (email or phone) before placing orders');
  }
  const phoneParsed = parsePhoneInput(customer_phone);
  if (phoneParsed.error) {
    throw new Error(phoneParsed.error);
  }
  const normalizedCustomerPhone = phoneParsed.value;

  return {
    normalizedCustomerEmail,
    normalizedCustomerPhone,
  };
};

module.exports = { validateOrderPayload };
