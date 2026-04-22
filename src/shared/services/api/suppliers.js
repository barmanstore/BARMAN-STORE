import { apiFetch } from './core';

// ============================================
// SUPPLIERS API
// ============================================

export const suppliersApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/api/suppliers${query ? `?${query}` : ''}`);
  },
  getById: (id) => apiFetch(`/api/suppliers/${id}`),
  getByDistributor: (distributorId) => apiFetch(`/api/distributors/${distributorId}/suppliers`),
  getProducts: (id) => apiFetch(`/api/suppliers/${id}/products`),
  create: (supplier) =>
    apiFetch('/api/suppliers', {
      method: 'POST',
      body: supplier,
    }),
  update: (id, supplier) =>
    apiFetch(`/api/suppliers/${id}`, {
      method: 'PUT',
      body: supplier,
    }),
  delete: (id) =>
    apiFetch(`/api/suppliers/${id}`, {
      method: 'DELETE',
    }),
};
