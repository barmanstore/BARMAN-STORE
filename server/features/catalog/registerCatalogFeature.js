const { registerProductRoutes } = require('./productRoutes');

const registerCatalogFeature = (deps = {}) => {
  registerProductRoutes(deps);
};

module.exports = { registerCatalogFeature };
