const createVerificationLinks = (deps = {}) => {
  const {
    EMAIL_VERIFY_BASE_URL,
    PHONE_VERIFY_BASE_URL,
  } = deps;

  const buildEmailVerificationLink = ({ email, token }) => {
    const base = String(EMAIL_VERIFY_BASE_URL || 'http://localhost/login').trim();
    const hasQuery = base.includes('?');
    return `${base}${hasQuery ? '&' : '?'}email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
  };

  const buildPhoneVerificationLink = ({ phone, code }) => {
    const base = String(PHONE_VERIFY_BASE_URL || '').trim();
    const hasQuery = base.includes('?');
    return `${base}${hasQuery ? '&' : '?'}phone=${encodeURIComponent(phone)}&phoneToken=${encodeURIComponent(code)}`;
  };

  return {
    buildEmailVerificationLink,
    buildPhoneVerificationLink,
  };
};

module.exports = { createVerificationLinks };
