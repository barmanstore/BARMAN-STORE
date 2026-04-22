import { apiFetch } from './core';

// ============================================
// INSIGHTS API
// ============================================

export const insightsApi = {
  getProducts: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/api/insights/products${query ? `?${query}` : ''}`);
  },
  getProductById: (id, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/api/insights/products/${id}${query ? `?${query}` : ''}`);
  },
  getDistributors: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/api/insights/distributors${query ? `?${query}` : ''}`);
  },
  getDistributorProducts: (id) => apiFetch(`/api/insights/distributors/${id}/products`),
};
