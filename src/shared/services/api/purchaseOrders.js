import { apiFetch, withClientRequestId } from './core';

// ============================================
// PURCHASE ORDERS API
// ============================================

const prepareDistributorWhatsApp = (id, payload = {}) =>
  apiFetch(`/api/purchase-orders/${id}/distributor-whatsapp`, {
    method: 'POST',
    body: payload,
  });

const confirmPurchaseOrder = (id, payload = {}) =>
  apiFetch(`/api/purchase-orders/${id}/status`, {
    method: 'PUT',
    body: { status: 'processed', ...payload },
  });

export const purchaseOrdersApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/api/purchase-orders${query ? `?${query}` : ''}`);
  },
  getOperationsSummary: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/api/purchase-operations/summary${query ? `?${query}` : ''}`);
  },
  closeVisit: (payload = {}) =>
    apiFetch('/api/purchase-operations/visit/close', {
      method: 'POST',
      body: payload,
    }),
  reopenVisit: (payload = {}) =>
    apiFetch('/api/purchase-operations/visit/reopen', {
      method: 'POST',
      body: payload,
    }),
  getById: (id) => apiFetch(`/api/purchase-orders/${id}`),
  create: (orderData) =>
    apiFetch('/api/purchase-orders', {
      method: 'POST',
      body: withClientRequestId(orderData, 'po'),
    }),
  update: (id, orderData) =>
    apiFetch(`/api/purchase-orders/${id}`, {
      method: 'PUT',
      body: orderData,
    }),
  updateStatus: (id, status, extra = {}) =>
    apiFetch(`/api/purchase-orders/${id}/status`, {
      method: 'PUT',
      body: { status, ...extra },
    }),
  confirmPO: confirmPurchaseOrder,
  process: confirmPurchaseOrder,
  prepareDistributorWhatsApp,
  sendDistributorWhatsApp: prepareDistributorWhatsApp,
  addPayment: (id, paymentData = {}) =>
    apiFetch(`/api/purchase-orders/${id}/payments`, {
      method: 'POST',
      body: withClientRequestId(paymentData, 'popay'),
    }),
  delete: (id) =>
    apiFetch(`/api/purchase-orders/${id}`, {
      method: 'DELETE',
    }),
  receive: (id, receiveData) =>
    apiFetch(`/api/purchase-orders/${id}/receive`, {
      method: 'POST',
      body: receiveData,
    }),
};
