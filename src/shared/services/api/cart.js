import { apiFetch } from './core';

// ============================================
// CART API
// ============================================

export const cartApi = {
  get: (sessionId) => apiFetch(`/api/cart/${sessionId}`),
  create: (cartData) =>
    apiFetch('/api/cart', {
      method: 'POST',
      body: cartData,
    }),
  update: (id, cartData) =>
    apiFetch(`/api/cart/${id}`, {
      method: 'PUT',
      body: cartData,
    }),
  delete: (id) =>
    apiFetch(`/api/cart/${id}`, {
      method: 'DELETE',
    }),
  clear: (sessionId) =>
    apiFetch(`/api/cart/${sessionId}/clear`, {
      method: 'POST',
    }),
};
