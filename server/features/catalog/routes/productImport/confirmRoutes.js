const registerProductImportConfirmRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    cleanupExpiredImportBatches,
    productImportBatches,
    catalogBulkJobs,
    resolveClientRequestId,
    dbRunAsync,
    SQL_UPSERT_IMPORT_BATCH,
    crypto,
    logAdminAuditAsync,
  } = deps;
  const { resolveImportBatch } = require('../../../../utils/product/import/applyBatch/resolveBatch');
  const { queueImportBulkJobFromBatchAsync } = require('./importBulkJobHelpers');

  app.post('/api/products/import/confirm', requireAdmin, async (req, res) => {
    try {
      cleanupExpiredImportBatches();
      const { normalizedBatchId, normalizedChecksum, batch } = resolveImportBatch({
        batchId: req.body?.batch_id,
        checksum: req.body?.checksum,
        authUser: req.authUser,
        productImportBatches,
        cleanupExpiredImportBatches,
      });
      await dbRunAsync(SQL_UPSERT_IMPORT_BATCH, [
        normalizedBatchId,
        'products',
        req.authUser?.id || null,
        JSON.stringify(batch),
        normalizedChecksum,
        'staged',
        batch.expiresAt,
      ]);
      const jobResult = await queueImportBulkJobFromBatchAsync({
        catalogBulkJobs,
        req,
        batchId: normalizedBatchId,
        checksum: normalizedChecksum,
        batch,
        authUser: req.authUser,
        allowIdenticalRows: req.body?.allow_identical_rows || [],
      });
      if (typeof logAdminAuditAsync === 'function') {
        await logAdminAuditAsync(req, {
          action: 'product.import.confirm',
          entityType: 'import_batch',
          entityId: normalizedBatchId,
          requestId: resolveClientRequestId ? resolveClientRequestId(req)?.value || null : null,
          details: {
            job_id: jobResult.job.id,
            rows: Array.isArray(batch?.rows) ? batch.rows.length : 0,
          },
        });
      }
      return res.json({
        success: true,
        job: jobResult.job,
        notification: {
          type: 'success',
          title: 'Product import queued',
          message: `Import job queued with ${Array.isArray(batch?.rows) ? batch.rows.length : 0} rows`,
        },
      });
    } catch (error) {
      return res.status(error.status || 400).json({ error: error.message });
    }
  });
};

module.exports = { registerProductImportConfirmRoutes };
