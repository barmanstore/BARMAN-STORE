const registerProductImportConfirmRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    applyProductImportBatch,
  } = deps;

  app.post('/api/products/import/confirm', requireAdmin, async (req, res) => {
    try {
      const applied = await applyProductImportBatch({
        batchId: req.body?.batch_id,
        checksum: req.body?.checksum,
        authUser: req.authUser,
        allowIdenticalRows: req.body?.allow_identical_rows,
      });
      return res.json({
        success: true,
        ...applied.result,
        notification: {
          type: 'success',
          title: 'Product import completed',
          message: `Created ${applied.result.created}, updated ${applied.result.updated}, failed ${applied.result.failed}`,
        },
      });
    } catch (error) {
      return res.status(error.status || 400).json({ error: error.message });
    }
  });
};

module.exports = { registerProductImportConfirmRoutes };
