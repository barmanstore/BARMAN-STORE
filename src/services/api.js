// Resolve API base URL.
// - Production behind reverse proxy: use relative '/api' calls (base '')
// - Optional override with VITE_API_BASE_URL when needed
const isGitHubPagesRuntime = () =>
  typeof window !== 'undefined' && /\.github\.io$/i.test(window.location.hostname);

const isNgrokUrl = (value) => /\.ngrok-free\.(app|dev)(\/|$)/i.test(String(value || ''));
const isLocalhostRuntime = () => {
  if (typeof window === 'undefined') return false;
  const host = String(window.location.hostname || '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1';
};

const getApiUrl = () => {
  const fromEnv = String(import.meta.env.VITE_API_BASE_URL || '').trim();
  if (isLocalhostRuntime() && isNgrokUrl(fromEnv)) {
    return 'http://localhost:5000';
  }
  if (!fromEnv && isGitHubPagesRuntime()) {
    throw new Error('Missing VITE_API_BASE_URL for GitHub Pages runtime. Configure VITE_API_BASE_URL in deployment environment.');
  }
  return fromEnv ? fromEnv.replace(/\/+$/, '') : '';
};

export const resolveMediaUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:')) return raw;
  if (/^https?:\/\//i.test(raw)) {
    const baseUrl = getApiUrl();
    const shouldProxy = !!baseUrl && isGitHubPagesRuntime();
    if (!shouldProxy) return raw;
    try {
      const mediaOrigin = new URL(raw).origin;
      if (mediaOrigin === new URL(baseUrl).origin) return raw;
    } catch (_) {
      // fallback to proxy for malformed-but-http-like values
    }
    const proxied = `${baseUrl}/api/media/proxy?url=${encodeURIComponent(raw)}`;
    if (isNgrokUrl(baseUrl)) {
      return `${proxied}&ngrok-skip-browser-warning=true`;
    }
    return proxied;
  }
  if (raw.startsWith('/')) {
    const baseUrl = getApiUrl();
    if (raw.startsWith('/uploads/')) {
      if (typeof window !== 'undefined' && !/\.github\.io$/i.test(window.location.hostname)) {
        return `/api${raw}`;
      }
      const mediaUrl = `${baseUrl}/api${raw}`;
      if (isNgrokUrl(baseUrl)) {
        return `${mediaUrl}${mediaUrl.includes('?') ? '&' : '?'}ngrok-skip-browser-warning=true`;
      }
      return mediaUrl;
    }
    return `${baseUrl}${raw}`;
  }
  return raw;
};

export const resolveMediaSourceForDisplay = async (value) => {
  const directUrl = resolveMediaUrl(value);
  if (!directUrl) return { src: '', revoke: false };

  const isGitHubHost = typeof window !== 'undefined' && /\.github\.io$/i.test(window.location.hostname);
  if (!isGitHubHost || !isNgrokUrl(directUrl)) {
    return { src: directUrl, revoke: false };
  }

  try {
    const headers = {};
    if (isNgrokUrl(directUrl)) {
      headers['ngrok-skip-browser-warning'] = 'true';
    }
    const response = await fetch(directUrl, { headers });
    if (!response.ok) return { src: directUrl, revoke: false };
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('image/')) return { src: directUrl, revoke: false };
    const blob = await response.blob();
    return { src: URL.createObjectURL(blob), revoke: true };
  } catch (_) {
    return { src: directUrl, revoke: false };
  }
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
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers,
    },
    ...options,
  };

  if (isNgrokUrl(baseUrl)) {
    config.headers['ngrok-skip-browser-warning'] = 'true';
  }

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
    throw new Error(`Expected JSON but received ${contentType || 'unknown content-type'} from ${url}. Response starts with: ${preview}`);
  }

  return response.json();
};

