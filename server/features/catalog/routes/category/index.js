const { registerCategoryListRoutes } = require('./listRoutes');
const { registerCategoryDetailRoutes } = require('./detailRoutes');
const { registerCategoryProductsRoutes } = require('./productsRoutes');
const { registerCategoryCreateRoutes } = require('./createRoutes');
const { registerCategoryUpdateRoutes } = require('./updateRoutes');
const { registerCategoryMoveRoutes } = require('./moveRoutes');
const { registerCategoryDeleteRoutes } = require('./deleteRoutes');

module.exports = {
  registerCategoryListRoutes,
  registerCategoryDetailRoutes,
  registerCategoryProductsRoutes,
  registerCategoryCreateRoutes,
  registerCategoryUpdateRoutes,
  registerCategoryMoveRoutes,
  registerCategoryDeleteRoutes,
};
