import { categoriesApi } from './api';

export const categoryService = {
  list: (params = {}) => categoriesApi.getAll(params),
  getTree: () => categoriesApi.getTree(),
  getById: (id) => categoriesApi.getById(id),
};
