import { clearSession, getSessionUser } from './sessionAccess';

// Resolve API base URL.
// - Production behind reverse proxy: use relative '/api' calls (base '')
// - Optional override with VITE_API_BASE_URL when needed
const getApiUrl = () => {
  const fromEnv = String(import.meta.env.VITE_API_BASE_URL || '').trim();
  return fromEnv ? fromEnv.replace(/\/+$/, '') : '';
};

export const createClientRequestId = (prefix = 'req') => {
  const safePrefix = String(prefix || 'req').replace(/[^a-zA-Z0-9_-]/g, '') || 'req';
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${safePrefix}_${crypto.randomUUID().replace(/-/g, '')}`;
  }
  return `${safePrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
};

const IMAGE_FILE_PATTERN = /\.(avif|bmp|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i;

const normalizeLegacyMediaPath = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return raw;
  if (raw.startsWith('uploads/')) return `/${raw}`;
  if (IMAGE_FILE_PATTERN.test(raw)) return `/uploads/${raw.replace(/^\/+/, '')}`;
  return raw;
};

export const withClientRequestId = (payload, prefix) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const existing = String(payload.client_request_id || '').trim();
  if (existing) return payload;
  return {
    ...payload,
    client_request_id: createClientRequestId(prefix),
  };
};

export const resolveMediaUrl = (value) => {
  const raw = normalizeLegacyMediaPath(value);
  if (!raw) return '';
  if (raw.startsWith('data:')) return raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsedUrl = new URL(raw);
      const host = String(parsedUrl.hostname || '').toLowerCase();
      const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
      if (import.meta.env.DEV) {
        if (isLocalHost && parsedUrl.pathname.startsWith('/api/uploads/')) {
          return `/api/uploads/${parsedUrl.pathname.slice('/api/uploads/'.length)}${parsedUrl.search}`;
        }
        if (isLocalHost && parsedUrl.pathname.startsWith('/uploads/')) {
          return `/api${parsedUrl.pathname}${parsedUrl.search}`;
        }
      }
      const isHttpsPage = typeof window !== 'undefined' && window.location?.protocol === 'https:';
      if (isHttpsPage && parsedUrl.protocol === 'http:' && !isLocalHost) {
        parsedUrl.protocol = 'https:';
      }
      return parsedUrl.toString();
    } catch (_) {
      return raw;
    }
  }
  if (raw.startsWith('/')) {
    const baseUrl = getApiUrl();
    if (raw.startsWith('/uploads/')) {
      const mediaBase = import.meta.env.DEV ? '/api' : baseUrl ? `${baseUrl}/api` : '/api';
      return `${mediaBase}${raw}`;
    }
    return `${baseUrl}${raw}`;
  }
  return raw;
};

export const resolveMediaSourceForDisplay = async (value) => {
  const directUrl = resolveMediaUrl(value);
  if (!directUrl) return { src: '', revoke: false };
  return { src: directUrl, revoke: false };
};

// Get auth token from session access
const getAuthToken = () => {
  const user = getSessionUser();
  const token = String(user?.token || '').trim();
  return token || null;
};

// Generic fetch wrapper
export const apiFetch = async (endpoint, options = {}) => {
  const baseUrl = getApiUrl();
  const url = /^https?:\/\//i.test(endpoint) ? endpoint : `${baseUrl}${endpoint}`;

  const token = getAuthToken();
  const isFormData = typeof FormData !== 'undefined' && options?.body instanceof FormData;

  const config = {
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
    ...options,
  };

  if (config.body && typeof config.body === 'object' && !isFormData) {
    config.body = JSON.stringify(config.body);
    if (!config.headers['Content-Type'] && !config.headers['content-type']) {
      config.headers['Content-Type'] = 'application/json';
    }
  }

  const response = await fetch(url, config);
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();

  if (!response.ok) {
    const errorPayload = contentType.includes('application/json')
      ? await response.json().catch(() => ({ error: 'Request failed' }))
      : { error: 'Request failed' };
    if (response.status === 401) {
      clearSession();
    }
    const message = errorPayload.error || errorPayload.message || 'Request failed';
    const err = new Error(message);
    err.status = response.status;
    err.payload = errorPayload;
    throw err;
  }

  if (!contentType.includes('application/json')) {
    const bodyText = await response.text().catch(() => '');
    const preview = bodyText.slice(0, 120).replace(/\s+/g, ' ').trim();
    const err = new Error(
      `Expected JSON but received ${contentType || 'unknown content-type'} from ${url}. Response starts with: ${preview}`
    );
    err.status = response.status;
    err.payload = { error: err.message };
    throw err;
  }

  return response.json();
};

export const apiFetchRaw = async (endpoint, options = {}) => {
  const baseUrl = getApiUrl();
  const url = /^https?:\/\//i.test(endpoint) ? endpoint : `${baseUrl}${endpoint}`;

  const token = getAuthToken();
  const isFormData = typeof FormData !== 'undefined' && options?.body instanceof FormData;

  const config = {
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
    ...options,
  };

  if (config.body && typeof config.body === 'object' && !isFormData) {
    config.body = JSON.stringify(config.body);
    if (!config.headers['Content-Type'] && !config.headers['content-type']) {
      config.headers['Content-Type'] = 'application/json';
    }
  }

  const response = await fetch(url, config);
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();

  if (!response.ok) {
    const errorPayload = contentType.includes('application/json')
      ? await response.json().catch(() => ({ error: 'Request failed' }))
      : { error: 'Request failed' };
    if (response.status === 401) {
      clearSession();
    }
    const message = errorPayload.error || errorPayload.message || 'Request failed';
    const err = new Error(message);
    err.status = response.status;
    err.payload = errorPayload;
    throw err;
  }

  return response;
};

export { getApiUrl };
