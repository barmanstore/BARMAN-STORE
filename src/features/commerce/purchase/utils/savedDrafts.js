import {
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
} from '../../../../shared/utils/storage';

const PURCHASE_SAVED_DRAFTS_KEY = 'purchase_saved_drafts_v1';

const normalizeSavedDraft = (entry = {}) => {
  const id = String(entry?.id || '').trim();
  if (!id) return null;
  const orderFormData =
    entry?.orderFormData && typeof entry.orderFormData === 'object' ? entry.orderFormData : null;
  if (!orderFormData) return null;
  return {
    id,
    title: String(entry?.title || '').trim() || 'Purchase draft',
    supplierName: String(entry?.supplierName || '').trim(),
    updatedAt: Number(entry?.updatedAt || 0) || Date.now(),
    itemCount: Math.max(0, Number(entry?.itemCount || 0)),
    totalAmount: Math.max(0, Number(entry?.totalAmount || 0)),
    orderFullMode: Boolean(entry?.orderFullMode),
    orderFormData,
  };
};

const readSavedPurchaseDrafts = () => {
  try {
    const raw = safeLocalStorageGet(PURCHASE_SAVED_DRAFTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const drafts = Array.isArray(parsed) ? parsed : [];
    return drafts
      .map((entry) => normalizeSavedDraft(entry))
      .filter(Boolean)
      .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
  } catch (_) {
    return [];
  }
};

const writeSavedPurchaseDrafts = (drafts = []) => {
  const normalized = (Array.isArray(drafts) ? drafts : [])
    .map((entry) => normalizeSavedDraft(entry))
    .filter(Boolean)
    .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
  if (!normalized.length) {
    safeLocalStorageRemove(PURCHASE_SAVED_DRAFTS_KEY);
    return [];
  }
  safeLocalStorageSet(PURCHASE_SAVED_DRAFTS_KEY, JSON.stringify(normalized));
  return normalized;
};

export { PURCHASE_SAVED_DRAFTS_KEY, readSavedPurchaseDrafts, writeSavedPurchaseDrafts };
