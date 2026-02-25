import { ONLINE_STORE_URL } from '../pages/info';
import { normalizeIndianPhone } from './phone';

const INDIA_COUNTRY_CODE = '91';

const getStoreUrl = () => String(ONLINE_STORE_URL || '').trim();

const appendVisitUsFooter = (text) => {
  const baseText = String(text || '').trim();
  const storeUrl = getStoreUrl();
  if (!storeUrl) return baseText;

  const normalizedText = baseText.toLowerCase();
  const normalizedUrl = storeUrl.toLowerCase();
  if (normalizedText.includes(normalizedUrl)) return baseText;

  const footer = `Visit us at ${storeUrl}`;
  return baseText ? `${baseText}\n\n${footer}` : footer;
};

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
  const encoded = encodeURIComponent(appendVisitUsFooter(text));
  return normalized
    ? `https://wa.me/${normalized}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
};

export const openWhatsApp = (params = {}) => {
  const href = buildWhatsAppUrl(params);
  if (typeof window !== 'undefined') {
    window.open(href, '_blank', 'noopener,noreferrer');
  }
  return href;
};

export const sendWhatsAppSmart = async ({
  phone,
  text,
  maxUrlLength = 1800,
} = {}) => {
  const message = appendVisitUsFooter(text);
  const normalized = normalizePhoneForWhatsApp(phone);
  const hasValidPhone = isValidWhatsAppPhone(normalized);
  if (!hasValidPhone) {
    return { status: 'missing_phone', href: '', copied: false };
  }

  const encoded = encodeURIComponent(message);
  const href = `https://wa.me/${normalized}?text=${encoded}`;
  if (href.length <= maxUrlLength) {
    if (typeof window !== 'undefined') {
      window.open(href, '_blank', 'noopener,noreferrer');
    }
    return { status: 'sent_url', href, copied: false };
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
  return { status: copied ? 'fallback_copy' : 'fallback_no_copy', href: fallbackHref, copied };
};
