const {
  registerCategoryListRoutes,
  registerCategoryDetailRoutes,
  registerCategoryProductsRoutes,
  registerCategoryCreateRoutes,
  registerCategoryUpdateRoutes,
  registerCategoryMoveRoutes,
  registerCategoryDeleteRoutes,
} = require('./category');

const registerCategoryRoutes = (deps) => {
  registerCategoryListRoutes(deps);
  registerCategoryDetailRoutes(deps);
  registerCategoryProductsRoutes(deps);
  registerCategoryCreateRoutes(deps);
  registerCategoryUpdateRoutes(deps);
  registerCategoryMoveRoutes(deps);
  registerCategoryDeleteRoutes(deps);
};

module.exports = { registerCategoryRoutes };
