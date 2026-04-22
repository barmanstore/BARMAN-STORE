const { createProductImportStore } = require('./import/store');
const { createApplyProductImportBatch } = require('./import/applyBatch');
const { createProductFileParser } = require('./import/parser');

const createProductImportUtils = ({
  dbGetAsync,
  dbRunAsync,
  dbTxAsync,
  XLSX,
  crypto,
  path,
  SQL_INSERT_IGNORE_CATEGORY,
  normalizeProductInput,
  validateProductPayload,
  findProductConflictAsync,
  buildProductExactKey,
  normalizeTextKey,
}) => {
  const store = createProductImportStore({ crypto });
  const { applyProductImportBatch } = createApplyProductImportBatch({
    dbGetAsync,
    dbRunAsync,
    dbTxAsync,
    SQL_INSERT_IGNORE_CATEGORY,
    normalizeProductInput,
    validateProductPayload,
    findProductConflictAsync,
    buildProductExactKey,
    normalizeTextKey,
    productImportBatches: store.productImportBatches,
    cleanupExpiredImportBatches: store.cleanupExpiredImportBatches,
  });
  const { parseProductFileToRows } = createProductFileParser({ XLSX, path });

  return {
    PRODUCT_IMPORT_BATCH_TTL_MS: store.PRODUCT_IMPORT_BATCH_TTL_MS,
    PRODUCT_IMPORT_HEADERS: store.PRODUCT_IMPORT_HEADERS,
    PRODUCT_IMPORT_SAMPLE: store.PRODUCT_IMPORT_SAMPLE,
    productImportBatches: store.productImportBatches,
    createImportBatchChecksum: store.createImportBatchChecksum,
    cleanupExpiredImportBatches: store.cleanupExpiredImportBatches,
    applyProductImportBatch,
    parseProductFileToRows,
  };
};

module.exports = { createProductImportUtils };
