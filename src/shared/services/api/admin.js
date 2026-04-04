import { apiFetch } from './core';

// ============================================
// ADMIN API
// ============================================

export const adminApi = {
  getAnalyticsSummary: () => apiFetch('/api/admin/analytics/summary'),
  getDailyCashTally: (date) =>
    apiFetch(`/api/admin/analytics/daily-cash-tally?date=${encodeURIComponent(String(date || '').trim())}`),
  upsertDailyCashTally: (payload) =>
    apiFetch('/api/admin/analytics/daily-cash-tally', {
      method: 'PUT',
      body: payload,
    }),
  getPhoneChangeRequests: (status = '') =>
    apiFetch(`/api/admin/phone-change-requests${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  approvePhoneChangeRequest: (id, payload = {}) =>
    apiFetch(`/api/admin/phone-change-requests/${id}/approve`, {
      method: 'POST',
      body: payload,
    }),
  rejectPhoneChangeRequest: (id, payload = {}) =>
    apiFetch(`/api/admin/phone-change-requests/${id}/reject`, {
      method: 'POST',
      body: payload,
    }),
  getContactVerificationRequests: (status = '') =>
    apiFetch(`/api/admin/contact-verification-requests${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  approveContactVerificationRequest: (id, payload = {}) =>
    apiFetch(`/api/admin/contact-verification-requests/${id}/approve-send`, {
      method: 'POST',
      body: payload,
    }),
  rejectContactVerificationRequest: (id, payload = {}) =>
    apiFetch(`/api/admin/contact-verification-requests/${id}/reject`, {
      method: 'POST',
      body: payload,
    }),
  prepareEmailNotifications: (payload) =>
    apiFetch('/api/admin/notifications/email/prepare', {
      method: 'POST',
      body: payload,
    }),
  prepareWhatsappNotifications: (payload) =>
    apiFetch('/api/admin/notifications/whatsapp/prepare', {
      method: 'POST',
      body: payload,
    }),
  markNotificationsSent: (id, payload) =>
    apiFetch(`/api/admin/notifications/${id}/mark-sent`, {
      method: 'POST',
      body: payload,
    }),
  verifyUserEmail: (id, payload) =>
    apiFetch(`/api/admin/users/${id}/email/verify`, {
      method: 'POST',
      body: payload,
    }),
  verifyUserPhone: (id, payload) =>
    apiFetch(`/api/admin/users/${id}/phone/verify`, {
      method: 'POST',
      body: payload,
    }),
  getProductRecommendations: (status = '') =>
    apiFetch(`/api/admin/product-recommendations${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  updateProductRecommendation: (id, payload) =>
    apiFetch(`/api/admin/product-recommendations/${id}`, {
      method: 'PUT',
      body: payload,
    }),
  getCreditIssues: (status = '') =>
    apiFetch(`/api/admin/credit-issues${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  updateCreditIssue: (id, payload) =>
    apiFetch(`/api/admin/credit-issues/${id}`, {
      method: 'PUT',
      body: payload,
    }),
};
