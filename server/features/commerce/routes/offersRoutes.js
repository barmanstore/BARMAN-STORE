const registerOffersRoutes = (deps) => {
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

  app.get('/api/offers', async (_, res) => {
    try {
      return res.json(await dbAllAsync(`SELECT * FROM offers ORDER BY created_at DESC`));
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  
  app.post('/api/offers', requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      if (!b.name || !b.type) return res.status(400).json({ error: 'name and type are required' });
      const result = await dbRunAsync(
        `INSERT INTO offers
        (name, description, type, value, min_quantity, apply_to_category, apply_to_product, buy_product_id, buy_quantity, get_product_id, get_quantity, start_date, end_date, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          b.name,
          b.description || null,
          b.type,
          Number(b.value || 0),
          Number(b.min_quantity || 1),
          b.apply_to_category || null,
          b.apply_to_product || null,
          b.buy_product_id || null,
          Number(b.buy_quantity || 1),
          b.get_product_id || null,
          Number(b.get_quantity || 1),
          b.start_date || null,
          b.end_date || null,
          b.status || 'active',
        ]
      );
      const created = await dbGetAsync(`SELECT * FROM offers WHERE id = ?`, [result.lastInsertRowid]);
      await logAdminAuditAsync(req, {
        action: 'offer.create',
        entityType: 'offer',
        entityId: result.lastInsertRowid,
        details: { name: b.name, type: b.type },
      });
      return res.status(201).json(created);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  
  app.put('/api/offers/:id', requireAdmin, async (req, res) => {
    try {
      const cur = await dbGetAsync(`SELECT * FROM offers WHERE id = ?`, [req.params.id]);
      if (!cur) return res.status(404).json({ error: 'Offer not found' });
      const b = req.body || {};
      await dbRunAsync(
        `UPDATE offers SET
         name=?, description=?, type=?, value=?, min_quantity=?, apply_to_category=?, apply_to_product=?, buy_product_id=?, buy_quantity=?, get_product_id=?, get_quantity=?, start_date=?, end_date=?, status=?, updated_at=CURRENT_TIMESTAMP
         WHERE id=?`,
        [
          b.name ?? cur.name,
          b.description ?? cur.description,
          b.type ?? cur.type,
          Number(b.value ?? cur.value ?? 0),
          Number(b.min_quantity ?? cur.min_quantity ?? 1),
          b.apply_to_category ?? cur.apply_to_category,
          b.apply_to_product ?? cur.apply_to_product,
          b.buy_product_id ?? cur.buy_product_id,
          Number(b.buy_quantity ?? cur.buy_quantity ?? 1),
          b.get_product_id ?? cur.get_product_id,
          Number(b.get_quantity ?? cur.get_quantity ?? 1),
          b.start_date ?? cur.start_date,
          b.end_date ?? cur.end_date,
          b.status ?? cur.status,
          req.params.id,
        ]
      );
      const updated = await dbGetAsync(`SELECT * FROM offers WHERE id = ?`, [req.params.id]);
      await logAdminAuditAsync(req, {
        action: 'offer.update',
        entityType: 'offer',
        entityId: req.params.id,
        details: { name: updated?.name || null, status: updated?.status || null },
      });
      return res.json(updated);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  
  app.delete('/api/offers/:id', requireAdmin, async (req, res) => {
    try {
      await dbRunAsync(`DELETE FROM offers WHERE id = ?`, [req.params.id]);
      await logAdminAuditAsync(req, {
        action: 'offer.delete',
        entityType: 'offer',
        entityId: req.params.id,
      });
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerOffersRoutes };
