const pad2 = (value) => String(value).padStart(2, '0');

export const toLocalDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

export const getTodayDate = () => toLocalDateKey(new Date());

export const parseDateInputValue = (value) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map((part) => Number(part));
    return new Date(year, month - 1, day);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDateTime = (value, locale = 'en-IN', options = {}) => {
  const date = parseDateInputValue(value);
  if (!date) return '-';
  return date.toLocaleString(locale, options);
};
