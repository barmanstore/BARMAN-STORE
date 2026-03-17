import { DEFAULT_SORT_BY, SORT_OPTIONS } from './productConstants';

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const PRODUCTS_SYNONYMS = {
  milk: ['doodh'],
  curd: ['dahi', 'yogurt'],
  biscuit: ['cookie'],
  chips: ['namkeen', 'snack'],
  atta: ['flour'],
  dal: ['lentil', 'pulse'],
  rice: ['chawal'],
  detergent: ['washing', 'powder'],
  soap: ['bodywash'],
  tea: ['chai']
};

const PRODUCTS_SYNONYM_REVERSE = Object.entries(PRODUCTS_SYNONYMS).reduce((acc, [key, values]) => {
  const normalizedKey = normalizeText(key);
  (Array.isArray(values) ? values : []).forEach((value) => {
    const normalizedValue = normalizeText(value);
    if (!normalizedValue) return;
    if (!acc[normalizedValue]) acc[normalizedValue] = [];
    acc[normalizedValue].push(normalizedKey);
  });
  return acc;
}, {});

const normalizeSortBy = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  return SORT_OPTIONS.includes(normalized) ? normalized : DEFAULT_SORT_BY;
};

const tokenizeSearchText = (value = '') => {
  return normalizeText(value)
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
};

const tokenFuzzyMatch = (queryToken, targetToken) => {
  const query = String(queryToken || '');
  const target = String(targetToken || '');
  if (!query || !target) return false;
  if (target === query) return true;
  if (target.startsWith(query) || query.startsWith(target)) return true;
  if (Math.abs(query.length - target.length) > 1 || query.length < 4 || target.length < 4) return false;
  let mismatch = 0;
  const limit = Math.min(query.length, target.length);
  for (let index = 0; index < limit; index += 1) {
    if (query[index] === target[index]) continue;
    mismatch += 1;
    if (mismatch > 1) return false;
  }
  return mismatch <= 1;
};

const getUsageWindowDays = (label = '', category = '', addCount = 0) => {
  const text = `${normalizeText(label)} ${normalizeText(category)}`;
  let baseDays = 7;
  if (/(milk|dairy|egg|bread|curd|yogurt|paneer)/.test(text)) baseDays = 4;
  else if (/(rice|atta|flour|oil|sugar|salt|tea)/.test(text)) baseDays = 12;
  else if (/(biscuit|snack|noodle|personal|soap|shampoo)/.test(text)) baseDays = 9;
  const frequencyTuning = Math.min(4, Math.floor(Number(addCount || 0) / 3));
  return Math.max(3, baseDays - frequencyTuning);
};

const normalizePathTokens = (value = '') => {
  return String(value || '')
    .split('->')
    .map((part) => normalizeText(part))
    .filter(Boolean);
};

const normalizePathValue = (value = '') => normalizePathTokens(value).join(' ->');

export {
  normalizeText,
  PRODUCTS_SYNONYMS,
  PRODUCTS_SYNONYM_REVERSE,
  normalizeSortBy,
  tokenizeSearchText,
  tokenFuzzyMatch,
  getUsageWindowDays,
  normalizePathTokens,
  normalizePathValue,
};
