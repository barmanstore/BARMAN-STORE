import { apiFetch, withClientRequestId } from './core';

export const cashbookApi = {
  getSnapshot: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/api/admin/cashbook${query ? `?${query}` : ''}`);
  },
  updateOpeningBalance: (payload) =>
    apiFetch('/api/admin/cashbook/opening-balance', {
      method: 'PUT',
      body: payload,
    }),
  createEntry: (payload) =>
    apiFetch('/api/admin/cashbook/entries', {
      method: 'POST',
      body: withClientRequestId(payload, 'cashbook'),
    }),
  updateEntry: (entryId, payload) =>
    apiFetch(`/api/admin/cashbook/entries/${entryId}`, {
      method: 'PUT',
      body: payload,
    }),
  deleteEntry: (entryId) =>
    apiFetch(`/api/admin/cashbook/entries/${entryId}`, {
      method: 'DELETE',
    }),
};
