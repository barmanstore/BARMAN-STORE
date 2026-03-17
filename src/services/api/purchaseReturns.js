import { apiFetch } from './core';

// ============================================
// PURCHASE RETURNS API
// ============================================

export const purchaseReturnsApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/api/purchase-returns${query ? `?${query}` : ''}`);
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
