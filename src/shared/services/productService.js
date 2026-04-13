import { productsApi } from './api';

const fetchProducts = (params = {}, options = {}) => productsApi.getAll(params, options);

export const productService = {
  fetchProducts,
  list: fetchProducts,
  suggest: (params = {}, options = {}) => productsApi.suggest(params, options),
  recentlyBought: (params = {}) => productsApi.getRecentlyBought(params),
  getById: (id, params = {}) => productsApi.getById(id, params),
};