// Auth API
export const authApi = {
  login: (email, password) => 
    apiFetch('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    }),
  
  loginWithPhone: (phone, password) =>
    apiFetch('/api/auth/login', {
      method: 'POST',
      body: { phone, password },
    }),
  
  register: (email, password, confirmPassword, name, phone, address) => 
    apiFetch('/api/auth/register', {
      method: 'POST',
      body: { email, password, confirmPassword, name, phone, address },
    }),
  
  changePassword: (email, phone, currentPassword, newPassword, confirmPassword) =>
    apiFetch('/api/auth/change-password', {
      method: 'POST',
      body: { email, phone, currentPassword, newPassword, confirmPassword },
    }),

  requestPasswordReset: (email, phone, reason) =>
    apiFetch('/api/auth/request-password-reset', {
      method: 'POST',
      body: { email, phone, reason },
    }),
  requestEmailVerification: (email) =>
    apiFetch('/api/auth/email/verification/request', {
      method: 'POST',
      body: { email },
    }),
  requestMyEmailVerification: () =>
    apiFetch('/api/auth/email/verification/request-self', {
      method: 'POST',
    }),
  requestPhoneVerification: (phone) =>
    apiFetch('/api/auth/phone/verification/request', {
      method: 'POST',
      body: { phone },
    }),
  requestMyPhoneVerification: () =>
    apiFetch('/api/auth/phone/verification/request-self', {
      method: 'POST',
    }),
  confirmEmailVerification: (email, token, options = {}) =>
    apiFetch('/api/auth/email/verification/confirm', {
      method: 'POST',
      body: options?.tokenHash
        ? { email, token_hash: options.tokenHash }
        : { email, token },
    }),
  confirmPhoneVerification: (phone, code) =>
    apiFetch('/api/auth/phone/verification/confirm', {
      method: 'POST',
      body: { phone, code },
    }),
  getEmailVerificationStatus: () => apiFetch('/api/auth/email/verification/status'),
  getPhoneVerificationStatus: () => apiFetch('/api/auth/phone/verification/status'),
  getMyContactVerificationRequestStatus: () => apiFetch('/api/auth/contact-verification/status'),
  getSession: () => apiFetch('/api/auth/session'),
  getSessionFromToken: (token) =>
    apiFetch('/api/auth/session', {
      headers: {
        Authorization: `Bearer ${String(token || '').trim()}`,
      },
    }),
  getResetMode: () => apiFetch('/api/auth/reset-mode'),
  completeRecoveryPasswordReset: (payload) =>
    apiFetch('/api/auth/password/recovery/complete', {
      method: 'POST',
      body: payload,
    }),
  verifyResetOtp: (payload) =>
    apiFetch('/api/auth/reset-password/otp/verify', {
      method: 'POST',
      body: payload,
    }),
  completeResetWithOtp: (payload) =>
    apiFetch('/api/auth/reset-password/otp/complete', {
      method: 'POST',
      body: payload,
    }),
};

export const analyticsApi = {
  startSession: (payload) =>
    apiFetch('/api/analytics/session/start', {
      method: 'POST',
      body: payload,
    }),
  heartbeat: (payload) =>
    apiFetch('/api/analytics/session/heartbeat', {
      method: 'POST',
      body: payload,
    }),
};

// Products API
export const productsApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/api/products${query ? `?${query}` : ''}`);
  },
  getById: (id) => apiFetch(`/api/products/${id}`),
  getLastPurchase: (id) => apiFetch(`/api/products/${id}/last-purchase`),
  getByCategory: (category) => apiFetch(`/api/products/category/${category}`),
  create: (product) => 
    apiFetch('/api/products', {
      method: 'POST',
      body: product,
    }),
  update: (id, product) => 
    apiFetch(`/api/products/${id}`, {
      method: 'PUT',
      body: product,
    }),
  delete: (id) => 
    apiFetch(`/api/products/${id}`, {
      method: 'DELETE',
    }),
  deletePermanent: (id) =>
    apiFetch(`/api/products/${id}/permanent`, {
      method: 'DELETE',
    }),
  getTemplateUrl: (format = 'csv') => {
    const query = new URLSearchParams({ format }).toString();
    const baseUrl = getApiUrl();
    return `${baseUrl}/api/products/template?${query}`;
  },
  getExportUrl: (format = 'csv', includeInactive = false) => {
    const query = new URLSearchParams({
      format,
      include_inactive: includeInactive ? 'true' : 'false',
    }).toString();
    const baseUrl = getApiUrl();
    return `${baseUrl}/api/products/export?${query}`;
  },
  importPreview: (payload) =>
    apiFetch('/api/products/import/preview', {
      method: 'POST',
      body: payload,
    }),
  importConfirm: (payload) =>
    apiFetch('/api/products/import/confirm', {
      method: 'POST',
      body: payload,
    }),
};

// ============================================
// CUSTOMERS API (Profile & Validation)
// ============================================

export const customersApi = {
  // Get customer profile for order
  getProfile: (customerId) => 
    apiFetch(`/api/customers/${customerId}/profile`),
  
  // Search customers (for admin)
  search: (query, limit = 20) => 
    apiFetch(`/api/customers/search?q=${encodeURIComponent(query)}&limit=${limit}`),
  
  // Get all customers (for admin dropdown)
  getAll: () => apiFetch('/api/customers'),
  
  // Validate customer before order
  validateForOrder: (userId) =>
    apiFetch('/api/orders/validate-customer', {
      method: 'POST',
      body: { user_id: userId },
    }),
};

// ============================================
// ORDERS API - Complete Order Processing
// ============================================

export const ordersApi = {
  // Get all orders (admin)
  getAll: () => apiFetch('/api/orders'),
  
  // Get order by ID
  getById: (id) => apiFetch(`/api/orders/${id}`),
  
  // Get order by order number
  getByOrderNumber: (orderNumber) => apiFetch(`/api/orders/number/${orderNumber}`),
  
  // Get orders by user
  getByUser: (userId) => apiFetch(`/api/users/${userId}/orders`),
  
  // Create order (legacy)
  create: (orderData) => 
    apiFetch('/api/orders', {
      method: 'POST',
      body: orderData,
    }),
  
  // Create validated order (new - with customer validation)
  createValidated: (orderData) => 
    apiFetch('/api/orders/create-validated', {
      method: 'POST',
      body: orderData,
    }),
  
  // Verify inventory availability
  verifyInventory: (items) => 
    apiFetch('/api/orders/verify-inventory', {
      method: 'POST',
      body: { items },
    }),
  
  // Verify shipping address
  verifyAddress: (address) => 
    apiFetch('/api/orders/verify-address', {
      method: 'POST',
      body: { address },
    }),
  
  // Get shipping options
  getShippingOptions: (weight, destination) => 
    apiFetch('/api/orders/shipping-options', {
      method: 'POST',
      body: { weight, destination },
    }),
  
  // Update order status
  updateStatus: (id, status, description, createdBy) => 
    apiFetch(`/api/orders/${id}/status`, {
      method: 'PUT',
      body: { status, description, created_by: createdBy },
    }),

  // Get order history (status changes and events)
  getHistory: (id) => apiFetch(`/api/orders/${id}/history`),

  // Cancel order
  cancel: (id, reason, userId) => 
    apiFetch(`/api/orders/${id}/cancel`, {
      method: 'POST',
      body: { reason, user_id: userId },
    }),
  
  // Modify order
  modify: (id, data) => 
    apiFetch(`/api/orders/${id}/modify`, {
      method: 'PUT',
      body: data,
    }),
  
  // Generate shipping label
  generateLabel: (id, carrier, serviceType, weight) => 
    apiFetch(`/api/orders/${id}/generate-label`, {
      method: 'POST',
      body: { carrier, service_type: serviceType, weight },
    }),
  
  // Get order notifications
  getNotifications: (orderId) => 
    apiFetch(`/api/orders/${orderId}/notifications`),
  
  // Resend notification
  resendNotification: (notificationId) => 
    apiFetch(`/api/notifications/${notificationId}/resend`, {
      method: 'POST',
    }),
};

// ============================================
// CART API
// ============================================

export const cartApi = {
  get: (sessionId) => apiFetch(`/api/cart/${sessionId}`),
  add: (sessionId, productId, quantity) => 
    apiFetch('/api/cart', {
      method: 'POST',
      body: { session_id: sessionId, product_id: productId, quantity },
    }),
  update: (id, quantity) => 
    apiFetch(`/api/cart/${id}`, {
      method: 'PUT',
      body: { quantity },
    }),
  remove: (id) => 
    apiFetch(`/api/cart/${id}`, {
      method: 'DELETE',
    }),
  clear: (sessionId) => 
    apiFetch(`/api/cart/${sessionId}/clear`, {
      method: 'DELETE',
    }),
};

// ============================================
// USERS API
// ============================================

export const usersApi = {
  getAll: () => apiFetch('/api/users'),
  getById: (id) => apiFetch(`/api/users/${id}`),
  update: (id, user) => 
    apiFetch(`/api/users/${id}`, {
      method: 'PUT',
      body: user,
    }),
  delete: (id) => 
    apiFetch(`/api/users/${id}`, {
      method: 'DELETE',
    }),
  create: (userData) =>
    apiFetch('/api/users', {
      method: 'POST',
      body: userData,
    }),
  uploadProfileImage: (id, imageBase64) =>
    apiFetch(`/api/users/${id}/profile-image`, {
      method: 'POST',
      body: { image_base64: imageBase64 },
    }),
};

// ============================================
// CREDIT HISTORY API
// ============================================

const CREDIT_LEDGER_DISABLED_KEY = 'credit_ledger_api_disabled';

export const creditApi = {
  getHistory: (userId) => apiFetch(`/api/users/${userId}/credit-history`),
  getBalance: (userId) => apiFetch(`/api/users/${userId}/credit-balance`),
  getLedger: (userId) => {
    if (localStorage.getItem(CREDIT_LEDGER_DISABLED_KEY) === '1') {
      throw new Error('Credit ledger endpoint not available');
    }
    const query = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
    return apiFetch(`/api/credit/ledger${query}`).catch((error) => {
      const message = String(error?.message || '').toLowerCase();
      if (message.includes('not found') || message.includes('cannot get')) {
        localStorage.setItem(CREDIT_LEDGER_DISABLED_KEY, '1');
        throw new Error('Credit ledger endpoint not available');
      }
      throw error;
    });
  },
  addTransaction: (userId, data) =>
    apiFetch(`/api/users/${userId}/credit`, {
      method: 'POST',
      body: data,
    }),
  updateTransaction: (userId, entryId, data) =>
    apiFetch(`/api/users/${userId}/credit/${entryId}`, {
      method: 'PUT',
      body: data,
    }),
  checkLimit: (customerId, amount) =>
    apiFetch('/api/credit/check-limit', {
      method: 'POST',
      body: { customer_id: customerId, additional_amount: amount },
    }),
  getAgingReport: () => apiFetch('/api/credit/aging'),
};

// ============================================
// CATEGORIES API
// ============================================

export const categoriesApi = {
  getAll: () => apiFetch('/api/categories'),
  getById: (id) => apiFetch(`/api/categories/${id}`),
  create: (category) => 
    apiFetch('/api/categories', {
      method: 'POST',
      body: category,
    }),
  update: (id, category) => 
    apiFetch(`/api/categories/${id}`, {
      method: 'PUT',
      body: category,
    }),
  delete: (id) => 
    apiFetch(`/api/categories/${id}`, {
      method: 'DELETE',
    }),
};

// ============================================
// STATS API
// ============================================

export const statsApi = {
  orders: () => apiFetch('/api/stats/orders'),
  products: () => apiFetch('/api/stats/products'),
};

export const offersApi = {
  getAll: () => apiFetch('/api/offers'),
  create: (offer) =>
    apiFetch('/api/offers', {
      method: 'POST',
      body: offer,
    }),
  update: (id, offer) =>
    apiFetch(`/api/offers/${id}`, {
      method: 'PUT',
      body: offer,
    }),
  delete: (id) =>
    apiFetch(`/api/offers/${id}`, {
      method: 'DELETE',
    }),
};

export const adminApi = {
  getAnalyticsSummary: () => apiFetch('/api/admin/analytics/summary'),
  getPasswordResetRequests: () => apiFetch('/api/admin/password-reset-requests'),
  getContactVerificationRequests: (status = 'open') =>
    apiFetch(`/api/admin/contact-verification-requests${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  approveAndSendContactVerificationRequest: (id) =>
    apiFetch(`/api/admin/contact-verification-requests/${id}/approve-send`, {
      method: 'POST',
    }),
  rejectContactVerificationRequest: (id, payload = {}) =>
    apiFetch(`/api/admin/contact-verification-requests/${id}/reject`, {
      method: 'POST',
      body: payload,
    }),
  updatePasswordResetRequest: (id, payload) =>
    apiFetch(`/api/admin/password-reset-requests/${id}`, {
      method: 'PUT',
      body: payload,
    }),
  prepareEmailNotification: (payload) =>
    apiFetch('/api/admin/notifications/email/prepare', {
      method: 'POST',
      body: payload,
    }),
  prepareWhatsAppNotification: (payload) =>
    apiFetch('/api/admin/notifications/whatsapp/prepare', {
      method: 'POST',
      body: payload,
    }),
  markNotificationSent: (id) =>
    apiFetch(`/api/admin/notifications/${id}/mark-sent`, {
      method: 'POST',
    }),
  markUserEmailVerified: (id) =>
    apiFetch(`/api/admin/users/${id}/email/verify`, {
      method: 'POST',
    }),
  markUserPhoneVerified: (id) =>
    apiFetch(`/api/admin/users/${id}/phone/verify`, {
      method: 'POST',
    }),
  createBackup: () =>
    apiFetch('/api/admin/backup/create', {
      method: 'POST',
    }),
  listBackups: () => apiFetch('/api/admin/backup/list'),
  restoreBackup: (fileName) =>
    apiFetch('/api/admin/backup/restore', {
      method: 'POST',
      body: { file_name: fileName },
    }),
};

// ============================================
// BILLING API - Bill Generation System
// ============================================

export const billingApi = {
  // Create a new bill
  createBill: (billData) =>
    apiFetch('/api/bills/create', {
      method: 'POST',
      body: billData,
    }),
  
  // Get all bills
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/api/bills${query ? '?' + query : ''}`);
  },
  
  // Get bill by ID or number
  getById: (identifier) => apiFetch(`/api/bills/${identifier}`),
  
  // Update bill payment
  updatePayment: (id, paymentData) =>
    apiFetch(`/api/bills/${id}/payment`, {
      method: 'PUT',
      body: paymentData,
    }),
  
  // Search customers for billing
  searchCustomers: (query) =>
    apiFetch(`/api/billing/customers/search?q=${encodeURIComponent(query)}`),
  
  // Search products for billing
  searchProducts: (query, category) => {
    const params = new URLSearchParams();
    if (query) params.append('q', query);
    if (category) params.append('category', category);
    return apiFetch(`/api/billing/products/search?${params.toString()}`);
  },
  
  // Get billing statistics
  getStats: () => apiFetch('/api/bills/stats/summary'),
  
  // Verify stock before checkout
  verifyStock: (items) =>
    apiFetch('/api/stock/verify', {
      method: 'POST',
      body: { items },
    }),
};

// ============================================
// DISTRIBUTORS API
// ============================================

export const distributorsApi = {
  getAll: () => apiFetch('/api/distributors'),
  getById: (id) => apiFetch(`/api/distributors/${id}`),
  create: (distributor) =>
    apiFetch('/api/distributors', {
      method: 'POST',
      body: distributor,
    }),
  update: (id, distributor) =>
    apiFetch(`/api/distributors/${id}`, {
      method: 'PUT',
      body: distributor,
    }),
  delete: (id) =>
    apiFetch(`/api/distributors/${id}`, {
      method: 'DELETE',
    }),
};

// ============================================
// DISTRIBUTOR LEDGER API (Credit/Payment)
// ============================================

const isNotFoundError = (err) => String(err?.message || '').toLowerCase().includes('not found');
const DISTRIBUTOR_LEDGER_DISABLED_KEY = 'distributor_ledger_api_disabled';
const readDistributorLedgerDisabled = () => {
  try {
    return sessionStorage.getItem(DISTRIBUTOR_LEDGER_DISABLED_KEY) === '1';
  } catch (e) {
    return false;
  }
};
const writeDistributorLedgerDisabled = (value) => {
  try {
    if (value) {
      sessionStorage.setItem(DISTRIBUTOR_LEDGER_DISABLED_KEY, '1');
    } else {
      sessionStorage.removeItem(DISTRIBUTOR_LEDGER_DISABLED_KEY);
    }
  } catch (e) {
    // ignore storage issues
  }
};

const distributorLedgerState = {
  disabled: readDistributorLedgerDisabled(),
  getAllEndpoint: null,
  byDistributorEndpoint: null,
  addEndpoint: null,
};

export const distributorLedgerApi = {
  getAll: async (params = {}) => {
    if (distributorLedgerState.disabled) return [];
    const query = new URLSearchParams(params).toString();
    const requests = [
      { endpoint: `/api/distributor-ledger${query ? `?${query}` : ''}` },
      { endpoint: `/api/distributors/ledger${query ? `?${query}` : ''}` }
    ];

    if (distributorLedgerState.getAllEndpoint) {
      const endpoint = `${distributorLedgerState.getAllEndpoint}${query ? `?${query}` : ''}`;
      return apiFetch(endpoint);
    }

    let lastError;
    for (const request of requests) {
      try {
        const result = await apiFetch(request.endpoint);
        writeDistributorLedgerDisabled(false);
        distributorLedgerState.getAllEndpoint = request.endpoint.split('?')[0];
        return result;
      } catch (err) {
        lastError = err;
        if (!isNotFoundError(err)) throw err;
      }
    }

    distributorLedgerState.disabled = true;
    writeDistributorLedgerDisabled(true);
    return [];
  },
  getByDistributor: async (distributorId, params = {}) => {
    if (distributorLedgerState.disabled) return [];
    const query = new URLSearchParams(params).toString();
    const requests = [
      { endpoint: `/api/distributors/${distributorId}/ledger${query ? `?${query}` : ''}` },
      { endpoint: `/api/distributors/${distributorId}/credit-history${query ? `?${query}` : ''}` }
    ];

    if (distributorLedgerState.byDistributorEndpoint) {
      const endpoint = `${distributorLedgerState.byDistributorEndpoint(distributorId)}${query ? `?${query}` : ''}`;
      return apiFetch(endpoint);
    }

    for (const request of requests) {
      try {
        const result = await apiFetch(request.endpoint);
        writeDistributorLedgerDisabled(false);
        if (request.endpoint.includes('/ledger')) {
          distributorLedgerState.byDistributorEndpoint = (id) => `/api/distributors/${id}/ledger`;
        } else {
          distributorLedgerState.byDistributorEndpoint = (id) => `/api/distributors/${id}/credit-history`;
        }
        return result;
      } catch (err) {
        if (!isNotFoundError(err)) throw err;
      }
    }

    distributorLedgerState.disabled = true;
    writeDistributorLedgerDisabled(true);
    return [];
  },
  addTransaction: async (distributorId, data) => {
      if (distributorLedgerState.disabled) {
        throw new Error('Distributor ledger API is not available on backend');
      }

      const normalizedAmount = Number(data?.amount || 0);
      const typeRaw = String(data?.type || data?.transaction_type || '').toLowerCase();
      const normalizedType = typeRaw === 'credit' ? 'given' : (typeRaw || 'given');

      const payloadA = { ...data, amount: normalizedAmount, type: normalizedType, transaction_type: normalizedType };
      const payloadB = { ...payloadA, transactionDate: data?.transactionDate || data?.transaction_date };
      const payloadC = { ...payloadA, transaction_date: data?.transaction_date || data?.transactionDate };
      const payloadD = {
        distributor_id: distributorId,
        user_id: distributorId,
        ...payloadC
      };

      const requests = [
        {
          endpoint: `/api/distributors/${distributorId}/ledger`,
          options: { method: 'POST', body: payloadA }
        },
        {
          endpoint: `/api/distributors/${distributorId}/transactions`,
          options: { method: 'POST', body: payloadA }
        },
        {
          endpoint: `/api/distributors/${distributorId}/credit`,
          options: { method: 'POST', body: payloadB }
        },
        {
          endpoint: '/api/distributor-ledger',
          options: { method: 'POST', body: payloadD }
        },
        {
          endpoint: '/api/distributors/ledger',
          options: { method: 'POST', body: payloadD }
        }
      ];

      if (distributorLedgerState.addEndpoint) {
        const cachedEndpoint = distributorLedgerState.addEndpoint(distributorId);
        return apiFetch(cachedEndpoint, {
          method: 'POST',
          body: cachedEndpoint.includes('/distributor-ledger') || cachedEndpoint.includes('/distributors/ledger')
            ? payloadD
            : payloadA
        });
      }

      let lastError;
      for (const request of requests) {
        try {
          const result = await apiFetch(request.endpoint, request.options);
          writeDistributorLedgerDisabled(false);
          if (request.endpoint.includes('/api/distributor-ledger')) {
            distributorLedgerState.addEndpoint = () => '/api/distributor-ledger';
          } else if (request.endpoint.includes('/api/distributors/ledger')) {
            distributorLedgerState.addEndpoint = () => '/api/distributors/ledger';
          } else if (request.endpoint.includes('/transactions')) {
            distributorLedgerState.addEndpoint = (id) => `/api/distributors/${id}/transactions`;
          } else if (request.endpoint.includes('/credit')) {
            distributorLedgerState.addEndpoint = (id) => `/api/distributors/${id}/credit`;
          } else {
            distributorLedgerState.addEndpoint = (id) => `/api/distributors/${id}/ledger`;
          }
          return result;
        } catch (err) {
          lastError = err;
          if (!isNotFoundError(err)) throw err;
        }
      }

      distributorLedgerState.disabled = true;
      writeDistributorLedgerDisabled(true);
      throw lastError || new Error('Distributor ledger API is not available on backend');
  },
};

// ============================================
// PURCHASE ORDERS API
// ============================================

export const purchaseOrdersApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/api/purchase-orders${query ? '?' + query : ''}`);
  },
  getById: (id) => apiFetch(`/api/purchase-orders/${id}`),
  create: (orderData) =>
    apiFetch('/api/purchase-orders', {
      method: 'POST',
      body: orderData,
    }),
  update: (id, orderData) =>
    apiFetch(`/api/purchase-orders/${id}`, {
      method: 'PUT',
      body: orderData,
    }),
  updateStatus: (id, status, extra = {}) =>
    apiFetch(`/api/purchase-orders/${id}/status`, {
      method: 'PUT',
      body: { status, ...extra },
    }),
  delete: (id) =>
    apiFetch(`/api/purchase-orders/${id}`, {
      method: 'DELETE',
    }),
  receive: (id, receiveData) =>
    apiFetch(`/api/purchase-orders/${id}/receive`, {
      method: 'POST',
      body: receiveData,
    }),
};

