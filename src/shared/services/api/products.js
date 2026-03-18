import { apiFetch, getApiUrl } from './core';

// Products API
export const productsApi = {
  getAll: (params = {}, options = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/api/products${query ? `?${query}` : ''}`, options);
  },
  getById: (id, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/api/products/${id}${query ? `?${query}` : ''}`);
  },
  getRecentlyBought: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/api/products/recently-bought${query ? `?${query}` : ''}`);
  },
  suggest: (params = {}, options = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/api/products/suggest${query ? `?${query}` : ''}`, options);
  },
  getLastPurchase: (id) => apiFetch(`/api/products/${id}/last-purchase`),
  getSuppliers: (id) => apiFetch(`/api/products/${id}/suppliers`),
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
