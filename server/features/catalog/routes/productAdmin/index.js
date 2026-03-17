const { registerProductCreateRoutes } = require('./createRoutes');
const { registerProductUpdateRoutes } = require('./updateRoutes');
const { registerProductCategoryReassignRoutes } = require('./categoryRoutes');
const { registerProductDeleteRoutes } = require('./deleteRoutes');

module.exports = {
  registerProductCreateRoutes,
  registerProductUpdateRoutes,
  registerProductCategoryReassignRoutes,
  registerProductDeleteRoutes,
};
