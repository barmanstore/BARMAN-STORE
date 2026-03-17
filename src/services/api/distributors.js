import { apiFetch } from './core';

// ============================================
// DISTRIBUTORS API
// ============================================

export const distributorsApi = {
  getAll: () => apiFetch('/api/distributors'),
  getById: (id) => apiFetch(`/api/distributors/${id}`),
  create: (distributor) =>
    apiFetch('/api/distributors', {
      method: 'POST',
      body: distributor,
    }),
  update: (id, distributor) =>
    apiFetch(`/api/distributors/${id}`, {
      method: 'PUT',
      body: distributor,
    }),
  delete: (id) =>
    apiFetch(`/api/distributors/${id}`, {
      method: 'DELETE',
    }),
};
