const registerStockRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    requireCronSecret,
    dbAllAsync,
    dbGetAsync,
    dbRunAsync,
    dbTxAsync,
    acquirePurchaseDuplicateLockAsync,
    buildPurchaseDuplicateKey,
    buildPurchaseTransactionTimestamp,
    calculatePoPaymentSnapshot,
    canPoAcceptPayment,
    canPoReceiveInventory,
    computeAverageDays,
    computeAverageGapDays,
    computePurchasePaymentDueDate,
    computeStdDev,
    createDistributorLedgerEntry,
    createPurchaseConflictError,
    derivePoLifecycleFromPaymentStatus,
    derivePurchaseNextAction,
    deriveStockoutRisk,
    findDuplicateDistributorBillAsync,
    findDuplicatePurchaseOrderAsync,
    findDuplicatePurchasePaymentAsync,
    generatePONumber,
    generateReturnNumber,
    getAllowedPurchaseUnitsForProductRow,
    getDistributorByIdAsync,
    getPurchaseOrderLifecycleStatus,
    getPurchaseProductUomProfile,
    handlePurchaseOperationsSummary,
    isPoEditableLifecycle,
    isUniqueViolationError,
    logAdminAuditAsync,
    logStockLedgerAsync,
    normalizePoLifecycleStatus,
    normalizePoPaymentStatus,
    normalizePurchaseOrderItems,
    normalizePurchaseUomToken,
    normalizeTransactionDate,
    notifyDistributorPurchaseOrderAsync,
    recordProductCostHistoryEntryAsync,
    recordPurchaseOrderStatusHistoryAsync,
    resolveClientRequestId,
    resolveInsightDateRange,
    saveDistributorPurchaseReminderAsync,
    syncDistributorProductsSuppliedAsync,
    toPurchaseBaseQty,
    upsertSupplierProductsAsync,
    PO_LIFECYCLE_CANCELLED,
    PO_LIFECYCLE_CLOSED,
    PO_LIFECYCLE_CONFIRMED,
    PO_LIFECYCLE_FULLY_PAID,
    PO_LIFECYCLE_PART_PAID,
    PO_LIFECYCLE_PREPARED,
    PO_LIFECYCLE_REVISED,
    PO_LIFECYCLE_SENT,
    PO_PAYMENT_PAID,
    PO_PAYMENT_UNPAID,
    PURCHASE_STOCK_CAP,
  } = deps;

  app.get('/api/stock-ledger', requireAdmin, async (req, res) => {
    try {
      let sql = `SELECT * FROM stock_ledger WHERE 1=1`;
      const params = [];
      if (req.query.product_id) {
        sql += ` AND product_id = ?`;
        params.push(req.query.product_id);
      }
      if (req.query.transaction_type) {
        sql += ` AND transaction_type = ?`;
        params.push(req.query.transaction_type);
      }
      if (req.query.start_date) {
        sql += ` AND date(created_at) >= date(?)`;
        params.push(req.query.start_date);
      }
      if (req.query.end_date) {
        sql += ` AND date(created_at) <= date(?)`;
        params.push(req.query.end_date);
      }
      sql += ` ORDER BY created_at DESC`;
      return res.json(await dbAllAsync(sql, params));
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  
  app.get('/api/stock-ledger/product/:productId', requireAdmin, async (req, res) => {
    try {
      return res.json(await dbAllAsync(`SELECT * FROM stock_ledger WHERE product_id = ? ORDER BY created_at DESC`, [req.params.productId]));
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  
  app.get('/api/stock-ledger/batch/:batchNumber', requireAdmin, (_, res) => {
    return res.json([]);
  });
  
  app.get('/api/stock-ledger/summary', requireAdmin, async (_, res) => {
    try {
      const rows = await dbAllAsync(`SELECT transaction_type, COUNT(*) as count FROM stock_ledger GROUP BY transaction_type`);
      return res.json(rows);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  
  app.post('/api/stock/verify', requireAdmin, async (req, res) => {
    try {
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      const result = await Promise.all(items.map(async (it) => {
        const product = await dbGetAsync(`SELECT id, name, stock FROM products WHERE id = ?`, [it.product_id]);
        if (!product) return { product_id: it.product_id, available: false, reason: 'NOT_FOUND' };
        return {
          product_id: it.product_id,
          product_name: product.name,
          available: Number(product.stock) >= Number(it.quantity || 0),
          in_stock: Number(product.stock),
          requested: Number(it.quantity || 0),
        };
      }));
      return res.json({ items: result, allAvailable: result.every((x) => x.available) });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  
};

module.exports = { registerStockRoutes };
