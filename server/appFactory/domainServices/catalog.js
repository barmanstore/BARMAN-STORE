const {
  createCategoryRouteHelpers,
} = require('../../features/catalog/productRoutes/categoryHelpers');
const { createCatalogBulkJobsService } = require('../../features/catalog/bulkJobsService');

const createCatalogServices = ({ core, domainCore } = {}) => {
  const { db, requestUtils, libs, configValues, adminAudit, productHelpers } = core;
  const categoryHelpers = createCategoryRouteHelpers({
    dbAllAsync: db.dbAllAsync,
    dbGetAsync: db.dbGetAsync,
    dbRunAsync: db.dbRunAsync,
  });

  const catalogBulkJobs = createCatalogBulkJobsService({
    dbAllAsync: db.dbAllAsync,
    dbGetAsync: db.dbGetAsync,
    dbRunAsync: db.dbRunAsync,
    dbTxAsync: db.dbTxAsync,
    resolveOrCreateCategoryHierarchyAsync: categoryHelpers.resolveOrCreateCategoryHierarchyAsync,
    logAdminAuditAsync: adminAudit.logAdminAuditAsync,
    resolveClientRequestId: requestUtils.resolveClientRequestId,
    normalizeProductInput: productHelpers.normalizeProductInput,
    validateProductPayload: productHelpers.validateProductPayload,
    findProductConflictAsync: productHelpers.findProductConflictAsync,
    buildProductExactKey: productHelpers.buildProductExactKey,
    normalizeTextKey: productHelpers.normalizeTextKey,
    SQL_INSERT_IGNORE_CATEGORY: core.constants.SQL_INSERT_IGNORE_CATEGORY,
    crypto: libs.crypto,
    IS_VERCEL_RUNTIME: configValues.IS_VERCEL_RUNTIME,
  });

  return {
    categoryHelpers,
    catalogBulkJobs,
  };
};

module.exports = { createCatalogServices };
