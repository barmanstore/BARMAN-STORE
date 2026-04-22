const { registerProductSearchImageRoutes } = require('./imageSearchRoutes');
const { registerProductSuggestRoutes } = require('./suggestRoutes');
const { registerProductListRoutes } = require('./listRoutes');
const { registerRecentlyBoughtRoutes } = require('./recentlyBoughtRoutes');
const { registerProductLastPurchaseRoutes } = require('./lastPurchaseRoutes');
const { registerProductDetailRoutes } = require('./detailRoutes');
const { registerProductCategoryRoutes } = require('./categoryRoutes');

module.exports = {
  registerProductSearchImageRoutes,
  registerProductSuggestRoutes,
  registerProductListRoutes,
  registerRecentlyBoughtRoutes,
  registerProductLastPurchaseRoutes,
  registerProductDetailRoutes,
  registerProductCategoryRoutes,
};
