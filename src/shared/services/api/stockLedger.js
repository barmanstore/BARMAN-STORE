import { apiFetch } from './core';

// ============================================
// STOCK LEDGER API
// ============================================

export const stockLedgerApi = {
  getByProduct: (productId) => apiFetch(`/api/stock-ledger/product/${productId}`),
  getByBatch: (batchNumber) => apiFetch(`/api/stock-ledger/batch/${batchNumber}`),
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/api/stock-ledger${query ? `?${query}` : ''}`);
  },
  getSummary: () => apiFetch('/api/stock-ledger/summary'),
  applyAdjustments: (payload) => apiFetch('/api/stock-ledger/adjustments', {
    method: 'POST',
    body: payload,
  }),
};
