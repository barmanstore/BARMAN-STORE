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
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:')) return raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsedUrl = new URL(raw);
      const isHttpsPage = typeof window !== 'undefined' && window.location?.protocol === 'https:';
      const host = String(parsedUrl.hostname || '').toLowerCase();
      const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
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
      const mediaBase = baseUrl ? `${baseUrl}/api` : '/api';
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

// Get auth token from localStorage
const getAuthToken = () => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return user.token || null;
  } catch (e) {
    return null;
  }
};

// Generic fetch wrapper
export const apiFetch = async (endpoint, options = {}) => {
  const baseUrl = getApiUrl();
  const url = `${baseUrl}${endpoint}`;

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

export { getApiUrl };
