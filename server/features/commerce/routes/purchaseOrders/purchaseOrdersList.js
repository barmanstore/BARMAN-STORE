const registerPurchaseOrdersListRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbAllAsync,
    dbGetAsync,
    dbRunAsync,
    dbTxAsync,
    acquirePurchaseDuplicateLockAsync,
    buildPurchaseDuplicateKey,
    buildPurchaseTransactionTimestamp,
    calculatePoPaymentSnapshot,
    computePurchasePaymentDueDate,
    createPurchaseConflictError,
    findDuplicatePurchaseOrderAsync,
    generatePONumber,
    getDistributorByIdAsync,
    isUniqueViolationError,
    logAdminAuditAsync,
    normalizePoLifecycleStatus,
    normalizePoPaymentStatus,
    normalizePurchaseOrderItems,
    normalizeTransactionDate,
    recordProductCostHistoryEntryAsync,
    recordPurchaseOrderStatusHistoryAsync,
    resolveClientRequestId,
    syncDistributorProductsSuppliedAsync,
    upsertSupplierProductsAsync,
    PO_LIFECYCLE_PREPARED,
  } = deps;

  app.get('/api/purchase-orders', requireAdmin, async (req, res) => {
    try {
      const requestedPageSize = Number(req.query?.page_size || req.query?.limit || 0);
      const isPaginated = Number.isFinite(requestedPageSize) && requestedPageSize > 0;
      const pageSize = isPaginated ? Math.max(1, Math.min(100, Math.floor(requestedPageSize))) : 0;
      const page = isPaginated
        ? Math.max(1, Math.floor(Number(req.query?.page || 1) || 1))
        : 1;
      const offset = isPaginated ? (page - 1) * pageSize : 0;
      const includeItems = String(req.query?.include_items || '').trim().toLowerCase() === 'true'
        || (!isPaginated && String(req.query?.include_items || '').trim().toLowerCase() !== 'false');

      let whereSql = ` WHERE 1=1`;
      let countSql = `
        SELECT COUNT(*) AS count
        FROM purchase_orders po
        WHERE 1=1
      `;
      const params = [];
      if (req.query.distributor_id) {
        whereSql += ` AND po.distributor_id = ?`;
        countSql += ` AND po.distributor_id = ?`;
        params.push(req.query.distributor_id);
      }
      if (req.query.status) {
        const lifecycleStatus = normalizePoLifecycleStatus(req.query.status, '');
        if (lifecycleStatus) {
          whereSql += ` AND LOWER(COALESCE(po.po_status, po.status, '')) = LOWER(?)`;
          countSql += ` AND LOWER(COALESCE(po.po_status, po.status, '')) = LOWER(?)`;
          params.push(lifecycleStatus);
        } else {
          whereSql += ` AND po.status = ?`;
          countSql += ` AND po.status = ?`;
          params.push(req.query.status);
        }
      }
      if (req.query.payment_status) {
        whereSql += ` AND LOWER(COALESCE(po.payment_status, 'unpaid')) = LOWER(?)`;
        countSql += ` AND LOWER(COALESCE(po.payment_status, 'unpaid')) = LOWER(?)`;
        params.push(normalizePoPaymentStatus(req.query.payment_status));
      }
      if (req.query.start_date) {
        whereSql += ` AND date(po.created_at) >= date(?)`;
        countSql += ` AND date(po.created_at) >= date(?)`;
        params.push(req.query.start_date);
      }
      if (req.query.end_date) {
        whereSql += ` AND date(po.created_at) <= date(?)`;
        countSql += ` AND date(po.created_at) <= date(?)`;
        params.push(req.query.end_date);
      }
      let sql = `
        SELECT po.*, d.name as distributor_name, COALESCE(poi.item_count, 0) AS item_count
        FROM purchase_orders po
        LEFT JOIN distributors d ON d.id = po.distributor_id
        LEFT JOIN (
          SELECT order_id, COUNT(*) AS item_count
          FROM purchase_order_items
          GROUP BY order_id
        ) poi ON poi.order_id = po.id
        ${whereSql}
        ORDER BY po.created_at DESC
      `;

      let baseRows = [];
      let total = 0;
      if (isPaginated) {
        const totalRow = await dbGetAsync(countSql, params);
        total = Number(totalRow?.count || 0);
        baseRows = await dbAllAsync(`${sql} LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
      } else {
        baseRows = await dbAllAsync(sql, params);
        total = baseRows.length;
      }

      const rows = includeItems
        ? await Promise.all(baseRows.map(async (row) => {
          const items = await dbAllAsync(`SELECT * FROM purchase_order_items WHERE order_id = ?`, [row.id]);
          return { ...row, item_count: Number(row?.item_count || items.length || 0), items };
        }))
        : baseRows.map((row) => ({ ...row, item_count: Number(row?.item_count || 0) }));

      if (isPaginated) {
        return res.json({
          items: rows,
          pagination: {
            page,
            page_size: pageSize,
            total,
            total_pages: total > 0 ? Math.ceil(total / pageSize) : 0,
            has_more: offset + rows.length < total,
          },
        });
      }

      return res.json(rows);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/purchase-orders', requireAdmin, async (req, res) => {
    let clientRequestId = null;
    try {
      const b = req.body || {};
      const idempotency = resolveClientRequestId(req);
      if (idempotency.error) return res.status(400).json({ error: idempotency.error });
      clientRequestId = idempotency.value;
      if (clientRequestId) {
        const existing = await dbGetAsync(`SELECT id, po_number FROM purchase_orders WHERE client_request_id = ? LIMIT 1`, [clientRequestId]);
        if (existing) {
          return res.status(200).json({
            success: true,
            deduplicated: true,
            id: Number(existing.id),
            po_number: existing.po_number,
          });
        }
      }

      if (!b.distributor_id) return res.status(400).json({ error: 'distributor_id is required' });
      const distributor = await getDistributorByIdAsync(b.distributor_id);
      if (!distributor) return res.status(404).json({ error: 'Distributor not found' });
      const items = Array.isArray(b.items) ? b.items : [];
      if (!items.length) return res.status(400).json({ error: 'At least one item is required' });

      const normalizedItems = await normalizePurchaseOrderItems(items);
      const plannedOrderDate = normalizeTransactionDate(b.planned_order_date || b.expected_delivery || new Date().toISOString())
        || new Date().toISOString().slice(0, 10);
      const duplicateKey = buildPurchaseDuplicateKey({
        distributorId: Number(b.distributor_id || 0),
        plannedOrderDate,
        items: normalizedItems,
      });
      const subtotal = normalizedItems.reduce((sum, it) => sum + Number(it.taxable_value || 0), 0);
      const taxAmount = normalizedItems.reduce((sum, it) => sum + Number(it.tax_amount || 0), 0);
      const totalAmount = normalizedItems.reduce((sum, it) => sum + Number(it.line_total || 0), 0);
      const paymentSnapshot = calculatePoPaymentSnapshot(totalAmount, 0);
      const inferredPaymentDueDate = computePurchasePaymentDueDate(
        distributor,
        plannedOrderDate,
        {
          payment_cycle_type: b.payment_cycle_type,
          payment_due_days: b.payment_due_days,
        }
      );
      const strictDueDate = normalizeTransactionDate(b.strict_due_date || b.strict_payment_due_date || null);
      const strictDueNote = String(b.strict_due_note || b.strict_deadline_note || '').trim() || null;
      const paymentDueDate = strictDueDate || inferredPaymentDueDate;

      const poNumber = generatePONumber();
      const orderId = await dbTxAsync(async () => {
        await acquirePurchaseDuplicateLockAsync({
          distributorId: Number(b.distributor_id || 0),
          plannedOrderDate,
          duplicateKey,
        });
        const existingDuplicate = await findDuplicatePurchaseOrderAsync({
          distributorId: Number(b.distributor_id || 0),
          plannedOrderDate,
          duplicateKey,
        });
        if (existingDuplicate) {
          throw createPurchaseConflictError(
            `Possible duplicate purchase order already exists (${existingDuplicate.po_number}) for the same distributor, planned date, and item basket`,
            'purchase_order_duplicate',
            existingDuplicate
          );
        }
        const header = await dbRunAsync(
          `INSERT INTO purchase_orders
           (po_number, distributor_id, subtotal, tax_amount, total_amount, total, status, po_status, payment_status, paid_amount, balance_due, notes, expected_delivery, planned_order_date, payment_due_date, strict_due_date, strict_due_note, duplicate_key, next_action, created_by, client_request_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            poNumber,
            b.distributor_id,
            subtotal,
            taxAmount,
            totalAmount,
            totalAmount,
            'pending',
            PO_LIFECYCLE_PREPARED,
            paymentSnapshot.paymentStatus,
            paymentSnapshot.paidAmount,
            paymentSnapshot.balanceDue,
            b.notes || null,
            b.expected_delivery || null,
            plannedOrderDate,
            paymentDueDate,
            strictDueDate,
            strictDueNote,
            duplicateKey,
            'Send to distributor',
            b.created_by || null,
            clientRequestId,
          ]
        );
        const orderId = header.lastInsertRowid;
        const transactionTs = buildPurchaseTransactionTimestamp(plannedOrderDate, new Date());
        for (const it of normalizedItems) {
          const fallbackName = it.product_id
            ? (await dbGetAsync(`SELECT name FROM products WHERE id = ?`, [it.product_id]))?.name
            : null;
          const insert = await dbRunAsync(
            `INSERT INTO purchase_order_items (order_id, product_id, product_name, quantity, received_quantity, uom, unit_price, rate, unit_price_before_discount, unit_discount_amount, tax_rate, unit_tax_amount, unit_cost_incl_tax, line_total_incl_tax, gst_rate, discount_type, discount_value, taxable_value, tax_amount, line_total, total)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              orderId,
              it.product_id || null,
              it.product_name || fallbackName || 'Unknown',
              Number(it.quantity || 0),
              0,
              it.uom || 'pcs',
              Number(it.unit_price || 0),
              Number(it.rate || it.unit_price || 0),
              Number(it.unit_price_before_discount || 0),
              Number(it.unit_discount_amount || 0),
              Number(it.tax_rate || it.gst_rate || 0),
              Number(it.unit_tax_amount || 0),
              Number(it.unit_cost_incl_tax || 0),
              Number(it.line_total_incl_tax || it.line_total || 0),
              Number(it.gst_rate || 0),
              it.discount_type || 'percent',
              Number(it.discount_value || 0),
              Number(it.taxable_value || 0),
              Number(it.tax_amount || 0),
              Number(it.line_total || 0),
              Number(it.line_total || 0),
            ]
          );
          const poItemId = Number(insert?.lastInsertRowid || 0) || null;
          if (it.product_id && poItemId) {
            await recordProductCostHistoryEntryAsync({
              productId: it.product_id,
              distributorId: b.distributor_id,
              purchaseOrderId: orderId,
              purchaseOrderItemId: poItemId,
              unitCostInclTax: it.unit_cost_incl_tax,
              taxRate: it.tax_rate || it.gst_rate,
              discountAmount: it.unit_discount_amount,
              transactionTs,
            });
          }
        }
        await upsertSupplierProductsAsync(b.distributor_id, normalizedItems);
        await recordPurchaseOrderStatusHistoryAsync(orderId, {
          fromStatus: null,
          toStatus: PO_LIFECYCLE_PREPARED,
          note: 'Purchase order prepared',
          paymentStatus: paymentSnapshot.paymentStatus,
          balanceDue: paymentSnapshot.balanceDue,
          createdBy: b.created_by || null,
        });
        return orderId;
      });
      await syncDistributorProductsSuppliedAsync(Number(b.distributor_id || 0), normalizedItems);
      await logAdminAuditAsync(req, {
        action: 'purchase_order.create',
        entityType: 'purchase_order',
        entityId: orderId,
        requestId: clientRequestId,
        details: {
          po_number: poNumber,
          distributor_id: Number(b.distributor_id || 0),
          total_amount: Number(totalAmount || 0),
          items_count: normalizedItems.length,
        },
      });
      return res.status(201).json({
        success: true,
        id: orderId,
        po_number: poNumber,
        po_status: PO_LIFECYCLE_PREPARED,
        payment_status: paymentSnapshot.paymentStatus,
        paid_amount: paymentSnapshot.paidAmount,
        balance_due: paymentSnapshot.balanceDue,
        payment_due_date: paymentDueDate,
        strict_due_date: strictDueDate,
      });
    } catch (error) {
      if (clientRequestId && isUniqueViolationError(error)) {
        const existing = await dbGetAsync(`SELECT id, po_number FROM purchase_orders WHERE client_request_id = ? LIMIT 1`, [clientRequestId]);
        if (existing) {
          return res.status(200).json({
            success: true,
            deduplicated: true,
            id: Number(existing.id),
            po_number: existing.po_number,
          });
        }
      }
      if (error.status === 400) {
        return res.status(400).json({ error: error.message, details: error.details || undefined });
      }
      if (error.status === 409) {
        return res.status(409).json({
          error: error.message,
          conflict_type: error.conflictType || undefined,
          conflict: error.conflict || undefined,
        });
      }
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerPurchaseOrdersListRoutes };
