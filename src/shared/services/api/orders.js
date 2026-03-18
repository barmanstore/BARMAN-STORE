import { apiFetch } from './core';

// ============================================
// ORDERS API
// ============================================

export const ordersApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/api/orders${query ? `?${query}` : ''}`);
  },
  getById: (id) => apiFetch(`/api/orders/${id}`),
  getByOrderNumber: (orderNumber) => apiFetch(`/api/orders/number/${orderNumber}`),
  getByUser: (userId) => apiFetch(`/api/users/${userId}/orders`),
  createValidated: (orderData) =>
    apiFetch('/api/orders/create-validated', {
      method: 'POST',
      body: orderData,
    }),
  createValidatedWithStripe: (orderData) =>
    apiFetch('/api/orders/create-validated', {
      method: 'POST',
      body: { ...orderData, payment_method: 'stripe' },
    }),
  verifyInventory: (items) =>
    apiFetch('/api/orders/verify-inventory', {
      method: 'POST',
      body: { items },
    }),
  verifyAddress: (address) =>
    apiFetch('/api/orders/verify-address', {
      method: 'POST',
      body: address,
    }),
  getShippingOptions: (params) =>
    apiFetch('/api/orders/shipping-options', {
      method: 'POST',
      body: params,
    }),
  updateStatus: (id, status) =>
    apiFetch(`/api/orders/${id}/status`, {
      method: 'PUT',
      body: { status },
    }),
  getHistory: (id) => apiFetch(`/api/orders/${id}/history`),
};
