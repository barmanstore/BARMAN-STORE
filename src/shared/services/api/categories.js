import { apiFetch } from './core';

// ============================================
// CATEGORIES API
// ============================================

export const categoriesApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/api/categories${query ? `?${query}` : ''}`);
  },
  getTree: () => apiFetch('/api/categories/tree'),
  getById: (id) => apiFetch(`/api/categories/${id}`),
  getProducts: (id, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/api/categories/${id}/products${query ? `?${query}` : ''}`);
  },
  create: (data) =>
    apiFetch('/api/categories', {
      method: 'POST',
      body: data,
    }),
  update: (id, data) =>
    apiFetch(`/api/categories/${id}`, {
      method: 'PUT',
      body: data,
    }),
  move: (id, data) =>
    apiFetch(`/api/categories/${id}/move`, {
      method: 'POST',
      body: data,
    }),
  delete: (id) =>
    apiFetch(`/api/categories/${id}`, {
      method: 'DELETE',
    }),
  updateProductCategory: (productId, data) =>
    apiFetch(`/api/products/${productId}/category`, {
      method: 'PATCH',
      body: data,
    }),
};