// ============================================
// PURCHASE RETURNS API
// ============================================

export const purchaseReturnsApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/api/purchase-returns${query ? '?' + query : ''}`);
  },
  getById: (id) => apiFetch(`/api/purchase-returns/${id}`),
  create: (returnData) =>
    apiFetch('/api/purchase-returns', {
      method: 'POST',
      body: returnData,
    }),
  update: (id, returnData) =>
    apiFetch(`/api/purchase-returns/${id}`, {
      method: 'PUT',
      body: returnData,
    }),
  delete: (id) =>
    apiFetch(`/api/purchase-returns/${id}`, {
      method: 'DELETE',
    }),
};

// ============================================
// STOCK LEDGER API
// ============================================

export const stockLedgerApi = {
  getByProduct: (productId) => apiFetch(`/api/stock-ledger/product/${productId}`),
  getByBatch: (batchNumber) => apiFetch(`/api/stock-ledger/batch/${batchNumber}`),
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/api/stock-ledger${query ? '?' + query : ''}`);
  },
  getSummary: () => apiFetch('/api/stock-ledger/summary'),
};

// ============================================
// PRODUCT VERSIONS API
// ============================================

export const productVersionsApi = {
  getByInternalId: (internalId) => apiFetch(`/api/product-versions/${internalId}`),
  getBySku: (sku) => apiFetch(`/api/product-versions/sku/${encodeURIComponent(sku)}`),
};

// ============================================
// UOM CONVERSIONS API
// ============================================

export const uomConversionsApi = {
  getByProduct: (productId) => apiFetch(`/api/uom-conversions/${productId}`),
  create: (conversionData) =>
    apiFetch('/api/uom-conversions', {
      method: 'POST',
      body: conversionData,
    }),
  delete: (id) =>
    apiFetch(`/api/uom-conversions/${id}`, {
      method: 'DELETE',
    }),
};

// ============================================
// BATCH STOCK API
// ============================================

export const batchStockApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/api/batch-stock${query ? '?' + query : ''}`);
  },
  create: (batchData) =>
    apiFetch('/api/batch-stock', {
      method: 'POST',
      body: batchData,
    }),
};
