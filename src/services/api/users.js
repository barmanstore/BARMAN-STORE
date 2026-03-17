import { apiFetch } from './core';

// ============================================
// USERS API
// ============================================

export const usersApi = {
  getAll: () => apiFetch('/api/users'),
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
