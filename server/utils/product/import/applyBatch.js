const createApplyProductImportBatch = (deps) => {
  const {
    dbGetAsync,
    dbRunAsync,
    dbTxAsync,
    SQL_INSERT_IGNORE_CATEGORY,
    normalizeProductInput,
    validateProductPayload,
    findProductConflictAsync,
    buildProductExactKey,
    normalizeTextKey,
    productImportBatches,
    cleanupExpiredImportBatches,
  } = deps;
  const { resolveImportBatch } = require('./applyBatch/resolveBatch');
  const { createBatchTracking } = require('./applyBatch/batchTracking');
  const { processImportRow } = require('./applyBatch/processRow');
  const { applyImportBatchRows } = require('./applyBatch/applyRows');
  const { finalizeImportBatch } = require('./applyBatch/finalizeBatch');

  const applyProductImportBatch = async ({
    batchId,
    checksum,
    authUser,
    allowIdenticalRows = [],
  }) => {
    const { normalizedBatchId, normalizedChecksum, batch } = resolveImportBatch({
      batchId,
      checksum,
      authUser,
      productImportBatches,
      cleanupExpiredImportBatches,
    });

    const result = {
      created: 0,
      updated: 0,
      failed: 0,
      errors: [],
    };
    const { seenInBatch, allowIdenticalSet } = createBatchTracking({ allowIdenticalRows });

    const processRow = (row) =>
      processImportRow({
        row,
        deps: {
          dbGetAsync,
          dbRunAsync,
          SQL_INSERT_IGNORE_CATEGORY,
          normalizeProductInput,
          validateProductPayload,
          findProductConflictAsync,
          buildProductExactKey,
          normalizeTextKey,
        },
        seenInBatch,
        allowIdenticalSet,
      });

    await applyImportBatchRows({
      batch,
      dbTxAsync,
      processRow,
      result,
    });

    const finalized = await finalizeImportBatch({
      normalizedBatchId,
      normalizedChecksum,
      productImportBatches,
      dbRunAsync,
    });

    return {
      ...finalized,
      result,
    };
  };

  return { applyProductImportBatch };
};

module.exports = { createApplyProductImportBatch };
