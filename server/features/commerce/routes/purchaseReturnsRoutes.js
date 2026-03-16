const registerPurchaseReturnsRoutes = (deps) => {
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

  app.get('/api/purchase-returns', requireAdmin, async (req, res) => {
    try {
      let sql = `
        SELECT pr.*, d.name as distributor_name
        FROM purchase_returns pr
        LEFT JOIN distributors d ON d.id = pr.distributor_id
        WHERE 1=1
      `;
      const params = [];
      if (req.query.distributor_id) {
        sql += ` AND pr.distributor_id = ?`;
        params.push(req.query.distributor_id);
      }
      sql += ` ORDER BY pr.created_at DESC`;
      const baseRows = await dbAllAsync(sql, params);
      const rows = await Promise.all(
        baseRows.map(async (row) => ({
          ...row,
          items: await dbAllAsync(`SELECT * FROM purchase_return_items WHERE return_id = ?`, [row.id])
        }))
      );
      return res.json(rows);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  
  app.get('/api/purchase-returns/:id', requireAdmin, async (req, res) => {
    try {
      const row = await dbGetAsync(`SELECT * FROM purchase_returns WHERE id = ?`, [req.params.id]);
      if (!row) return res.status(404).json({ error: 'Purchase return not found' });
      return res.json({ ...row, items: await dbAllAsync(`SELECT * FROM purchase_return_items WHERE return_id = ?`, [row.id]) });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  
  app.post('/api/purchase-returns', requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      const items = Array.isArray(b.items) ? b.items : [];
      if (!b.distributor_id) return res.status(400).json({ error: 'distributor_id is required' });
      if (!items.length) return res.status(400).json({ error: 'At least one item is required' });
      const productCache = new Map();
      const itemErrors = [];
      const normalizedItems = [];
      for (let index = 0; index < items.length; index += 1) {
        const rowNo = index + 1;
        const it = items[index] || {};
        const productId = Number(it.product_id || 0) || 0;
        if (!productId) {
          itemErrors.push(`Item ${rowNo}: product_id is required`);
          continue;
        }
        if (!productCache.has(productId)) {
          const product = await dbGetAsync(
            `SELECT id, name, uom, base_unit, conversion_factor FROM products WHERE id = ?`,
            [productId]
          );
          productCache.set(productId, product || null);
        }
        const product = productCache.get(productId);
        if (!product) {
          itemErrors.push(`Item ${rowNo}: product ${productId} not found`);
          continue;
        }
        const quantity = Math.max(0, Number(it.quantity || 0));
        if (quantity <= 0) {
          itemErrors.push(`Item ${rowNo}: quantity must be greater than 0`);
          continue;
        }
        const providedUomRaw = String(it.uom || '').trim();
        const allowedUnits = getAllowedPurchaseUnitsForProductRow(product);
        let normalizedUom = allowedUnits[0] || getPurchaseProductUomProfile(product).baseUnit;
        if (providedUomRaw) {
          const requestedUom = normalizePurchaseUomToken(providedUomRaw, normalizedUom);
          if (!allowedUnits.includes(requestedUom)) {
            itemErrors.push(
              `Item ${rowNo}: unit "${providedUomRaw}" is invalid for product ${product.id}. Allowed: ${allowedUnits.join(', ')}`
            );
            continue;
          }
          normalizedUom = requestedUom;
        }
        const quantityBase = toPurchaseBaseQty(quantity, normalizedUom, product);
        const unitPrice = Math.max(0, Number(it.unit_price || 0));
        normalizedItems.push({
          product_id: productId,
          product_name: String(it.product_name || '').trim() || String(product.name || '').trim() || 'Unknown',
          quantity,
          quantity_base: quantityBase,
          uom: normalizedUom,
          unit_price: unitPrice,
          total: quantityBase * unitPrice,
          reason: it.reason || b.reason || null,
        });
      }
  
      if (itemErrors.length) {
        return res.status(400).json({ error: 'Invalid purchase return items', details: itemErrors });
      }
  
      const total = normalizedItems.reduce((sum, it) => sum + Number(it.total || 0), 0);
      const returnNumber = generateReturnNumber();
      const returnId = await dbTxAsync(async () => {
        const head = await dbRunAsync(
          `INSERT INTO purchase_returns (return_number, distributor_id, total, reason, return_type, reference_po, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [returnNumber, b.distributor_id, total, b.reason || null, b.return_type || 'return', b.reference_po || null, b.created_by || null]
        );
        const returnId = head.lastInsertRowid;
        for (const it of normalizedItems) {
          await dbRunAsync(
            `INSERT INTO purchase_return_items (return_id, product_id, product_name, quantity, uom, unit_price, total, reason)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              returnId,
              it.product_id || null,
              it.product_name || 'Unknown',
              Number(it.quantity || 0),
              it.uom || 'pcs',
              Number(it.unit_price || 0),
              Number(it.total || 0),
              it.reason || b.reason || null,
            ]
          );
          if (it.product_id) {
            const before = (await dbGetAsync(`SELECT stock FROM products WHERE id = ?`, [it.product_id]))?.stock || 0;
            await dbRunAsync(`UPDATE products SET stock = stock - ? WHERE id = ?`, [Number(it.quantity_base || 0), it.product_id]);
            const after = (await dbGetAsync(`SELECT stock FROM products WHERE id = ?`, [it.product_id]))?.stock || 0;
            await logStockLedgerAsync({
              productId: it.product_id,
              transactionType: 'PURCHASE_RETURN',
              quantityChange: -Number(it.quantity_base || 0),
              previousBalance: before,
              newBalance: after,
              referenceType: 'PURCHASE_RETURN',
              referenceId: String(returnId),
              userId: b.created_by || null,
            });
          }
        }
        return returnId;
      });
      return res.status(201).json({ success: true, id: returnId, return_number: returnNumber });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  
  app.put('/api/purchase-returns/:id', requireAdmin, async (req, res) => {
    try {
      const cur = await dbGetAsync(`SELECT * FROM purchase_returns WHERE id = ?`, [req.params.id]);
      if (!cur) return res.status(404).json({ error: 'Purchase return not found' });
      const b = req.body || {};
      await dbRunAsync(
        `UPDATE purchase_returns SET reason=?, return_type=?, reference_po=?, updated_at=CURRENT_TIMESTAMP WHERE id = ?`,
        [b.reason ?? cur.reason, b.return_type ?? cur.return_type, b.reference_po ?? cur.reference_po, req.params.id]
      );
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  
  app.delete('/api/purchase-returns/:id', requireAdmin, async (req, res) => {
    try {
      await dbRunAsync(`DELETE FROM purchase_return_items WHERE return_id = ?`, [req.params.id]);
      await dbRunAsync(`DELETE FROM purchase_returns WHERE id = ?`, [req.params.id]);
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  
};

module.exports = { registerPurchaseReturnsRoutes };
