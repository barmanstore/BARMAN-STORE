import { productsApi } from './api';

export const productService = {
  list: (params = {}, options = {}) => productsApi.getAll(params, options),
  suggest: (params = {}, options = {}) => productsApi.suggest(params, options),
  recentlyBought: (params = {}) => productsApi.getRecentlyBought(params),
  getById: (id, params = {}) => productsApi.getById(id, params),
};
