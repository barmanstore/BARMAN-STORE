const { registerProductCreateRoutes } = require('./createRoutes');
const { registerProductUpdateRoutes } = require('./updateRoutes');
const { registerProductCategoryReassignRoutes } = require('./categoryRoutes');
const { registerProductDeleteRoutes } = require('./deleteRoutes');
const { registerProductBulkJobRoutes } = require('./bulkJobRoutes');

module.exports = {
  registerProductCreateRoutes,
  registerProductUpdateRoutes,
  registerProductCategoryReassignRoutes,
  registerProductDeleteRoutes,
  registerProductBulkJobRoutes,
};
