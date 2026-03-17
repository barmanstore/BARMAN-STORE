import { apiFetch, withClientRequestId } from './core';

// ============================================
// NOTIFICATIONS API
// ============================================

export const notificationsApi = {
  getMine: (params = {}) => {
    const urlParams = new URLSearchParams(params);
    return apiFetch(`/api/notifications/me?${urlParams.toString()}`);
  },
  getUnreadCount: () => apiFetch('/api/notifications/me/unread-count'),
  markRead: (id) =>
    apiFetch(`/api/notifications/${id}/read`, {
      method: 'PUT',
    }),
  markAllRead: () =>
    apiFetch('/api/notifications/read-all', {
      method: 'PUT',
    }),
  searchMessageRecipients: (query, limit = 5) =>
    apiFetch(
      `/api/notifications/message-recipients?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(limit)}`
    ),
  sendMessageToAdmin: (payload) =>
    apiFetch('/api/notifications/messages/to-admin', {
      method: 'POST',
      body: payload,
    }),
  sendMessageToCustomers: (recipient_user_ids, message, client_request_id) =>
    apiFetch('/api/notifications/messages/to-customers', {
      method: 'POST',
      body: withClientRequestId({ recipient_user_ids, message, client_request_id }, 'notif'),
    }),
};
