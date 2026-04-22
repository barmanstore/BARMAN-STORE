const { registerOrderListRoutes } = require('./routes/orderListRoutes');
const { registerOrderQueryRoutes } = require('./routes/orderQueryRoutes');
const { registerOrderCreateRoutes } = require('./routes/orderCreateRoutes');
const { registerOrderStatusRoutes } = require('./routes/orderStatusRoutes');
const { registerOrderStatsRoutes } = require('./routes/orderStatsRoutes');
const { createOrderPlacement } = require('./orderPlacement');
const { createOrderAccess } = require('./orderAccess');

const registerOrderRoutes = (deps) => {
  const { placeOrder } = createOrderPlacement(deps);
  const { canAccessOrder } = createOrderAccess();
  const routeDeps = { ...deps, placeOrder, canAccessOrder };
  registerOrderListRoutes(routeDeps);
  registerOrderQueryRoutes(routeDeps);
  registerOrderCreateRoutes(routeDeps);
  registerOrderStatusRoutes(routeDeps);
  registerOrderStatsRoutes(routeDeps);
};

module.exports = { registerOrderRoutes };
