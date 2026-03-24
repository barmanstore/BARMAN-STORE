import { apiFetch } from './core';

// ============================================
// OFFERS API
// ============================================

export const offersApi = {
  getAll: () => apiFetch('/api/offers'),
  previewPricing: (payload, options = {}) =>
    apiFetch('/api/offers/preview', {
      method: 'POST',
      body: payload,
      ...options,
    }),
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
