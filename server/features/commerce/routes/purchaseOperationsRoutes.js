const registerPurchaseOperationsRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    requireCronSecret,
    dbGetAsync,
    dbRunAsync,
    normalizeTransactionDate,
    handlePurchaseOperationsSummary,
  } = deps;

  const respondPurchaseOperationsSummary = (req, res) =>
    handlePurchaseOperationsSummary(req, res);

  const runPurchaseOperationsAnalytics = (req, res) =>
    handlePurchaseOperationsSummary(req, res, { persistSnapshots: true });

  const readSupplierVisitResponse = async ({ supplierId, visitDate }) => {
    const row = await dbGetAsync(
      `SELECT sv.*, s.name AS supplier_name, s.distributor_id, d.name AS distributor_name
       FROM supplier_visits sv
       INNER JOIN suppliers s ON s.id = sv.supplier_id
       LEFT JOIN distributors d ON d.id = s.distributor_id
       WHERE sv.supplier_id = ? AND sv.visit_date = ?`,
      [supplierId, visitDate]
    );
    if (!row) {
      return {
        supplier_id: supplierId,
        date: visitDate,
        visitClosed: false,
      };
    }
    return {
      supplier_id: Number(row.supplier_id || 0),
      distributor_id: Number(row.distributor_id || 0) || null,
      supplier_name: row.supplier_name || null,
      distributor_name: row.distributor_name || null,
      date: normalizeTransactionDate(row.visit_date) || visitDate,
      visitClosed: Boolean(row.visit_closed),
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
    };
  };

  const mutateSupplierVisit = async (req, res, visitClosed) => {
    try {
      const supplierId = Number(req.body?.supplier_id || 0) || null;
      if (!supplierId) {
        return res.status(400).json({ error: 'supplier_id is required' });
      }
      const supplier = await dbGetAsync('SELECT id, distributor_id, name FROM suppliers WHERE id = ?', [supplierId]);
      if (!supplier) {
        return res.status(404).json({ error: 'Supplier not found' });
      }
      const todayKey = normalizeTransactionDate(new Date().toISOString())
        || new Date().toISOString().slice(0, 10);
      const visitDate = normalizeTransactionDate(req.body?.date || todayKey) || todayKey;
      if (visitDate !== todayKey) {
        return res.status(400).json({ error: 'Visit can only be changed for today' });
      }

      await dbRunAsync(
        `INSERT INTO supplier_visits (supplier_id, visit_date, visit_closed)
         VALUES (?, ?, ?)
         ON CONFLICT (supplier_id, visit_date)
         DO UPDATE SET
           visit_closed = EXCLUDED.visit_closed,
           updated_at = CURRENT_TIMESTAMP`,
        [supplierId, visitDate, Boolean(visitClosed)]
      );

      return res.json(await readSupplierVisitResponse({ supplierId, visitDate }));
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to update supplier visit' });
    }
  };

  app.get('/api/purchase-operations/summary', requireAdmin, respondPurchaseOperationsSummary);
  app.post('/api/purchase-operations/visit/close', requireAdmin, (req, res) => mutateSupplierVisit(req, res, true));
  app.post('/api/purchase-operations/visit/reopen', requireAdmin, (req, res) => mutateSupplierVisit(req, res, false));
  app.get('/api/internal/purchase-operations/analytics/run', requireCronSecret, runPurchaseOperationsAnalytics);
  app.post('/api/internal/purchase-operations/analytics/run', requireCronSecret, runPurchaseOperationsAnalytics);
};

module.exports = { registerPurchaseOperationsRoutes };
