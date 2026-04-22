import { apiFetch, withClientRequestId } from './core';

// ============================================
// CREDIT API
// ============================================

export const creditApi = {
  getHistory: (userId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/api/users/${userId}/credit-history${query ? `?${query}` : ''}`);
  },
  getBalance: (userId) => apiFetch(`/api/users/${userId}/credit-balance`),
  getPaymentBadges: (userId) => apiFetch(`/api/users/${userId}/payment-badges`),
  getLedger: (params = {}) => {
    const normalizedParams =
      params && typeof params === 'object' && !Array.isArray(params)
        ? params
        : String(params || '').trim()
          ? { user_id: String(params).trim() }
          : {};
    const query = new URLSearchParams(normalizedParams).toString();
    return apiFetch(`/api/credit/ledger${query ? `?${query}` : ''}`).catch((error) => {
      if (error?.status === 404) return [];
      throw error;
    });
  },
  addTransaction: (userId, data) =>
    apiFetch(`/api/users/${userId}/credit`, {
      method: 'POST',
      body: withClientRequestId(data, 'credit'),
    }),
  updateTransaction: (userId, entryId, data) =>
    apiFetch(`/api/users/${userId}/credit/${entryId}`, {
      method: 'PUT',
      body: data,
    }),
  deleteTransaction: (userId, entryId) =>
    apiFetch(`/api/users/${userId}/credit/${entryId}`, {
      method: 'DELETE',
    }),
  checkLimit: (payload) =>
    apiFetch('/api/credit/check-limit', {
      method: 'POST',
      body: payload,
    }),
  getAgingReport: () => apiFetch('/api/credit/aging'),
  logWhatsAppLaunch: (payload = {}) =>
    apiFetch('/api/credit/whatsapp/launch-log', {
      method: 'POST',
      body: payload,
    }),
  getIssues: (userId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/api/users/${userId}/credit-issues${query ? `?${query}` : ''}`);
  },
  addIssue: (userId, issueData) =>
    apiFetch(`/api/users/${userId}/credit-issues`, {
      method: 'POST',
      body: issueData,
    }),
  respondToIssue: (userId, issueId, payload) =>
    apiFetch(`/api/users/${userId}/credit-issues/${issueId}/respond`, {
      method: 'POST',
      body: payload,
    }),
};

creditApi.listIssues = creditApi.getIssues;
creditApi.reportIssue = creditApi.addIssue;
creditApi.respondIssue = creditApi.respondToIssue;
