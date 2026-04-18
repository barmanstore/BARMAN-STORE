import { PRODUCTS_LIST_CACHE_PREFIX } from './productConstants';
import { normalizeText, normalizeSortBy } from './productTextUtils';
import { getSessionUser } from '../../../../shared/services/api/sessionAccess';

const safeReadJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
};

const safeWriteJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    // Ignore storage write failures to keep ordering flow responsive.
  }
};

const safeReadSessionJson = (key, fallback) => {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
};

const getInitials = (name) => {
  const trimmed = String(name || '').trim();
  if (!trimmed) return '?';
  return trimmed
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
};

const safeWriteSessionJson = (key, value) => {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    // Ignore storage write issues.
  }
};

const readSessionStorageValue = (key) => {
  try {
    return String(sessionStorage.getItem(key) || '').trim();
  } catch (_) {
    return '';
  }
};

const writeSessionStorageValue = (key, value) => {
  try {
    sessionStorage.setItem(key, String(value || ''));
  } catch (_) {
    // Ignore storage write issues.
  }
};

const readLocalUser = () => {
  return getSessionUser();
};

const createTelemetrySessionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `products_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const hasActiveUserSession = () => {
  return Boolean(String(getSessionUser()?.token || '').trim());
};

const buildProductsListSessionCacheKey = ({
  selectedCategory,
  query,
  sortBy,
  inStockOnly,
  pageSize,
}) => {
  return [
    PRODUCTS_LIST_CACHE_PREFIX,
    normalizeText(selectedCategory || 'all') || 'all',
    normalizeText(query || ''),
    normalizeSortBy(sortBy),
    inStockOnly ? '1' : '0',
    String(Number(pageSize || 0)),
  ].join('|');
};

export {
  safeReadJson,
  safeWriteJson,
  safeReadSessionJson,
  safeWriteSessionJson,
  readSessionStorageValue,
  writeSessionStorageValue,
  getInitials,
  readLocalUser,
  createTelemetrySessionId,
  hasActiveUserSession,
  buildProductsListSessionCacheKey,
};
