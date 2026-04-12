const zlib = require('zlib');
const { registerProductSearchRoutes } = require('./routes/productSearchRoutes');
const { registerProductAdminRoutes } = require('./routes/productAdminRoutes');
const { registerProductImportRoutes } = require('./routes/productImportRoutes');
const { registerCategoryRoutes } = require('./routes/categoryRoutes');
const { createProductListHelpers } = require('./productRoutes/listHelpers');
const { createCategoryRouteHelpers } = require('./productRoutes/categoryHelpers');

const registerProductRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    requireAuth,
    dbAllAsync,
    dbGetAsync,
    dbRunAsync,
    logAdminAuditAsync,
    normalizeProductRecord,
    normalizeProductInput,
    validateProductPayload,
    findProductConflictAsync,
    resolveClientRequestId,
    XLSX,
    toProductExportRow,
    PRODUCT_IMPORT_HEADERS,
    PRODUCT_IMPORT_SAMPLE,
    cleanupExpiredImportBatches,
    parseProductFileToRows,
    findExistingProductForImportAsync,
    normalizeTextKey,
    buildProductExactKey,
    crypto,
    createImportBatchChecksum,
    PRODUCT_IMPORT_BATCH_TTL_MS,
    productImportBatches,
    SQL_UPSERT_IMPORT_BATCH,
    applyProductImportBatch,
    catalogBulkJobs,
  } = deps;

  const listHelpers = createProductListHelpers({ zlib, env: process.env });
  const categoryHelpers = createCategoryRouteHelpers({ dbAllAsync, dbGetAsync, dbRunAsync });

  const routeDeps = {
    app,
    requireAdmin,
    requireAuth,
    dbAllAsync,
    dbGetAsync,
    dbRunAsync,
    logAdminAuditAsync,
    normalizeProductRecord,
    normalizeProductInput,
    validateProductPayload,
    findProductConflictAsync,
    XLSX,
    toProductExportRow,
    PRODUCT_IMPORT_HEADERS,
    PRODUCT_IMPORT_SAMPLE,
    cleanupExpiredImportBatches,
    parseProductFileToRows,
    findExistingProductForImportAsync,
    normalizeTextKey,
    buildProductExactKey,
    crypto,
    createImportBatchChecksum,
    PRODUCT_IMPORT_BATCH_TTL_MS,
    productImportBatches,
    SQL_UPSERT_IMPORT_BATCH,
    applyProductImportBatch,
    resolveClientRequestId,
    catalogBulkJobs,
    zlib,
    ...listHelpers,
    ...categoryHelpers,
  };

  registerProductSearchRoutes(routeDeps);
  registerProductAdminRoutes(routeDeps);
  registerProductImportRoutes(routeDeps);
  registerCategoryRoutes(routeDeps);
};

module.exports = { registerProductRoutes };
