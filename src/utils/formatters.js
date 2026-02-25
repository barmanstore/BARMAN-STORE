/**
 * Currency formatting utilities
 */

const INR_LOCALE = 'en-IN';
const INR_CURRENCY = 'INR';

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatCurrency = (amount) => {
  return new Intl.NumberFormat(INR_LOCALE, {
    style: 'currency',
    currency: INR_CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(toNumber(amount));
};

/**
 * Format currency with color indication (positive/negative)
 * Returns object with formatted text and isPositive flag
 */
export const formatCurrencyColored = (amount) => {
  const normalized = toNumber(amount);
  const formatted = formatCurrency(Math.abs(normalized));
  const isPositive = normalized >= 0;
  return { text: formatted, isPositive };
};

export const getSignedCurrencyClassName = (amount) => (toNumber(amount) >= 0 ? 'amount-positive' : 'amount-negative');

export const formatDate = (value, locale = INR_LOCALE, options = {}) => {
  if (value === null || value === undefined || value === '') return '-';

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map((v) => Number(v));
    const localDate = new Date(year, month - 1, day);
    if (Number.isNaN(localDate.getTime())) return '-';
    return localDate.toLocaleDateString(locale, options);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString(locale, options);
};
