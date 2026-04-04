import { safeLocalStorageGet, safeLocalStorageRemove, safeLocalStorageSet } from './storage';

const popupBase = (() => {
  const base = String(import.meta.env.BASE_URL || '/');
  if (base === '/') return '';
  return base.endsWith('/') ? base.slice(0, -1) : base;
})();

const BACKOFFICE_POPUP_CHANNEL_NAME = 'barman_backoffice_popup_channel_v1';
const BACKOFFICE_POPUP_STATUS_TTL_MS = 45000;
const BACKOFFICE_POPUP_HANDOFF_TTL_MS = 5 * 60 * 1000;

const BACKOFFICE_POPUP_CONFIG = {
  billing: {
    kind: 'billing',
    label: 'Billing',
    windowName: 'barman_billing_popup',
    route: '/popup/billing',
    width: 1440,
    height: 920,
  },
  purchase: {
    kind: 'purchase',
    label: 'Purchase Order',
    windowName: 'barman_purchase_popup',
    route: '/popup/purchase',
    width: 1480,
    height: 960,
  },
};

const BACKOFFICE_POPUP_PRELOADERS = {
  billing: () => import('../../features/sales/billing/pages/BillingPopupPage'),
  purchase: () => import('../../features/commerce/purchase/pages/PurchasePopupPage'),
};

const getBackofficePopupConfig = (kind) => BACKOFFICE_POPUP_CONFIG[String(kind || '').trim().toLowerCase()] || null;

const getBackofficePopupStatusKey = (kind) => `backoffice_popup_status_${String(kind || '').trim().toLowerCase()}`;

const getBackofficePopupDraftKey = (kind) => `backoffice_popup_draft_${String(kind || '').trim().toLowerCase()}`;

const getBackofficePopupHandoffKey = (kind) => `backoffice_popup_handoff_${String(kind || '').trim().toLowerCase()}`;

const buildBackofficePopupPath = (kind, params = null) => {
  const config = getBackofficePopupConfig(kind);
  if (!config) return '/';
  const search = new URLSearchParams(params || {});
  const query = search.toString();
  const route = `${popupBase}${config.route}`;
  return query ? `${route}?${query}` : route;
};

const serializePopupFeatures = ({ width, height }) => {
  const left = Math.max(40, Math.round((window.screen.availWidth - width) / 2));
  const top = Math.max(40, Math.round((window.screen.availHeight - height) / 2));
  return [
    'popup=yes',
    'resizable=yes',
    'scrollbars=yes',
    'toolbar=no',
    'menubar=no',
    'status=no',
    'location=no',
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
  ].join(',');
};

const createBackofficePopupChannel = () => {
  if (typeof window === 'undefined' || typeof window.BroadcastChannel !== 'function') return null;
  try {
    return new window.BroadcastChannel(BACKOFFICE_POPUP_CHANNEL_NAME);
  } catch (_) {
    return null;
  }
};

const broadcastBackofficePopupMessage = (message) => {
  const channel = createBackofficePopupChannel();
  if (!channel) return;
  try {
    channel.postMessage(message);
  } catch (_) {
    // Ignore channel failures.
  } finally {
    channel.close();
  }
};

const normalizePopupStatus = (kind, value) => {
  if (!value || typeof value !== 'object') {
    return {
      kind,
      isOpen: false,
      updatedAt: 0,
      sessionId: '',
      label: getBackofficePopupConfig(kind)?.label || '',
    };
  }
  const updatedAt = Number(value.updatedAt || 0);
  const isFresh = updatedAt > 0 && (Date.now() - updatedAt) < BACKOFFICE_POPUP_STATUS_TTL_MS;
  return {
    kind,
    isOpen: Boolean(value.isOpen) && isFresh,
    updatedAt,
    sessionId: String(value.sessionId || ''),
    label: String(value.label || getBackofficePopupConfig(kind)?.label || ''),
  };
};

const normalizePopupHandoff = (kind, value) => {
  if (!value || typeof value !== 'object') {
    return {
      kind,
      id: '',
      updatedAt: 0,
      payload: null,
    };
  }
  const updatedAt = Number(value.updatedAt || 0);
  const isFresh = updatedAt > 0 && (Date.now() - updatedAt) < BACKOFFICE_POPUP_HANDOFF_TTL_MS;
  const payload = value?.payload && typeof value.payload === 'object' ? value.payload : null;
  return {
    kind,
    id: isFresh ? String(value.id || '') : '',
    updatedAt: isFresh ? updatedAt : 0,
    payload: isFresh ? payload : null,
  };
};

const readBackofficePopupStatus = (kind) => {
  try {
    const raw = safeLocalStorageGet(getBackofficePopupStatusKey(kind));
    if (!raw) return normalizePopupStatus(kind, null);
    return normalizePopupStatus(kind, JSON.parse(raw));
  } catch (_) {
    return normalizePopupStatus(kind, null);
  }
};

