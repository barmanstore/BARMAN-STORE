const createValidateCustomerProfile = (normalizePhone) => (user, addressObj) => {
  const issues = [];
  if (!user?.phone || normalizePhone(user.phone)?.length < 10) {
    issues.push({ field: 'phone', message: 'Mobile number is required' });
  }
  const emailVerified = Number(user?.email_verified || 0) === 1;
  const phoneVerified = Number(user?.phone_verified || 0) === 1;
  if (!emailVerified && !phoneVerified) {
    issues.push({ field: 'verification', message: 'Verify at least one contact method (email or phone) before placing orders' });
  }
  if (!addressObj?.street) issues.push({ field: 'street', message: 'Street address is required' });
  if (!addressObj?.city) issues.push({ field: 'city', message: 'City is required' });
  if (!addressObj?.state) issues.push({ field: 'state', message: 'State is required' });
  if (!addressObj?.zip) issues.push({ field: 'zip', message: 'Postal code is required' });
  return { complete: issues.length === 0, issues };
};

module.exports = { createValidateCustomerProfile };
