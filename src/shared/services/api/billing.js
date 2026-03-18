import { apiFetch, withClientRequestId } from './core';

// ============================================
// BILLING API - Bill Generation System
// ============================================

export const billingApi = {
  // Create a new bill
  createBill: (billData) =>
    apiFetch('/api/bills/create', {
      method: 'POST',
      body: withClientRequestId(billData, 'bill'),
    }),

  // Get all bills
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/api/bills${query ? `?${query}` : ''}`);
  },
  getByUser: (userId) => apiFetch(`/api/users/${userId}/bills`),
  getByUserBill: (userId, identifier) => apiFetch(`/api/users/${userId}/bills/${identifier}`),

  // Get bill by ID or number
  getById: (identifier) => apiFetch(`/api/bills/${identifier}`),

  // Delete bill
  delete: (id) =>
    apiFetch(`/api/bills/${id}`, {
      method: 'DELETE',
    }),

  // Update bill payment
  updatePayment: (id, paymentData) =>
    apiFetch(`/api/bills/${id}/payment`, {
      method: 'PUT',
      body: paymentData,
    }),

  // Search customers for billing
  searchCustomers: (query, options = {}) =>
    apiFetch(`/api/billing/customers/search?q=${encodeURIComponent(query)}`, options),

  // Search products for billing
  searchProducts: (query, category, options = {}) => {
    const params = new URLSearchParams();
    if (query) params.append('q', query);
    if (category) params.append('category', category);
    return apiFetch(`/api/billing/products/search?${params.toString()}`, options);
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
