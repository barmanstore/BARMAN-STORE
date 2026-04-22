const registerProductBulkJobRoutes = (deps) => {
  const { app, requireAdmin, resolveClientRequestId, catalogBulkJobs } = deps;

  const resolveJobId = (value) => Number(value || 0);

  app.post('/api/admin/products/bulk-jobs', requireAdmin, async (req, res) => {
    try {
      const operation = String(req.body?.operation || 'bulk_update')
        .trim()
        .toLowerCase();
      const jobResult = await catalogBulkJobs.createBulkJobAsync({
        req,
        operation,
        productIds: req.body?.product_ids || req.body?.productIds || [],
        items: req.body?.items || [],
        payload: req.body?.payload || {},
        createdBy: Number(req.authUser?.id || 0) || null,
      });
      return res.status(jobResult.created ? 201 : 200).json({
        success: true,
        job: jobResult.job,
      });
    } catch (error) {
      return res.status(Number(error?.status || 500) || 500).json({ error: error.message });
    }
  });

  app.get('/api/admin/products/bulk-jobs/:id(\\d+)', requireAdmin, async (req, res) => {
    try {
      const job = await catalogBulkJobs.getBulkJobByIdAsync(resolveJobId(req.params.id));
      if (!job) return res.status(404).json({ error: 'Bulk job not found' });
      return res.json({ job });
    } catch (error) {
      return res.status(Number(error?.status || 500) || 500).json({ error: error.message });
    }
  });

  app.get('/api/admin/products/bulk-jobs/:id(\\d+)/items', requireAdmin, async (req, res) => {
    try {
      const jobId = resolveJobId(req.params.id);
      const result = await catalogBulkJobs.getBulkJobItemsPageAsync(jobId, {
        cursor: req.query?.cursor || '',
        limit: req.query?.limit || 50,
      });
      return res.json(result);
    } catch (error) {
      return res.status(Number(error?.status || 500) || 500).json({ error: error.message });
    }
  });

  app.post('/api/admin/products/bulk-jobs/:id(\\d+)/cancel', requireAdmin, async (req, res) => {
    try {
      const result = await catalogBulkJobs.cancelBulkJobAsync({
        jobId: resolveJobId(req.params.id),
        req,
      });
      return res.json({ success: true, job: result.job });
    } catch (error) {
      return res.status(Number(error?.status || 500) || 500).json({ error: error.message });
    }
  });

  app.post(
    '/api/admin/products/bulk-jobs/:id(\\d+)/retry-failed',
    requireAdmin,
    async (req, res) => {
      try {
        const idempotency = resolveClientRequestId
          ? resolveClientRequestId(req)
          : { value: null, error: null };
        if (idempotency.error) {
          return res.status(400).json({ error: idempotency.error });
        }
        const result = await catalogBulkJobs.retryFailedBulkJobAsync({
          jobId: resolveJobId(req.params.id),
          req,
          clientRequestId: idempotency.value || null,
        });
        return res.status(result.created ? 201 : 200).json({ success: true, job: result.job });
      } catch (error) {
        return res.status(Number(error?.status || 500) || 500).json({ error: error.message });
      }
    }
  );
};

module.exports = { registerProductBulkJobRoutes };
