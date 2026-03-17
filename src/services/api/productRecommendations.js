import { apiFetch } from './core';

export const productRecommendationsApi = {
  create: (payload) =>
    apiFetch('/api/product-recommendations', {
      method: 'POST',
      body: payload,
    }),
  getMine: () => apiFetch('/api/product-recommendations/mine'),
};
