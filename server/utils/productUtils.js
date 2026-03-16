const { generateSku } = require('./skuUtils');
const { createProductNormalization } = require('./product/productNormalization');
const { createProductCatalogDb } = require('./product/productCatalogDb');
const { createProductImportUtils } = require('./product/productImport');
const { createProductExportUtils } = require('./product/productExport');

const createProductHelpers = (deps) => {
  const normalization = createProductNormalization({ generateSku });
  const catalogDb = createProductCatalogDb({ ...deps, ...normalization });
  const importUtils = createProductImportUtils({ ...deps, ...normalization, ...catalogDb });
  const exportUtils = createProductExportUtils();

  return {
    ...importUtils,
    ...normalization,
    ...catalogDb,
    ...exportUtils,
  };
};

module.exports = { createProductHelpers };