const readBackofficePopupHandoff = (kind) => {
  try {
    const raw = safeLocalStorageGet(getBackofficePopupHandoffKey(kind));
    if (!raw) return normalizePopupHandoff(kind, null);
    return normalizePopupHandoff(kind, JSON.parse(raw));
  } catch (_) {
    return normalizePopupHandoff(kind, null);
  }
};

const writeBackofficePopupStatus = (kind, nextStatus) => {
  const normalized = normalizePopupStatus(kind, {
    ...nextStatus,
    updatedAt: Number(nextStatus?.updatedAt || Date.now()),
    label: String(nextStatus?.label || getBackofficePopupConfig(kind)?.label || ''),
  });
  safeLocalStorageSet(getBackofficePopupStatusKey(kind), JSON.stringify(normalized));
  broadcastBackofficePopupMessage({
    type: 'popup-status',
    kind: normalized.kind,
    isOpen: normalized.isOpen,
    updatedAt: normalized.updatedAt,
    sessionId: normalized.sessionId,
  });
  return normalized;
};

const clearBackofficePopupStatus = (kind, sessionId = '') => {
  const current = readBackofficePopupStatus(kind);
  if (sessionId && current.sessionId && current.sessionId !== sessionId) return current;
  safeLocalStorageRemove(getBackofficePopupStatusKey(kind));
  broadcastBackofficePopupMessage({
    type: 'popup-status',
    kind,
    isOpen: false,
    updatedAt: Date.now(),
    sessionId,
  });
  return normalizePopupStatus(kind, null);
};

const writeBackofficePopupHandoff = (kind, payload = null) => {
  const normalized = normalizePopupHandoff(kind, {
    id: `handoff_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    updatedAt: Date.now(),
    payload: payload && typeof payload === 'object' ? payload : null,
  });
  safeLocalStorageSet(getBackofficePopupHandoffKey(kind), JSON.stringify(normalized));
  broadcastBackofficePopupMessage({
    type: 'popup-handoff',
    kind: normalized.kind,
    handoffId: normalized.id,
    updatedAt: normalized.updatedAt,
  });
  return normalized;
};

const clearBackofficePopupHandoff = (kind, handoffId = '') => {
  const current = readBackofficePopupHandoff(kind);
  if (handoffId && current.id && current.id !== handoffId) return current;
  safeLocalStorageRemove(getBackofficePopupHandoffKey(kind));
  broadcastBackofficePopupMessage({
    type: 'popup-handoff-cleared',
    kind,
    handoffId,
    updatedAt: Date.now(),
  });
  return normalizePopupHandoff(kind, null);
};

const preloadBackofficePopup = (kind) => {
  const loader = BACKOFFICE_POPUP_PRELOADERS[String(kind || '').trim().toLowerCase()];
  if (!loader) return;
  try {
    void loader();
  } catch (_) {
    // Ignore preload failures and fall back to normal route loading.
  }
};

const openBackofficePopup = (kind, params = null) => {
  if (typeof window === 'undefined') {
    return { status: 'unsupported', popup: null, path: '/' };
  }
  const config = getBackofficePopupConfig(kind);
  if (!config) {
    return { status: 'unsupported', popup: null, path: '/' };
  }

  preloadBackofficePopup(kind);
  const path = buildBackofficePopupPath(kind, params);
  const features = serializePopupFeatures(config);
  const popup = window.open(path, config.windowName, features);

  if (!popup) {
    return { status: 'blocked', popup: null, path };
  }

  try {
    if (!popup.closed && popup.location?.pathname + popup.location?.search !== path) {
      popup.location.href = path;
    }
  } catch (_) {
    // Ignore focus/location issues for cross-window access.
  }

  try {
    popup.focus();
  } catch (_) {
    // Ignore focus failures.
  }

  return { status: 'opened', popup, path };
};

const focusBackofficePopup = (kind, params = null) => openBackofficePopup(kind, params);

export {
  BACKOFFICE_POPUP_HANDOFF_TTL_MS,
  BACKOFFICE_POPUP_CHANNEL_NAME,
  BACKOFFICE_POPUP_STATUS_TTL_MS,
  buildBackofficePopupPath,
  broadcastBackofficePopupMessage,
  clearBackofficePopupHandoff,
  clearBackofficePopupStatus,
  createBackofficePopupChannel,
  focusBackofficePopup,
  getBackofficePopupConfig,
  getBackofficePopupDraftKey,
  getBackofficePopupHandoffKey,
  getBackofficePopupStatusKey,
  normalizePopupHandoff,
  normalizePopupStatus,
  openBackofficePopup,
  preloadBackofficePopup,
  readBackofficePopupHandoff,
  readBackofficePopupStatus,
  writeBackofficePopupHandoff,
  writeBackofficePopupStatus,
};
