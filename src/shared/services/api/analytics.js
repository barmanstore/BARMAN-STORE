import { apiFetch } from './core';

export const analyticsApi = {
  startSession: (payload) =>
    apiFetch('/api/analytics/session/start', {
      method: 'POST',
      body: payload,
    }),
  heartbeat: (payload) =>
    apiFetch('/api/analytics/session/heartbeat', {
      method: 'POST',
      body: payload,
    }),
};
