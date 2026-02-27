const DEFAULT_BUSINESS_NAME = 'BARMAN STORE';

const asBusinessName = (value) => {
  const raw = String(value || '').trim();
  return raw || DEFAULT_BUSINESS_NAME;
};

const formatExpiry = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'শীঘ্ৰেই';
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
  const recipientName = String(payload.recipientName || 'গ্ৰাহক').trim();
  const link = String(payload.link || '').trim();
  const code = String(payload.code || '').trim();
  const expiresAt = formatExpiry(payload.expiresAt);
  const lines = [
    `প্ৰিয় ${recipientName},`,
    '',
    `${businessName}ৰ বাবে আপোনাৰ ফোন নম্বৰ যাচাই কৰক।`,
    '',
    code ? `যাচাইকৰণ কোড: ${code}` : '',
    link ? `যাচাইকৰণ লিংক: ${link}` : '',
    '',
    `এই কোড/লিংকৰ মেয়াদ ${expiresAt}ত শেষ হ'ব।`,
    '',
    `আপুনি এই অনুৰোধ কৰা নাছিলে এই মেছেজ উপেক্ষা কৰিব পাৰে।`,
    '',
    `শুভেচ্ছান্তে,`,
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
    `${businessName}ৰ বাবে পাসৱৰ্ড ৰিছেট অনুৰোধ।`,
    '',
    code ? `OTP কোড: ${code}` : '',
    `মেয়াদ: ${expiresAt}`,
    '',
    'আপুনি অনুৰোধ কৰা নাছিলে এই মেছেজ উপেক্ষা কৰক।',
  ].filter(Boolean);
  return {
    text: lines.join('\n'),
  };
};

const buildAuthLoginOtpTemplate = (payload = {}) => {
  const businessName = asBusinessName(payload.businessName);
  const recipientName = String(payload.recipientName || 'Customer').trim();
  const code = String(payload.code || '').trim();
  const expiresAt = formatExpiry(payload.expiresAt);
  const subject = `${businessName}: Your login OTP`;
  const body = [
    `Hello ${recipientName},`,
    '',
    `Your ${businessName} login OTP is: ${code || '-'}`,
    '',
    `This OTP expires on ${expiresAt}.`,
    'If you did not request this, ignore this message.',
  ].join('\n');
  const text = [
    `${businessName} login OTP: ${code || '-'}`,
    `Expires: ${expiresAt}`,
    'If not requested, ignore this message.',
  ].join('\n');
  return { subject, body, text };
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
    `প্ৰিয় ${recipientName},`,
    '',
    `${businessName}: আপোনাৰ পাসৱৰ্ড এডমিনে ৰিছেট কৰিছে।`,
    newPassword ? `অস্থায়ী পাসৱৰ্ড: ${newPassword}` : '',
    loginIdentifier ? `লগইন: ${loginIdentifier}` : '',
    loginUrl ? `লগইন লিংক: ${loginUrl}` : '',
    '',
    'অনুগ্ৰহ কৰি লগইন কৰি তৎক্ষণাত পাসৱৰ্ড সলনি কৰক।',
    supportLine ? `সহায়তা: ${supportLine}` : '',
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
  if (normalizedType === 'auth_login_otp') {
    return buildAuthLoginOtpTemplate(payload);
  }
  if (normalizedType === 'password_reset_admin') {
    return buildPasswordResetAdminTemplate(payload);
  }
  throw new Error(`Unsupported notification type: ${type}`);
};

module.exports = {
  buildNotificationTemplate,
};
