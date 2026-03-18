import { apiFetch } from './core';

// ============================================
// USERS API
// ============================================

export const usersApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/api/users${query ? `?${query}` : ''}`);
  },
  getById: (id) => apiFetch(`/api/users/${id}`),
  update: (id, user) =>
    apiFetch(`/api/users/${id}`, {
      method: 'PUT',
      body: user,
    }),
  delete: (id) =>
    apiFetch(`/api/users/${id}`, {
      method: 'DELETE',
    }),
  create: (user) =>
    apiFetch('/api/users', {
      method: 'POST',
      body: user,
    }),
  updateProfileImage: (id, payload) =>
    apiFetch(`/api/users/${id}/profile-image`, {
      method: 'POST',
      body: payload,
    }),
};
