const finalizeImportBatch = async ({
  normalizedBatchId,
  normalizedChecksum,
  productImportBatches,
  dbRunAsync,
}) => {
  productImportBatches.delete(normalizedBatchId);
  await dbRunAsync("UPDATE import_batches SET status = 'applied' WHERE batch_id = ?", [
    normalizedBatchId,
  ]);

  return {
    batch_id: normalizedBatchId,
    checksum: normalizedChecksum,
  };
};

module.exports = { finalizeImportBatch };
