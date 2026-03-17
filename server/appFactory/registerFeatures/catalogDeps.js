const buildCatalogDeps = ({ core }) => {
  const { productHelpers, libs, constants } = core;

  return {
    normalizeProductRecord: productHelpers.normalizeProductRecord,
    normalizeProductInput: productHelpers.normalizeProductInput,
    validateProductPayload: productHelpers.validateProductPayload,
    findProductConflictAsync: productHelpers.findProductConflictAsync,
    resolveOrCreateCategoryNameAsync: productHelpers.resolveOrCreateCategoryNameAsync,
    XLSX: libs.XLSX,
    toProductExportRow: productHelpers.toProductExportRow,
    PRODUCT_IMPORT_HEADERS: productHelpers.PRODUCT_IMPORT_HEADERS,
    PRODUCT_IMPORT_SAMPLE: productHelpers.PRODUCT_IMPORT_SAMPLE,
    cleanupExpiredImportBatches: productHelpers.cleanupExpiredImportBatches,
    parseProductFileToRows: productHelpers.parseProductFileToRows,
    findExistingProductForImportAsync: productHelpers.findExistingProductForImportAsync,
    normalizeTextKey: productHelpers.normalizeTextKey,
    buildProductExactKey: productHelpers.buildProductExactKey,
    createImportBatchChecksum: productHelpers.createImportBatchChecksum,
    PRODUCT_IMPORT_BATCH_TTL_MS: productHelpers.PRODUCT_IMPORT_BATCH_TTL_MS,
    productImportBatches: productHelpers.productImportBatches,
    SQL_UPSERT_IMPORT_BATCH: constants.SQL_UPSERT_IMPORT_BATCH,
    applyProductImportBatch: productHelpers.applyProductImportBatch,
  };
};

module.exports = { buildCatalogDeps };
