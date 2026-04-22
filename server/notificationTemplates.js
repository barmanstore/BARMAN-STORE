const { buildPurchaseOrderDistributorNoticeText } = require('../shared/messageTemplates.cjs');

const DEFAULT_BUSINESS_NAME = "বৰ্মন ষ্ট'ৰ";
const DEFAULT_RECIPIENT_NAME = 'গ্ৰাহক';
const MOJIBAKE_PATTERN = /(?:Ã.|Â.|à¦|à§|ðŸ)/;

const cleanAssamese = (value, fallback) => {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  if (MOJIBAKE_PATTERN.test(raw)) return fallback;
  return raw;
};

const asBusinessName = (value) => {
  const raw = cleanAssamese(value, DEFAULT_BUSINESS_NAME);
  if (raw.toUpperCase() === 'BARMAN STORE') return DEFAULT_BUSINESS_NAME;
  return raw;
};

const asRecipientName = (value) => cleanAssamese(value, DEFAULT_RECIPIENT_NAME);

const formatExpiry = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'শীঘ্ৰেই';
  return date.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: true,
  });
};

const joinLines = (lines) => lines.filter(Boolean).join('\n');

const buildEmailVerificationTemplate = (payload = {}) => {
  const businessName = asBusinessName(payload.businessName);
  const recipientName = asRecipientName(payload.recipientName);
  const link = String(payload.link || '').trim();
  const token = String(payload.token || '').trim();
  const expiresAt = formatExpiry(payload.expiresAt);

  return {
    subject: `${businessName}: ইমেইল যাচাই`,
    body: joinLines([
      `নমস্কাৰ ${recipientName},`,
      `${businessName}ৰ বাবে আপোনাৰ ইমেইল যাচাই কৰক।`,
      link ? `যাচাই লিংক: ${link}` : '',
      token ? `যাচাই কোড: ${token}` : '',
      `মেয়াদ: ${expiresAt}`,
      'আপুনি অনুৰোধ নকৰিলে এই বাৰ্তাটো উপেক্ষা কৰক।',
      `শুভেচ্ছান্তে, ${businessName}`,
    ]),
  };
};

const buildPhoneVerificationTemplate = (payload = {}) => {
  const businessName = asBusinessName(payload.businessName);
  const recipientName = asRecipientName(payload.recipientName);
  const link = String(payload.link || '').trim();
  const code = String(payload.code || '').trim();
  const expiresAt = formatExpiry(payload.expiresAt);

  return {
    text: joinLines([
      businessName,
      'ফোন যাচাই',
      `নমস্কাৰ ${recipientName},`,
      code ? `কোড: ${code}` : '',
      link ? `লিংক: ${link}` : '',
      `মেয়াদ: ${expiresAt}`,
      'আপুনি অনুৰোধ নকৰিলে এই বাৰ্তাটো উপেক্ষা কৰক।',
    ]),
  };
};

const buildPasswordResetOtpTemplate = (payload = {}) => {
  const businessName = asBusinessName(payload.businessName);
  const code = String(payload.code || '').trim();
  const expiresAt = formatExpiry(payload.expiresAt);

  return {
    text: joinLines([
      businessName,
      'পাছৱৰ্ড ৰিছেট',
      code ? `OTP: ${code}` : '',
      `মেয়াদ: ${expiresAt}`,
      'আপুনি অনুৰোধ নকৰিলে এই বাৰ্তাটো উপেক্ষা কৰক।',
    ]),
  };
};

const buildAuthLoginOtpTemplate = (payload = {}) => {
  const businessName = asBusinessName(payload.businessName);
  const recipientName = asRecipientName(payload.recipientName);
  const code = String(payload.code || '').trim();
  const expiresAt = formatExpiry(payload.expiresAt);

  return {
    subject: `${businessName}: লগইন OTP`,
    body: joinLines([
      `নমস্কাৰ ${recipientName},`,
      `${businessName} লগইন OTP: ${code || '-'}`,
      `মেয়াদ: ${expiresAt}`,
      'আপুনি অনুৰোধ নকৰিলে এই বাৰ্তাটো উপেক্ষা কৰক।',
    ]),
    text: joinLines([
      businessName,
      'লগইন OTP',
      `কোড: ${code || '-'}`,
      `মেয়াদ: ${expiresAt}`,
      'আপুনি অনুৰোধ নকৰিলে এই বাৰ্তাটো উপেক্ষা কৰক।',
    ]),
  };
};

const buildPasswordResetAdminTemplate = (payload = {}) => {
  const businessName = asBusinessName(payload.businessName);
  const recipientName = asRecipientName(payload.recipientName);
  const newPassword = String(payload.newPassword || '').trim();
  const loginIdentifier = String(payload.loginIdentifier || '').trim();
  const loginUrl = String(payload.loginUrl || '').trim();
  const supportLine = String(payload.supportLine || '').trim();

  return {
    subject: `${businessName}: এডমিনে পাছৱৰ্ড ৰিছেট কৰিছে`,
    body: joinLines([
      `নমস্কাৰ ${recipientName},`,
      `${businessName} একাউণ্টৰ পাছৱৰ্ড এডমিনে ৰিছেট কৰিছে।`,
      newPassword ? `অস্থায়ী পাছৱৰ্ড: ${newPassword}` : '',
      loginIdentifier ? `লগইন: ${loginIdentifier}` : '',
      loginUrl ? `লগইন লিংক: ${loginUrl}` : '',
      'লগইন কৰি তৎক্ষণাৎ পাছৱৰ্ড সলনি কৰক।',
      supportLine ? `সহায়তা: ${supportLine}` : '',
      `শুভেচ্ছান্তে, ${businessName}`,
    ]),
    text: joinLines([
      businessName,
      'এডমিন পাছৱৰ্ড ৰিছেট',
      `নমস্কাৰ ${recipientName},`,
      newPassword ? `অস্থায়ী পাছৱৰ্ড: ${newPassword}` : '',
      loginIdentifier ? `লগইন: ${loginIdentifier}` : '',
      loginUrl ? `লিংক: ${loginUrl}` : '',
      'লগইন কৰি তৎক্ষণাৎ পাছৱৰ্ড সলনি কৰক।',
      supportLine ? `সহায়তা: ${supportLine}` : '',
    ]),
  };
};

const normalizePoNoticeDate = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return new Date().toISOString().slice(0, 10);
  return raw.slice(0, 10);
};

const buildPurchaseOrderDistributorNoticeTemplate = (payload = {}) => {
  const orderDate = normalizePoNoticeDate(
    payload.orderDate || payload.order_date || payload.date || payload.messageDate
  );
  return {
    text: buildPurchaseOrderDistributorNoticeText({
      companyTitle: payload.businessName,
      title: payload.title,
      orderDate,
      items: Array.isArray(payload.items) ? payload.items : [],
      onlineStoreUrl: payload.onlineStoreUrl,
      thankYouLine: payload.thankYouLine,
    }),
  };
};

const buildNotificationTemplate = (type, payload = {}) => {
  const normalizedType = String(type || '')
    .trim()
    .toLowerCase();
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
  if (normalizedType === 'purchase_order_distributor_notice') {
    return buildPurchaseOrderDistributorNoticeTemplate(payload);
  }
  throw new Error(`Unsupported notification type: ${type}`);
};

module.exports = {
  buildNotificationTemplate,
};
