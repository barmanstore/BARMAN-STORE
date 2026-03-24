import { apiFetch } from './core';

// ============================================
// STATS API
// ============================================

export const statsApi = {
  orders: () => apiFetch('/api/stats/orders'),
};
