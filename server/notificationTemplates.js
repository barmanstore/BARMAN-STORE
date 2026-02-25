const DEFAULT_BUSINESS_NAME = 'BARMAN STORE';

const asBusinessName = (value) => {
  const raw = String(value || '').trim();
  return raw || DEFAULT_BUSINESS_NAME;
};

const formatExpiry = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'soon';
  return date.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: true,
  });
};

const buildEmailVerificationTemplate = (payload = {}) => {
  const businessName = asBusinessName(payload.businessName);
  const recipientName = String(payload.recipientName || 'Customer').trim();
  const link = String(payload.link || '').trim();
  const token = String(payload.token || '').trim();
  const expiresAt = formatExpiry(payload.expiresAt);
  const subject = `${businessName}: Verify your email`;
  const lines = [
    `Hello ${recipientName},`,
    '',
    `Please verify your email for ${businessName}.`,
    '',
    link ? `Verification link: ${link}` : '',
    token ? `Verification code: ${token}` : '',
    '',
    `This link/code expires on ${expiresAt}.`,
    '',
    `If you did not request this, you can ignore this email.`,
    '',
    `Regards,`,
    businessName,
  ].filter(Boolean);

  return {
    subject,
    body: lines.join('\n'),
  };
};

const buildPhoneVerificationTemplate = (payload = {}) => {
  const businessName = asBusinessName(payload.businessName);
  const recipientName = String(payload.recipientName || 'Customer').trim();
  const link = String(payload.link || '').trim();
  const code = String(payload.code || '').trim();
  const expiresAt = formatExpiry(payload.expiresAt);
  const lines = [
    `Hello ${recipientName},`,
    '',
    `Please verify your phone for ${businessName}.`,
    '',
    code ? `Verification code: ${code}` : '',
    link ? `Verification link: ${link}` : '',
    '',
    `This code/link expires on ${expiresAt}.`,
    '',
    `If you did not request this, you can ignore this message.`,
    '',
    `Regards,`,
    businessName,
  ].filter(Boolean);
  return {
    text: lines.join('\n'),
  };
};

const buildPasswordResetOtpTemplate = (payload = {}) => {
  const businessName = asBusinessName(payload.businessName);
  const code = String(payload.code || '').trim();
  const expiresAt = formatExpiry(payload.expiresAt);
  const lines = [
    `Password reset request for ${businessName}.`,
    '',
    code ? `OTP code: ${code}` : '',
    `Expires on ${expiresAt}.`,
    '',
    'If you did not request this, ignore this message.',
  ].filter(Boolean);
  return {
    text: lines.join('\n'),
  };
};

const buildPasswordResetAdminTemplate = (payload = {}) => {
  const businessName = asBusinessName(payload.businessName);
  const recipientName = String(payload.recipientName || 'Customer').trim();
  const newPassword = String(payload.newPassword || '').trim();
  const loginIdentifier = String(payload.loginIdentifier || '').trim();
  const loginUrl = String(payload.loginUrl || '').trim();
  const supportLine = String(payload.supportLine || '').trim();
  const subject = `${businessName}: Your password was reset by admin`;
  const bodyLines = [
    `Hello ${recipientName},`,
    '',
    `Your account password for ${businessName} has been reset by admin.`,
    newPassword ? `Temporary password: ${newPassword}` : '',
    loginIdentifier ? `Login using: ${loginIdentifier}` : '',
    loginUrl ? `Login link: ${loginUrl}` : '',
    '',
    'Please sign in and change your password immediately.',
    supportLine ? `Support: ${supportLine}` : '',
    '',
    `Regards,`,
    businessName,
  ].filter(Boolean);
  const textLines = [
    `Hello ${recipientName},`,
    '',
    `${businessName}: your password was reset by admin.`,
    newPassword ? `Temporary password: ${newPassword}` : '',
    loginIdentifier ? `Login using: ${loginIdentifier}` : '',
    loginUrl ? `Login link: ${loginUrl}` : '',
    '',
    'Please sign in and change your password immediately.',
    supportLine ? `Support: ${supportLine}` : '',
  ].filter(Boolean);
  return {
    subject,
    body: bodyLines.join('\n'),
    text: textLines.join('\n'),
  };
};

const buildNotificationTemplate = (type, payload = {}) => {
  const normalizedType = String(type || '').trim().toLowerCase();
  if (normalizedType === 'email_verification') {
    return buildEmailVerificationTemplate(payload);
  }
  if (normalizedType === 'phone_verification') {
    return buildPhoneVerificationTemplate(payload);
  }
  if (normalizedType === 'password_reset_otp') {
    return buildPasswordResetOtpTemplate(payload);
  }
  if (normalizedType === 'password_reset_admin') {
    return buildPasswordResetAdminTemplate(payload);
  }
  throw new Error(`Unsupported notification type: ${type}`);
};

module.exports = {
  buildNotificationTemplate,
};
