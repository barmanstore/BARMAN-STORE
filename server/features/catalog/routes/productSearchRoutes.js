const {
  registerProductSearchImageRoutes,
  registerProductSuggestRoutes,
  registerProductListRoutes,
  registerRecentlyBoughtRoutes,
  registerProductLastPurchaseRoutes,
  registerProductDetailRoutes,
  registerProductCategoryRoutes,
} = require('./productSearch');

const registerProductSearchRoutes = (deps) => {
  registerProductSearchImageRoutes(deps);
  registerProductSuggestRoutes(deps);
  registerProductListRoutes(deps);
  registerRecentlyBoughtRoutes(deps);
  registerProductLastPurchaseRoutes(deps);
  registerProductDetailRoutes(deps);
  registerProductCategoryRoutes(deps);
};

module.exports = { registerProductSearchRoutes };
