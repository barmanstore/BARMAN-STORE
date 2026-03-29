import { normalizeIndianPhone } from './phone.js';

const INDIA_COUNTRY_CODE = '91';
export const MAX_URL_LENGTH = 1800;

const normalizeMessageText = (text) => String(text || '').trim();

export const normalizePhoneForWhatsApp = (phone) => {
  const localNumber = normalizeIndianPhone(phone);
  if (!localNumber) return '';
  return `${INDIA_COUNTRY_CODE}${localNumber}`;
};

export const isValidWhatsAppPhone = (phone) => {
  const normalized = normalizePhoneForWhatsApp(phone);
  return /^91\d{10}$/.test(normalized);
};

export const buildWhatsAppUrl = ({ phone, text } = {}) => {
  const normalized = normalizePhoneForWhatsApp(phone);
  const encoded = encodeURIComponent(normalizeMessageText(text));
  return normalized ? `https://wa.me/${normalized}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
};

export const openWhatsApp = (params = {}) => {
  const href = buildWhatsAppUrl(params);
  if (typeof window !== 'undefined') {
    window.open(href, '_blank', 'noopener,noreferrer');
  }
  return href;
};

export const sendWhatsAppSmart = async ({ phone, text, maxUrlLength = MAX_URL_LENGTH } = {}) => {
  const message = normalizeMessageText(text);
  const normalized = normalizePhoneForWhatsApp(phone);
  const hasValidPhone = isValidWhatsAppPhone(normalized);
  if (!hasValidPhone) {
    return { status: 'blocked_no_phone', href: '', copied: false };
  }

  const encoded = encodeURIComponent(message);
  const href = `https://wa.me/${normalized}?text=${encoded}`;
  if (href.length <= maxUrlLength) {
    if (typeof window !== 'undefined') {
      window.open(href, '_blank', 'noopener,noreferrer');
    }
    return { status: 'opened_whatsapp', href, copied: false };
  }

  let copied = false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(message);
      copied = true;
    }
  } catch (_) {
    copied = false;
  }

  const fallbackHref = `https://wa.me/${normalized}`;
  if (typeof window !== 'undefined') {
    window.open(fallbackHref, '_blank', 'noopener,noreferrer');
  }
  return { status: copied ? 'opened_with_copy' : 'opened_without_copy', href: fallbackHref, copied };
};
