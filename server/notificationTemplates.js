const DEFAULT_BUSINESS_NAME = "বৰ্মন ষ্ট'ৰ";

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
  const recipientName = String(payload.recipientName || 'গ্ৰাহক').trim();
  const link = String(payload.link || '').trim();
  const token = String(payload.token || '').trim();
  const expiresAt = formatExpiry(payload.expiresAt);
  const subject = `${businessName}: ইমেইল যাচাই`;
  const lines = [
    `নমস্কাৰ ${recipientName},`,
    `${businessName} ৰ বাবে আপোনাৰ ইমেইল যাচাই কৰক।`,
    link ? `যাচাই লিংক: ${link}` : '',
    token ? `যাচাই কোড: ${token}` : '',
    `এই লিংক/কোডৰ মেয়াদ: ${expiresAt}`,
    'আপুনি অনুৰোধ নকৰিলে এই মেছেজ উপেক্ষা কৰক।',
    `শুভেচ্ছান্তে, ${businessName}`,
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
    `${businessName} ফোন যাচাই`,
    `নমস্কাৰ ${recipientName}, আপোনাৰ ফোন নম্বৰ যাচাই কৰক।`,
    code ? `কোড: ${code}` : '',
    link ? `লিংক: ${link}` : '',
    `মেয়াদ: ${expiresAt}`,
    'আপুনি অনুৰোধ নকৰিলে উপেক্ষা কৰক।',
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
    `${businessName} পাসৱৰ্ড ৰিছেট`,
    code ? `OTP: ${code}` : '',
    `মেয়াদ: ${expiresAt}`,
    'আপুনি অনুৰোধ নকৰিলে উপেক্ষা কৰক।',
  ].filter(Boolean);
  return {
    text: lines.join('\n'),
  };
};

const buildAuthLoginOtpTemplate = (payload = {}) => {
  const businessName = asBusinessName(payload.businessName);
  const recipientName = String(payload.recipientName || 'গ্ৰাহক').trim();
  const code = String(payload.code || '').trim();
  const expiresAt = formatExpiry(payload.expiresAt);
  const subject = `${businessName}: লগইন OTP`;
  const body = [
    `নমস্কাৰ ${recipientName},`,
    `${businessName} লগইন OTP: ${code || '-'}`,
    `OTP ৰ মেয়াদ: ${expiresAt}`,
    'আপুনি অনুৰোধ নকৰিলে এই মেছেজ উপেক্ষা কৰক।',
  ].join('\n');
  const text = [
    `${businessName} লগইন OTP: ${code || '-'}`,
    `মেয়াদ: ${expiresAt}`,
    'আপুনি অনুৰোধ নকৰিলে উপেক্ষা কৰক।',
  ].join('\n');
  return { subject, body, text };
};

const buildPasswordResetAdminTemplate = (payload = {}) => {
  const businessName = asBusinessName(payload.businessName);
  const recipientName = String(payload.recipientName || 'গ্ৰাহক').trim();
  const newPassword = String(payload.newPassword || '').trim();
  const loginIdentifier = String(payload.loginIdentifier || '').trim();
  const loginUrl = String(payload.loginUrl || '').trim();
  const supportLine = String(payload.supportLine || '').trim();
  const subject = `${businessName}: এডমিনে পাসৱৰ্ড ৰিছেট কৰিছে`;
  const bodyLines = [
    `নমস্কাৰ ${recipientName},`,
    `${businessName} একাউণ্টৰ পাসৱৰ্ড এডমিনে ৰিছেট কৰিছে।`,
    newPassword ? `অস্থায়ী পাসৱৰ্ড: ${newPassword}` : '',
    loginIdentifier ? `লগইন: ${loginIdentifier}` : '',
    loginUrl ? `লগইন লিংক: ${loginUrl}` : '',
    'তৎক্ষণাত লগইন কৰি পাসৱৰ্ড সলনি কৰক।',
    supportLine ? `সহায়তা: ${supportLine}` : '',
    `শুভেচ্ছান্তে, ${businessName}`,
  ].filter(Boolean);
  const textLines = [
    `${businessName} এডমিন পাসৱৰ্ড ৰিছেট`,
    `নমস্কাৰ ${recipientName}, আপোনাৰ পাসৱৰ্ড ৰিছেট কৰা হৈছে।`,
    newPassword ? `অস্থায়ী পাসৱৰ্ড: ${newPassword}` : '',
    loginIdentifier ? `লগইন: ${loginIdentifier}` : '',
    loginUrl ? `লিংক: ${loginUrl}` : '',
    'লগইন কৰি তৎক্ষণাত পাসৱৰ্ড সলনি কৰক।',
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
