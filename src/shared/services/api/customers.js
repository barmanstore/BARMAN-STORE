import { apiFetch } from './core';

// ============================================
// CUSTOMERS API (Profile & Validation)
// ============================================

export const customersApi = {
  // Get customer profile for order
  getProfile: (customerId) => apiFetch(`/api/customers/${customerId}/profile`),

  // Search customers (for admin)
  search: (query, limit = 20) =>
    apiFetch(`/api/customers/search?q=${encodeURIComponent(query)}&limit=${limit}`),

  // Get all customers (for admin dropdown)
  getAll: () => apiFetch('/api/customers'),

  // Validate customer before order
  validateForOrder: (userId) =>
    apiFetch('/api/orders/validate-customer', {
      method: 'POST',
      body: { userId },
    }),
};
