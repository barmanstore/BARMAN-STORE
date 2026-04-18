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
      const requestedTransactionType = String(req.query.transaction_type || '').trim();
      let sql = `
        SELECT stock_ledger.*, po.po_number AS po_number, COALESCE(bill_by_id.bill_number, bill_by_order.bill_number) AS bill_number
        FROM stock_ledger
        LEFT JOIN purchase_orders po
          ON po.id::text = stock_ledger.reference_id
         AND LOWER(stock_ledger.reference_type) IN ('po', 'po_confirm')
        LEFT JOIN bills bill_by_id
          ON bill_by_id.id::text = stock_ledger.reference_id
         AND LOWER(stock_ledger.reference_type) = 'bill'
        LEFT JOIN bills bill_by_order
          ON bill_by_order.order_id::text = stock_ledger.reference_id
         AND LOWER(stock_ledger.reference_type) = 'order'
        WHERE 1=1`;
      const params = [];
      if (req.query.product_id) {
        sql += ` AND stock_ledger.product_id = ?`;
        params.push(req.query.product_id);
      }
      if (requestedTransactionType) {
        if (requestedTransactionType.toUpperCase() === 'SALE') {
          sql += ` AND (UPPER(stock_ledger.transaction_type) = 'SALE' OR LOWER(stock_ledger.transaction_type) = 'out')`;
        } else {
          sql += ` AND UPPER(stock_ledger.transaction_type) = UPPER(?)`;
          params.push(requestedTransactionType);
        }
      }
      if (req.query.start_date) {
        sql += ` AND date(stock_ledger.created_at) >= date(?)`;
        params.push(req.query.start_date);
      }
      if (req.query.end_date) {
        sql += ` AND date(stock_ledger.created_at) <= date(?)`;
        params.push(req.query.end_date);
      }
      sql += ` ORDER BY stock_ledger.created_at DESC`;
      return res.json(await dbAllAsync(sql, params));
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/stock-ledger/product/:productId', requireAdmin, async (req, res) => {
    try {
      return res.json(
        await dbAllAsync(
          `
          SELECT stock_ledger.*, po.po_number AS po_number, COALESCE(bill_by_id.bill_number, bill_by_order.bill_number) AS bill_number
          FROM stock_ledger
          LEFT JOIN purchase_orders po
            ON po.id::text = stock_ledger.reference_id
           AND LOWER(stock_ledger.reference_type) IN ('po', 'po_confirm')
          LEFT JOIN bills bill_by_id
            ON bill_by_id.id::text = stock_ledger.reference_id
           AND LOWER(stock_ledger.reference_type) = 'bill'
          LEFT JOIN bills bill_by_order
            ON bill_by_order.order_id::text = stock_ledger.reference_id
           AND LOWER(stock_ledger.reference_type) = 'order'
          WHERE stock_ledger.product_id = ?
          ORDER BY stock_ledger.created_at DESC
        `,
          [req.params.productId]
        )
      );
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/stock-ledger/batch/:batchNumber', requireAdmin, (_, res) => {
    return res.json([]);
  });

  app.get('/api/stock-ledger/summary', requireAdmin, async (_, res) => {
    try {
      const rows = await dbAllAsync(`
        SELECT
          CASE
            WHEN LOWER(transaction_type) = 'out' THEN 'SALE'
            ELSE UPPER(transaction_type)
          END AS transaction_type,
          COUNT(*) as count
        FROM stock_ledger
        GROUP BY CASE
          WHEN LOWER(transaction_type) = 'out' THEN 'SALE'
          ELSE UPPER(transaction_type)
        END
      `);
      return res.json(rows);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/stock-ledger/adjustments', requireAdmin, async (req, res) => {
    try {
      const hasSingleItemBody =
        req.body &&
        typeof req.body === 'object' &&
        !Array.isArray(req.body) &&
        Object.keys(req.body).length > 0;
      const rawItems = Array.isArray(req.body?.items)
        ? req.body.items
        : hasSingleItemBody
          ? [req.body]
          : [];
      if (!rawItems.length) {
        return res.status(400).json({ error: 'At least one stock adjustment item is required' });
      }

      const syncBatchId = resolveClientRequestId?.(req) || `manual-sync-${Date.now()}`;
      const actorId = Number(req.user?.id || req.authUser?.id || req.body?.updated_by || 0) || null;
      const actorName =
        String(
          req.user?.name || req.authUser?.name || req.body?.updated_by_name || 'Admin'
        ).trim() || 'Admin';
      const updates = [];

      for (const rawItem of rawItems) {
        const productId = Number(rawItem?.product_id || rawItem?.productId || 0);
        const quantity = Number(
          rawItem?.quantity ?? rawItem?.restock_quantity ?? rawItem?.pending_quantity ?? 0
        );
        const mode = String(rawItem?.mode || 'increment')
          .trim()
          .toLowerCase();
        const notes = String(rawItem?.notes || '').trim();

        if (!productId) {
          return res
            .status(400)
            .json({ error: 'Each stock adjustment item requires a valid product_id' });
        }
        if (!Number.isFinite(quantity) || quantity < 0) {
          return res
            .status(400)
            .json({ error: 'Each stock adjustment item requires a non-negative quantity' });
        }
        if (mode !== 'increment' && mode !== 'set') {
          return res
            .status(400)
            .json({ error: 'Stock adjustment mode must be either "increment" or "set"' });
        }

        updates.push({
          productId,
          quantity,
          mode,
          notes,
        });
      }

      const adjustmentResults = [];
      await dbTxAsync(async () => {
        for (const item of updates) {
          const product = await dbGetAsync(
            `SELECT id, name, sku, stock, category, brand, is_active
             FROM products
             WHERE id = ?`,
            [item.productId]
          );
          if (!product) {
            const error = new Error(`Product ${item.productId} not found`);
            error.status = 404;
            throw error;
          }

          const previousStock = Number(product.stock || 0);
          const nextStock = item.mode === 'set' ? item.quantity : previousStock + item.quantity;
          const quantityChange = nextStock - previousStock;

          if (!Number.isFinite(nextStock) || nextStock < 0) {
            const error = new Error(
              `Stock cannot go below zero for product ${product.name || item.productId}`
            );
            error.status = 400;
            throw error;
          }
          if (
            Number.isFinite(Number(PURCHASE_STOCK_CAP || 0)) &&
            Number(PURCHASE_STOCK_CAP) > 0 &&
            nextStock > Number(PURCHASE_STOCK_CAP)
          ) {
            const error = new Error(
              `Stock cannot exceed ${Number(PURCHASE_STOCK_CAP)} for product ${product.name || item.productId}`
            );
            error.status = 400;
            throw error;
          }

          if (quantityChange !== 0) {
            await dbRunAsync(
              `UPDATE products
               SET stock = ?
               WHERE id = ?`,
              [nextStock, item.productId]
            );

            await logStockLedgerAsync({
              productId: item.productId,
              transactionType: 'ADJUSTMENT',
              quantityChange,
              previousBalance: previousStock,
              newBalance: nextStock,
              referenceType: 'MANUAL_SYNC',
              referenceId: syncBatchId,
              userId: actorId,
              userName: actorName,
              notes: item.notes || 'Manual restock sync',
            });
          }

          adjustmentResults.push({
            product_id: Number(product.id || item.productId),
            product_name: product.name || null,
            sku: product.sku || null,
            category: product.category || null,
            brand: product.brand || null,
            is_active: Number(product.is_active ?? 1) === 1,
            previous_stock: previousStock,
            quantity_change: quantityChange,
            new_stock: nextStock,
            mode: item.mode,
            notes: item.notes || null,
          });
        }
      });

      if (typeof logAdminAuditAsync === 'function') {
        await logAdminAuditAsync(req, {
          action: 'stock.manual_sync',
          entityType: 'stock_ledger',
          entityId: syncBatchId,
          details: {
            item_count: adjustmentResults.length,
            total_quantity_change: adjustmentResults.reduce(
              (sum, row) => sum + Number(row.quantity_change || 0),
              0
            ),
            product_ids: adjustmentResults.map((row) => row.product_id),
          },
        });
      }

      return res.json({
        success: true,
        sync_batch_id: syncBatchId,
        items: adjustmentResults,
      });
    } catch (error) {
      const status = Number(error?.status || 0) || 500;
      return res
        .status(status)
        .json({ error: error.message || 'Failed to apply stock adjustments' });
    }
  });

  app.post('/api/stock/verify', requireAdmin, async (req, res) => {
    try {
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      const result = await Promise.all(
        items.map(async (it) => {
          const product = await dbGetAsync(`SELECT id, name, stock FROM products WHERE id = ?`, [
            it.product_id,
          ]);
          if (!product) return { product_id: it.product_id, available: false, reason: 'NOT_FOUND' };
          return {
            product_id: it.product_id,
            product_name: product.name,
            available: Number(product.stock) >= Number(it.quantity || 0),
            in_stock: Number(product.stock),
            requested: Number(it.quantity || 0),
          };
        })
      );
      return res.json({ items: result, allAvailable: result.every((x) => x.available) });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerStockRoutes };
