const { createOrderAdminQueries } = require('./orderQueries/orderAdminQueries');
const { registerOrderUserQueries } = require('./orderQueries/orderUserQueries');

const registerOrderQueryRoutes = (deps) => {
  const queryHelpers = createOrderAdminQueries(deps);
  const routeDeps = { ...deps, ...queryHelpers };
  registerOrderUserQueries(routeDeps);
};

module.exports = { registerOrderQueryRoutes };
