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
  updateStatus: (id, status, extra = {}) => {
    const normalizedExtra =
      typeof extra === 'string'
        ? { description: extra }
        : extra && typeof extra === 'object'
          ? extra
          : {};
    return apiFetch(`/api/orders/${id}/status`, {
      method: 'PUT',
      body: {
        status,
        ...normalizedExtra,
      },
    });
  },
  getHistory: (id) => apiFetch(`/api/orders/${id}/history`),
};
