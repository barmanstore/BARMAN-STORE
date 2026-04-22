const {
  registerProductCreateRoutes,
  registerProductUpdateRoutes,
  registerProductCategoryReassignRoutes,
  registerProductDeleteRoutes,
  registerProductBulkJobRoutes,
} = require('./productAdmin');

const registerProductAdminRoutes = (deps) => {
  registerProductCreateRoutes(deps);
  registerProductUpdateRoutes(deps);
  registerProductCategoryReassignRoutes(deps);
  registerProductDeleteRoutes(deps);
  registerProductBulkJobRoutes(deps);
};

module.exports = { registerProductAdminRoutes };
