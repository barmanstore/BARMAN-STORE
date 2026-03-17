const resolveImportBatch = ({
  batchId,
  checksum,
  authUser,
  productImportBatches,
  cleanupExpiredImportBatches,
}) => {
  cleanupExpiredImportBatches();
  const normalizedBatchId = String(batchId || '').trim();
  const normalizedChecksum = String(checksum || '').trim();
  if (!normalizedBatchId || !normalizedChecksum) {
    const err = new Error('batch_id and checksum are required');
    err.status = 400;
    throw err;
  }

  const batch = productImportBatches.get(normalizedBatchId);
  if (!batch) {
    const err = new Error('Import batch not found or expired');
    err.status = 404;
    throw err;
  }
  if (batch.checksum !== normalizedChecksum) {
    const err = new Error('Batch checksum mismatch');
    err.status = 409;
    throw err;
  }
  if ((authUser?.id || null) !== (batch.createdBy || null) && authUser?.role !== 'admin') {
    const err = new Error('Not allowed to confirm this batch');
    err.status = 403;
    throw err;
  }

  return {
    normalizedBatchId,
    normalizedChecksum,
    batch,
  };
};

module.exports = { resolveImportBatch };
