const {
  registerProductCreateRoutes,
  registerProductUpdateRoutes,
  registerProductCategoryReassignRoutes,
  registerProductDeleteRoutes,
} = require('./productAdmin');

const registerProductAdminRoutes = (deps) => {
  registerProductCreateRoutes(deps);
  registerProductUpdateRoutes(deps);
  registerProductCategoryReassignRoutes(deps);
  registerProductDeleteRoutes(deps);
};

module.exports = { registerProductAdminRoutes };
