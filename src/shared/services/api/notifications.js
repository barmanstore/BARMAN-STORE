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
      method: 'POST',
    }),
  markAllRead: () =>
    apiFetch('/api/notifications/read-all', {
      method: 'POST',
    }),
  searchMessageRecipients: (query, limit = 5) =>
    apiFetch(
      `/api/notifications/message-recipients?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(limit)}`
    ),
  sendMessageToAdmin: (payload) => {
    const message = typeof payload === 'string'
      ? payload
      : payload?.message;
    return apiFetch('/api/notifications/messages/to-admin', {
      method: 'POST',
      body: { message },
    });
  },
  sendMessageToCustomers: (recipientUserIdsOrPayload, message, clientRequestId) => {
    const payload = (
      recipientUserIdsOrPayload
      && typeof recipientUserIdsOrPayload === 'object'
      && !Array.isArray(recipientUserIdsOrPayload)
    )
      ? recipientUserIdsOrPayload
      : {
          recipient_user_ids: recipientUserIdsOrPayload,
          message,
          client_request_id: clientRequestId,
        };

    return apiFetch('/api/notifications/messages/to-customers', {
      method: 'POST',
      body: withClientRequestId({
        recipient_user_ids: payload?.recipient_user_ids,
        message: payload?.message,
        client_request_id: payload?.client_request_id,
      }, 'notif'),
    });
  },
};

notificationsApi.listMine = notificationsApi.getMine;
notificationsApi.listMessageRecipients = notificationsApi.searchMessageRecipients;
