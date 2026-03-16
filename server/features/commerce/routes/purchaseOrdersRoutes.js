const registerPurchaseOrdersRoutes = (deps) => {
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
  
  app.get('/api/purchase-orders/:id', requireAdmin, async (req, res) => {
    try {
      const row = await dbGetAsync(
        `SELECT po.*, d.name as distributor_name, d.address as distributor_address, d.contacts as distributor_contacts
         FROM purchase_orders po
         LEFT JOIN distributors d ON d.id = po.distributor_id
         WHERE po.id = ?`,
        [req.params.id]
      );
      if (!row) return res.status(404).json({ error: 'Purchase order not found' });
      const items = await dbAllAsync(`SELECT * FROM purchase_order_items WHERE order_id = ?`, [row.id]);
      const payments = await dbAllAsync(
        `SELECT *
         FROM purchase_order_payments
         WHERE purchase_order_id = ?
         ORDER BY COALESCE(transaction_date, created_at) DESC, id DESC`,
        [row.id]
      );
      const history = await dbAllAsync(
        `SELECT *
         FROM purchase_order_status_history
         WHERE purchase_order_id = ?
         ORDER BY created_at DESC, id DESC`,
        [row.id]
      );
      const reminders = await dbAllAsync(
        `SELECT *
         FROM distributor_purchase_reminders
         WHERE purchase_order_id = ?
         ORDER BY scheduled_for DESC, created_at DESC, id DESC`,
        [row.id]
      );
      return res.json({ ...row, items, payments, history, reminders });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  
  app.post('/api/purchase-orders/:id/distributor-whatsapp', requireAdmin, async (req, res) => {
    try {
      const order = await dbGetAsync(`SELECT * FROM purchase_orders WHERE id = ?`, [req.params.id]);
      if (!order) return res.status(404).json({ error: 'Purchase order not found' });
  
      const lifecycleStatus = getPurchaseOrderLifecycleStatus(order);
      if (!isPoEditableLifecycle(lifecycleStatus)) {
        return res.status(400).json({ error: 'WhatsApp action is available only before confirmation' });
      }
  
      const items = await dbAllAsync(
        `SELECT poi.product_id, poi.product_name, poi.quantity, poi.uom, poi.rate, poi.unit_price, p.price AS product_price
         FROM purchase_order_items poi
         LEFT JOIN products p ON p.id = poi.product_id
         WHERE poi.order_id = ?
         ORDER BY poi.id ASC`,
        [req.params.id]
      );
  
      const orderDate = normalizeTransactionDate(order.created_at || order.order_date) || new Date().toISOString().slice(0, 10);
      const distributorNotice = await notifyDistributorPurchaseOrderAsync({
        purchaseOrderId: Number(req.params.id || 0),
        distributorId: Number(order.distributor_id || 0),
        poNumber: order.po_number,
        totalAmount: Number(order.total_amount ?? order.total ?? 0),
        paymentStatus: normalizePoPaymentStatus(order.payment_status, PO_PAYMENT_UNPAID),
        balanceDue: Number(order.balance_due || 0),
        expectedDelivery: order.expected_delivery || null,
        notes: order.notes || '',
        billNumber: order.bill_number || order.invoice_number || '',
        isUpdate: false,
        items,
        messageDate: orderDate,
        title: `Order for ${orderDate}`,
        preparedBy: req?.authUser?.id || req.body?.created_by || null,
      });
  
      const whatsappUrl = distributorNotice?.whatsapp?.whatsapp_url || null;
      const nextStatus = lifecycleStatus === PO_LIFECYCLE_REVISED ? PO_LIFECYCLE_SENT : PO_LIFECYCLE_SENT;
      await dbRunAsync(
        `UPDATE purchase_orders
         SET po_status = ?,
             status = 'sent',
             sent_at = COALESCE(sent_at, CURRENT_TIMESTAMP),
             last_reminder_at = CURRENT_TIMESTAMP,
             next_action = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [nextStatus, 'Confirm with bill', req.params.id]
      );
      await recordPurchaseOrderStatusHistoryAsync(req.params.id, {
        fromStatus: lifecycleStatus,
        toStatus: nextStatus,
        note: 'Manual WhatsApp template prepared for distributor',
        paymentStatus: normalizePoPaymentStatus(order.payment_status, PO_PAYMENT_UNPAID),
        balanceDue: Number(order.balance_due || 0),
        createdBy: req?.authUser?.id || req.body?.created_by || null,
      });
      await saveDistributorPurchaseReminderAsync({
        distributorId: Number(order.distributor_id || 0),
        purchaseOrderId: Number(req.params.id || 0),
        reminderType: 'manual_whatsapp_prepare',
        scheduledFor: new Date().toISOString().slice(0, 10),
        status: 'prepared',
        title: `PO ${order.po_number} ready for WhatsApp`,
        message: `Manual WhatsApp template prepared for ${order.po_number}`,
        whatsappUrl,
        createdBy: req?.authUser?.id || req.body?.created_by || null,
      });
  
      return res.json({
        success: true,
        distributor_notice: distributorNotice || undefined,
        po_status: nextStatus,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to prepare distributor WhatsApp message' });
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
      const plannedOrderDate = normalizeTransactionDate(b.planned_order_date || b.expected_delivery || new Date().toISOString()) || new Date().toISOString().slice(0, 10);
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
  
  app.put('/api/purchase-orders/:id', requireAdmin, async (req, res) => {
    try {
      const cur = await dbGetAsync(`SELECT * FROM purchase_orders WHERE id = ?`, [req.params.id]);
      if (!cur) return res.status(404).json({ error: 'Purchase order not found' });
      const currentPoStatus = getPurchaseOrderLifecycleStatus(cur);
      if (!isPoEditableLifecycle(currentPoStatus)) {
        return res.status(400).json({ error: 'Only prepared, sent, or revised purchase orders can be edited' });
      }
      const b = req.body || {};
      const items = Array.isArray(b.items) ? b.items : null;
  
      let updatedDistributorId = Number(b.distributor_id ?? cur.distributor_id ?? 0) || null;
      let updatedNotes = b.notes ?? cur.notes ?? '';
      let updatedExpectedDelivery = b.expected_delivery ?? cur.expected_delivery ?? null;
      const distributor = await getDistributorByIdAsync(updatedDistributorId);
      if (!distributor) return res.status(404).json({ error: 'Distributor not found' });
      const nextLifecycleStatus = currentPoStatus === PO_LIFECYCLE_SENT ? PO_LIFECYCLE_REVISED : currentPoStatus;
      const shouldIncrementRevision = currentPoStatus === PO_LIFECYCLE_SENT || currentPoStatus === PO_LIFECYCLE_REVISED;
      const plannedOrderDate = normalizeTransactionDate(b.planned_order_date || updatedExpectedDelivery || cur.planned_order_date || cur.expected_delivery || cur.created_at) || new Date().toISOString().slice(0, 10);
      const inferredPaymentDueDate = computePurchasePaymentDueDate(distributor, plannedOrderDate, {
        payment_cycle_type: b.payment_cycle_type,
        payment_due_days: b.payment_due_days,
      });
      const strictDueDate = normalizeTransactionDate(
        b.strict_due_date
        ?? b.strict_payment_due_date
        ?? cur.strict_due_date
        ?? null
      );
      const strictDueNote = (b.strict_due_note !== undefined || b.strict_deadline_note !== undefined)
        ? (String(b.strict_due_note || b.strict_deadline_note || '').trim() || null)
        : (String(cur.strict_due_note || '').trim() || null);
      const paymentDueDate = strictDueDate || inferredPaymentDueDate;
      if (items) {
        if (!items.length) return res.status(400).json({ error: 'At least one item is required' });
        const normalizedItems = await normalizePurchaseOrderItems(items);
        const duplicateKey = buildPurchaseDuplicateKey({
          distributorId: updatedDistributorId,
          plannedOrderDate,
          items: normalizedItems,
        });
        const subtotal = normalizedItems.reduce((sum, it) => sum + Number(it.taxable_value || 0), 0);
        const taxAmount = normalizedItems.reduce((sum, it) => sum + Number(it.tax_amount || 0), 0);
        const totalAmount = normalizedItems.reduce((sum, it) => sum + Number(it.line_total || 0), 0);
        const paymentSnapshot = calculatePoPaymentSnapshot(totalAmount, Number(cur.paid_amount || 0));
        await dbTxAsync(async () => {
          await acquirePurchaseDuplicateLockAsync({
            distributorId: updatedDistributorId,
            plannedOrderDate,
            duplicateKey,
          });
          const existingDuplicate = await findDuplicatePurchaseOrderAsync({
            distributorId: updatedDistributorId,
            plannedOrderDate,
            duplicateKey,
            excludeOrderId: Number(req.params.id || 0),
          });
          if (existingDuplicate) {
            throw createPurchaseConflictError(
              `Possible duplicate purchase order already exists (${existingDuplicate.po_number}) for the same distributor, planned date, and item basket`,
              'purchase_order_duplicate',
              existingDuplicate
            );
          }
          await dbRunAsync(
            `UPDATE purchase_orders
             SET distributor_id=?, notes=?, expected_delivery=?, planned_order_date=?, payment_due_date=?, strict_due_date=?, strict_due_note=?, duplicate_key=?, status=?, po_status=?, revision_count=?, next_action=?, subtotal=?, tax_amount=?, total_amount=?, total=?, payment_status=?, paid_amount=?, balance_due=?, updated_at=CURRENT_TIMESTAMP
             WHERE id=?`,
            [
              updatedDistributorId,
              updatedNotes || null,
              updatedExpectedDelivery || null,
              plannedOrderDate,
              paymentDueDate,
              strictDueDate,
              strictDueNote,
              duplicateKey,
              nextLifecycleStatus === PO_LIFECYCLE_SENT ? 'sent' : 'pending',
              nextLifecycleStatus,
              shouldIncrementRevision ? Number(cur.revision_count || 0) + 1 : Number(cur.revision_count || 0),
              nextLifecycleStatus === PO_LIFECYCLE_REVISED ? 'Resend updated PO' : derivePurchaseNextAction({ ...cur, po_status: nextLifecycleStatus }),
              subtotal,
              taxAmount,
              totalAmount,
              totalAmount,
              paymentSnapshot.paymentStatus,
              paymentSnapshot.paidAmount,
              paymentSnapshot.balanceDue,
              req.params.id
            ]
          );
          await dbRunAsync(`DELETE FROM product_cost_history WHERE po_id = ?`, [req.params.id]);
          await dbRunAsync(`DELETE FROM purchase_order_items WHERE order_id = ?`, [req.params.id]);
          const transactionTs = buildPurchaseTransactionTimestamp(plannedOrderDate, new Date());
          for (const it of normalizedItems) {
            const insert = await dbRunAsync(
              `INSERT INTO purchase_order_items (order_id, product_id, product_name, quantity, received_quantity, uom, unit_price, rate, unit_price_before_discount, unit_discount_amount, tax_rate, unit_tax_amount, unit_cost_incl_tax, line_total_incl_tax, gst_rate, discount_type, discount_value, taxable_value, tax_amount, line_total, total)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                req.params.id,
                it.product_id || null,
                it.product_name || 'Unknown',
                Number(it.quantity || 0),
                Number(it.received_quantity || 0),
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
                distributorId: updatedDistributorId,
                purchaseOrderId: Number(req.params.id || 0),
                purchaseOrderItemId: poItemId,
                unitCostInclTax: it.unit_cost_incl_tax,
                taxRate: it.tax_rate || it.gst_rate,
                discountAmount: it.unit_discount_amount,
                transactionTs,
              });
            }
          }
          await upsertSupplierProductsAsync(updatedDistributorId, normalizedItems);
        });
        await syncDistributorProductsSuppliedAsync(updatedDistributorId, normalizedItems);
        if (nextLifecycleStatus !== currentPoStatus) {
          await recordPurchaseOrderStatusHistoryAsync(req.params.id, {
            fromStatus: currentPoStatus,
            toStatus: nextLifecycleStatus,
            note: 'Purchase order revised after edits',
            paymentStatus: paymentSnapshot.paymentStatus,
            balanceDue: paymentSnapshot.balanceDue,
            createdBy: req?.authUser?.id || b.created_by || null,
          });
        }
      } else {
        const nextSubtotal = Number(b.subtotal ?? cur.subtotal ?? 0);
        const nextTaxAmount = Number(b.tax_amount ?? cur.tax_amount ?? 0);
        const nextTotalAmount = Number(b.total_amount ?? cur.total_amount ?? cur.total ?? 0);
        const paymentSnapshot = calculatePoPaymentSnapshot(nextTotalAmount, Number(cur.paid_amount || 0));
        const duplicateKey = cur.duplicate_key || buildPurchaseDuplicateKey({
          distributorId: updatedDistributorId,
          plannedOrderDate,
          items: await dbAllAsync(`SELECT product_id, product_name, quantity, uom FROM purchase_order_items WHERE order_id = ?`, [req.params.id]),
        });
        await dbRunAsync(
          `UPDATE purchase_orders
           SET distributor_id=?, notes=?, expected_delivery=?, planned_order_date=?, payment_due_date=?, strict_due_date=?, strict_due_note=?, duplicate_key=?, status=?, po_status=?, revision_count=?, next_action=?, subtotal=?, tax_amount=?, total_amount=?, total=?, payment_status=?, paid_amount=?, balance_due=?, updated_at=CURRENT_TIMESTAMP
           WHERE id=?`,
          [
            updatedDistributorId,
            updatedNotes || null,
            updatedExpectedDelivery || null,
            plannedOrderDate,
            paymentDueDate,
            strictDueDate,
            strictDueNote,
            duplicateKey,
            nextLifecycleStatus === PO_LIFECYCLE_SENT ? 'sent' : 'pending',
            nextLifecycleStatus,
            shouldIncrementRevision ? Number(cur.revision_count || 0) + 1 : Number(cur.revision_count || 0),
            nextLifecycleStatus === PO_LIFECYCLE_REVISED ? 'Resend updated PO' : derivePurchaseNextAction({ ...cur, po_status: nextLifecycleStatus }),
            nextSubtotal,
            nextTaxAmount,
            nextTotalAmount,
            nextTotalAmount,
            paymentSnapshot.paymentStatus,
            paymentSnapshot.paidAmount,
            paymentSnapshot.balanceDue,
            req.params.id
          ]
        );
        if (nextLifecycleStatus !== currentPoStatus) {
          await recordPurchaseOrderStatusHistoryAsync(req.params.id, {
            fromStatus: currentPoStatus,
            toStatus: nextLifecycleStatus,
            note: 'Purchase order revised after header edits',
            paymentStatus: paymentSnapshot.paymentStatus,
            balanceDue: paymentSnapshot.balanceDue,
            createdBy: req?.authUser?.id || b.created_by || null,
          });
        }
      }
      await logAdminAuditAsync(req, {
        action: 'purchase_order.update',
        entityType: 'purchase_order',
        entityId: req.params.id,
        details: {
          status: nextLifecycleStatus,
          has_items_payload: Array.isArray(req.body?.items),
        },
      });
      return res.json({ success: true, po_status: nextLifecycleStatus, payment_due_date: paymentDueDate, strict_due_date: strictDueDate });
    } catch (error) {
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
  
  app.put('/api/purchase-orders/:id/status', requireAdmin, async (req, res) => {
    try {
      const status = req.body?.status;
      const billNumberRaw = req.body?.bill_number ?? req.body?.invoice_number;
      const billNumber = billNumberRaw === undefined || billNumberRaw === null ? null : String(billNumberRaw).trim();
      if (!status) return res.status(400).json({ error: 'status is required' });
      const order = await dbGetAsync(`SELECT * FROM purchase_orders WHERE id = ?`, [req.params.id]);
      if (!order) return res.status(404).json({ error: 'Purchase order not found' });
      const currentPoStatus = getPurchaseOrderLifecycleStatus(order);
      const normalizedRequestedPoStatus = normalizePoLifecycleStatus(status, currentPoStatus);
      const requestedStatusRaw = String(status || '').trim().toLowerCase();
      const isConfirmRequest = normalizedRequestedPoStatus === PO_LIFECYCLE_CONFIRMED
        || normalizedRequestedPoStatus === PO_LIFECYCLE_PART_PAID
        || normalizedRequestedPoStatus === PO_LIFECYCLE_FULLY_PAID
        || requestedStatusRaw === 'processed';
  
      if (isConfirmRequest) {
        if (!isPoEditableLifecycle(currentPoStatus)) {
          return res.status(400).json({ error: 'Only prepared, sent, or revised purchase orders can be confirmed' });
        }
        if (!billNumber) {
          return res.status(400).json({ error: 'bill_number is required when confirming a purchase order' });
        }
        const duplicateBill = await findDuplicateDistributorBillAsync({
          distributorId: Number(order.distributor_id || 0),
          billNumber,
          excludeOrderId: Number(req.params.id || 0),
        });
        if (duplicateBill) {
          return res.status(409).json({
            error: `Bill number already exists for this distributor on ${duplicateBill.po_number}`,
            conflict_type: 'purchase_bill_duplicate',
            conflict: duplicateBill,
          });
        }
  
        const initialPaidAmountRaw = Number(
          req.body?.paid_amount ?? req.body?.initial_paid_amount ?? req.body?.payment_amount ?? 0
        );
        const initialPaidAmount = Math.max(0, initialPaidAmountRaw);
        const paymentMode = String(req.body?.payment_mode || 'cash').trim().toLowerCase() || 'cash';
        const paymentReference = String(req.body?.payment_reference || req.body?.reference || billNumber || '').trim() || null;
        const paymentNotes = String(req.body?.payment_notes || req.body?.notes || '').trim() || null;
        const paymentDate = normalizeTransactionDate(req.body?.payment_date || req.body?.transaction_date || new Date().toISOString());
        const confirmedAt = new Date().toISOString();
        const distributorId = Number(order.distributor_id || 0);
        const distributor = await getDistributorByIdAsync(distributorId);
        if (distributorId > 0 && !distributor) {
          return res.status(400).json({ error: 'Purchase order distributor not found. Reassign the distributor before processing this PO.' });
        }
        const totalSnapshot = calculatePoPaymentSnapshot(Number(order.total_amount ?? order.total ?? 0), initialPaidAmount);
        if (initialPaidAmount > totalSnapshot.totalAmount) {
          return res.status(400).json({ error: 'Initial paid amount cannot exceed PO total amount' });
        }
  
        const stockAlreadyApplied = Number(order.stock_applied_on_confirm || 0) === 1;
        const capAdjustments = [];
        let createdPaymentId = null;
        const nextLifecycleStatus = derivePoLifecycleFromPaymentStatus(PO_LIFECYCLE_CONFIRMED, totalSnapshot.paymentStatus);
        const nextAction = derivePurchaseNextAction({
          ...order,
          po_status: nextLifecycleStatus,
          status: 'confirmed',
          payment_status: totalSnapshot.paymentStatus,
          balance_due: totalSnapshot.balanceDue,
        });
        const paymentDueDate = normalizeTransactionDate(order.strict_due_date)
          || computePurchasePaymentDueDate(
            distributor || {},
            paymentDate || order.planned_order_date || order.expected_delivery || order.created_at,
          );
        await dbTxAsync(async () => {
          if (!stockAlreadyApplied) {
            const items = await dbAllAsync(`SELECT * FROM purchase_order_items WHERE order_id = ?`, [req.params.id]);
            for (const item of items) {
              const productId = Number(item.product_id || 0);
              if (!productId) continue;
              const product = await dbGetAsync(
                `SELECT id, stock, uom, base_unit, conversion_factor FROM products WHERE id = ?`,
                [productId]
              );
              if (!product) continue;
  
              const orderedQtyInput = Math.max(0, Number(item.quantity || 0));
              const orderedQty = toPurchaseBaseQty(orderedQtyInput, item.uom, product);
              const beforeStock = Number(product.stock || 0);
              const intendedStock = beforeStock + orderedQty;
              const finalStock = Math.min(PURCHASE_STOCK_CAP, Math.max(0, intendedStock));
              const quantityChange = finalStock - beforeStock;
              const capHit = intendedStock > PURCHASE_STOCK_CAP || beforeStock > PURCHASE_STOCK_CAP;
  
              if (quantityChange !== 0) {
                await dbRunAsync(`UPDATE products SET stock = ? WHERE id = ?`, [finalStock, productId]);
                const noteLines = ['Auto stock update on PO confirmation'];
                if (capHit) {
                  noteLines.push(`Stock cap ${PURCHASE_STOCK_CAP} applied (intended ${intendedStock}, final ${finalStock})`);
                }
                await logStockLedgerAsync({
                  productId,
                  transactionType: quantityChange >= 0 ? 'PURCHASE' : 'ADJUSTMENT',
                  quantityChange,
                  previousBalance: beforeStock,
                  newBalance: finalStock,
                  referenceType: 'PO_CONFIRM',
                  referenceId: String(req.params.id),
                  userId: req.body?.updated_by || req.body?.created_by || null,
                  notes: noteLines.join('. '),
                });
              }
  
              if (capHit) {
                capAdjustments.push({
                  product_id: productId,
                  product_name: item.product_name || null,
                  ordered_quantity: orderedQtyInput,
                  ordered_quantity_base: orderedQty,
                  before_stock: beforeStock,
                  intended_stock: intendedStock,
                  final_stock: finalStock,
                  discarded_quantity: Math.max(0, intendedStock - finalStock),
                  discarded_quantity_base: Math.max(0, intendedStock - finalStock),
                });
              }
            }
          }
  
          const existingPoCredit = await dbGetAsync(
            `SELECT id
             FROM distributor_ledger
             WHERE distributor_id = ?
               AND source = 'purchase_order'
               AND LOWER(type) = 'credit'
               AND (source_id = ? OR source_id = ?)
             ORDER BY id DESC
             LIMIT 1`,
            [order.distributor_id, String(req.params.id), `${req.params.id}.0`]
          );
          if (!existingPoCredit && distributorId > 0 && totalSnapshot.totalAmount > 0) {
            await createDistributorLedgerEntry(order.distributor_id, {
              type: 'credit',
              transaction_type: 'credit',
              amount: totalSnapshot.totalAmount,
              payment_mode: 'credit',
              reference: order.po_number || `PO-${req.params.id}`,
              bill_number: billNumber || null,
              description: `Purchase Order ${order.po_number || req.params.id}${billNumber ? ` (Bill: ${billNumber})` : ''}`.trim(),
              transaction_date: paymentDate || new Date().toISOString().slice(0, 10),
              source: 'purchase_order',
              source_id: req.params.id,
              created_by: req.body?.updated_by || req.body?.created_by || null,
            });
          }
  
          if (totalSnapshot.paidAmount > 0 && distributorId > 0) {
            const paymentResult = await dbRunAsync(
              `INSERT INTO purchase_order_payments
               (purchase_order_id, distributor_id, amount, payment_mode, reference, notes, transaction_date, created_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                req.params.id,
                order.distributor_id,
                totalSnapshot.paidAmount,
                paymentMode,
                paymentReference,
                paymentNotes,
                paymentDate,
                req.body?.updated_by || req.body?.created_by || null,
              ]
            );
            createdPaymentId = Number(paymentResult.lastInsertRowid || 0) || null;
            if (createdPaymentId) {
              await createDistributorLedgerEntry(order.distributor_id, {
                type: 'payment',
                transaction_type: 'payment',
                amount: totalSnapshot.paidAmount,
                payment_mode: paymentMode,
                reference: paymentReference || order.po_number || `PO-${req.params.id}`,
                bill_number: billNumber || null,
                description: `PO payment on confirmation ${order.po_number || req.params.id}`,
                transaction_date: paymentDate || new Date().toISOString().slice(0, 10),
                source: 'po_payment',
                source_id: createdPaymentId,
                created_by: req.body?.updated_by || req.body?.created_by || null,
              });
            }
          }
  
          await dbRunAsync(
            `UPDATE purchase_orders
             SET status = 'confirmed',
                 po_status = ?,
                 payment_status = ?,
                 paid_amount = ?,
                 balance_due = ?,
                 bill_number = COALESCE(?, bill_number),
                 invoice_number = COALESCE(?, invoice_number),
                 payment_due_date = ?,
                 next_action = ?,
                 stock_applied_on_confirm = 1,
                 confirmed_at = COALESCE(confirmed_at, ?),
                 processed_at = COALESCE(processed_at, CURRENT_TIMESTAMP),
                 updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
            [
              nextLifecycleStatus,
              totalSnapshot.paymentStatus,
              totalSnapshot.paidAmount,
              totalSnapshot.balanceDue,
              billNumber || null,
              billNumber || null,
              paymentDueDate,
              nextAction,
              confirmedAt,
              req.params.id,
            ]
          );
        });
  
        await recordPurchaseOrderStatusHistoryAsync(req.params.id, {
          fromStatus: currentPoStatus,
          toStatus: nextLifecycleStatus,
          note: 'Purchase order confirmed with bill',
          billNumber: billNumber || null,
          paymentStatus: totalSnapshot.paymentStatus,
          balanceDue: totalSnapshot.balanceDue,
          createdBy: req.body?.updated_by || req.body?.created_by || null,
        });
        await logAdminAuditAsync(req, {
          action: 'purchase_order.status_update',
          entityType: 'purchase_order',
          entityId: req.params.id,
          details: {
            status: 'confirmed',
            po_status: nextLifecycleStatus,
            bill_number: billNumber || null,
            initial_paid_amount: totalSnapshot.paidAmount,
            balance_due: totalSnapshot.balanceDue,
            payment_status: totalSnapshot.paymentStatus,
            stock_applied: !stockAlreadyApplied,
            stock_already_applied: stockAlreadyApplied,
            cap_applied_count: capAdjustments.length,
            process_payment_id: createdPaymentId,
          },
        });
        return res.json({
          success: true,
          po_status: nextLifecycleStatus,
          payment_status: totalSnapshot.paymentStatus,
          paid_amount: totalSnapshot.paidAmount,
          balance_due: totalSnapshot.balanceDue,
          payment_due_date: paymentDueDate,
          stock_cap: PURCHASE_STOCK_CAP,
          stock_applied: !stockAlreadyApplied,
          stock_already_applied: stockAlreadyApplied,
          cap_applied_count: capAdjustments.length,
          cap_adjustments: capAdjustments,
        });
      }
  
      if (normalizedRequestedPoStatus === PO_LIFECYCLE_CANCELLED) {
        if (!isPoEditableLifecycle(currentPoStatus)) {
          return res.status(400).json({ error: 'Only unconfirmed purchase orders can be cancelled' });
        }
        await dbRunAsync(
          `UPDATE purchase_orders
           SET status = 'cancelled',
               po_status = ?,
               next_action = 'Cancelled',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [PO_LIFECYCLE_CANCELLED, req.params.id]
        );
        await recordPurchaseOrderStatusHistoryAsync(req.params.id, {
          fromStatus: currentPoStatus,
          toStatus: PO_LIFECYCLE_CANCELLED,
          note: 'Purchase order cancelled',
          billNumber: billNumber || null,
          paymentStatus: normalizePoPaymentStatus(order.payment_status, PO_PAYMENT_UNPAID),
          balanceDue: Number(order.balance_due || 0),
          createdBy: req.body?.updated_by || req.body?.created_by || null,
        });
        await logAdminAuditAsync(req, {
          action: 'purchase_order.status_update',
          entityType: 'purchase_order',
          entityId: req.params.id,
          details: {
            status: 'cancelled',
            po_status: PO_LIFECYCLE_CANCELLED,
            bill_number: billNumber || null,
          },
        });
        return res.json({ success: true, po_status: PO_LIFECYCLE_CANCELLED });
      }
  
      if (normalizedRequestedPoStatus === PO_LIFECYCLE_CLOSED) {
        const balanceDue = Math.max(0, Number(order.balance_due || 0));
        if (!canPoAcceptPayment(currentPoStatus) && currentPoStatus !== PO_LIFECYCLE_FULLY_PAID) {
          return res.status(400).json({ error: 'Only confirmed purchase orders can be closed' });
        }
        if (balanceDue > 0 || normalizePoPaymentStatus(order.payment_status, PO_PAYMENT_UNPAID) !== PO_PAYMENT_PAID) {
          return res.status(400).json({ error: 'Purchase order can be closed only after full payment' });
        }
        await dbRunAsync(
          `UPDATE purchase_orders
           SET po_status = ?,
               next_action = 'Closed',
               closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [PO_LIFECYCLE_CLOSED, req.params.id]
        );
        await recordPurchaseOrderStatusHistoryAsync(req.params.id, {
          fromStatus: currentPoStatus,
          toStatus: PO_LIFECYCLE_CLOSED,
          note: 'Purchase order closed',
          billNumber: order.bill_number || order.invoice_number || null,
          paymentStatus: order.payment_status,
          balanceDue: 0,
          createdBy: req.body?.updated_by || req.body?.created_by || null,
        });
        await logAdminAuditAsync(req, {
          action: 'purchase_order.status_update',
          entityType: 'purchase_order',
          entityId: req.params.id,
          details: {
            status: 'closed',
            po_status: PO_LIFECYCLE_CLOSED,
          },
        });
        return res.json({ success: true, po_status: PO_LIFECYCLE_CLOSED });
      }
  
      return res.status(400).json({ error: 'Unsupported purchase order status transition' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  

  app.post('/api/purchase-orders/:id/payments', requireAdmin, async (req, res) => {
    let clientRequestId = null;
    try {
      const idempotency = resolveClientRequestId(req);
      if (idempotency.error) return res.status(400).json({ error: idempotency.error });
      clientRequestId = idempotency.value;
      const order = await dbGetAsync(`SELECT * FROM purchase_orders WHERE id = ?`, [req.params.id]);
      if (!order) return res.status(404).json({ error: 'Purchase order not found' });
      const poStatus = getPurchaseOrderLifecycleStatus(order);
      if (!canPoAcceptPayment(poStatus)) {
        return res.status(400).json({ error: 'Payments are allowed only for confirmed purchase orders' });
      }
  
      const amount = Math.max(0, Number(req.body?.amount || 0));
      if (amount <= 0) return res.status(400).json({ error: 'amount must be greater than 0' });
      const distributorId = Number(order.distributor_id || 0);
      if (!distributorId) {
        return res.status(400).json({ error: 'Purchase order distributor is missing. Reassign the distributor before recording payment.' });
      }
      const distributor = await getDistributorByIdAsync(distributorId);
      if (!distributor) {
        return res.status(400).json({ error: 'Purchase order distributor not found. Reassign the distributor before recording payment.' });
      }
  
      const totalSnapshotBefore = calculatePoPaymentSnapshot(
        Number(order.total_amount ?? order.total ?? 0),
        Number(order.paid_amount || 0)
      );
      if (amount > totalSnapshotBefore.balanceDue) {
        return res.status(400).json({ error: 'Payment amount cannot exceed balance due' });
      }
  
      const paymentMode = String(req.body?.payment_mode || 'cash').trim().toLowerCase() || 'cash';
      const reference = String(req.body?.reference || req.body?.payment_reference || order.bill_number || order.po_number || '').trim() || null;
      const notes = String(req.body?.notes || req.body?.description || '').trim() || null;
      const transactionDate = normalizeTransactionDate(req.body?.transaction_date || req.body?.payment_date || null);
      const duplicatePayment = await findDuplicatePurchasePaymentAsync({
        purchaseOrderId: Number(req.params.id || 0),
        distributorId: Number(order.distributor_id || 0),
        amount,
        reference,
        transactionDate,
        clientRequestId,
      });
      if (duplicatePayment) {
        return res.status(200).json({
          success: true,
          deduplicated: true,
          payment_id: Number(duplicatePayment.id || 0),
          payment_status: normalizePoPaymentStatus(order.payment_status, PO_PAYMENT_UNPAID),
          paid_amount: Number(order.paid_amount || 0),
          balance_due: Number(order.balance_due || 0),
        });
      }
      let paymentId = null;
      let nextSnapshot = totalSnapshotBefore;
      let nextPoStatus = poStatus;
      let nextAction = derivePurchaseNextAction(order);
  
      await dbTxAsync(async () => {
        const paymentResult = await dbRunAsync(
              `INSERT INTO purchase_order_payments
               (purchase_order_id, distributor_id, amount, payment_mode, reference, notes, transaction_date, created_by, client_request_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            req.params.id,
            distributorId,
            amount,
            paymentMode,
            reference,
            notes,
            transactionDate,
            req.body?.created_by || req?.authUser?.id || null,
            clientRequestId,
          ]
        );
        paymentId = Number(paymentResult.lastInsertRowid || 0) || null;
  
        if (paymentId && distributorId > 0) {
          await createDistributorLedgerEntry(distributorId, {
            type: 'payment',
            transaction_type: 'payment',
            amount,
            payment_mode: paymentMode,
            reference: reference || order.po_number || `PO-${req.params.id}`,
            bill_number: order.bill_number || order.invoice_number || null,
            description: `PO payment for ${order.po_number || req.params.id}`,
            transaction_date: transactionDate || new Date().toISOString().slice(0, 10),
            source: 'po_payment',
            source_id: paymentId,
            created_by: req.body?.created_by || req?.authUser?.id || null,
          });
        }
  
        nextSnapshot = calculatePoPaymentSnapshot(totalSnapshotBefore.totalAmount, totalSnapshotBefore.paidAmount + amount);
        nextPoStatus = derivePoLifecycleFromPaymentStatus(poStatus, nextSnapshot.paymentStatus);
        nextAction = derivePurchaseNextAction({
          ...order,
          po_status: nextPoStatus,
          payment_status: nextSnapshot.paymentStatus,
          balance_due: nextSnapshot.balanceDue,
        });
        await dbRunAsync(
          `UPDATE purchase_orders
           SET po_status = ?,
               payment_status = ?,
               paid_amount = ?,
               balance_due = ?,
               last_payment_at = CURRENT_TIMESTAMP,
               next_action = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [nextPoStatus, nextSnapshot.paymentStatus, nextSnapshot.paidAmount, nextSnapshot.balanceDue, nextAction, req.params.id]
        );
      });
  
      if (nextPoStatus !== poStatus) {
        await recordPurchaseOrderStatusHistoryAsync(req.params.id, {
          fromStatus: poStatus,
          toStatus: nextPoStatus,
          note: 'Payment recorded for purchase order',
          billNumber: order.bill_number || order.invoice_number || null,
          paymentStatus: nextSnapshot.paymentStatus,
          balanceDue: nextSnapshot.balanceDue,
          createdBy: req.body?.created_by || req?.authUser?.id || null,
        });
      }
  
      await logAdminAuditAsync(req, {
        action: 'purchase_order.payment_add',
        entityType: 'purchase_order',
        entityId: req.params.id,
        details: {
          amount,
          payment_mode: paymentMode,
          reference,
          payment_id: paymentId,
          payment_status: nextSnapshot.paymentStatus,
          paid_amount: nextSnapshot.paidAmount,
          balance_due: nextSnapshot.balanceDue,
        },
      });
  
      return res.status(201).json({
        success: true,
        payment_id: paymentId,
        po_status: nextPoStatus,
        payment_status: nextSnapshot.paymentStatus,
        paid_amount: nextSnapshot.paidAmount,
        balance_due: nextSnapshot.balanceDue,
      });
    } catch (error) {
      if (clientRequestId && isUniqueViolationError(error)) {
        const existing = await dbGetAsync(
          `SELECT id FROM purchase_order_payments WHERE client_request_id = ? LIMIT 1`,
          [clientRequestId]
        );
        if (existing) {
          return res.status(200).json({
            success: true,
            deduplicated: true,
            payment_id: Number(existing.id || 0),
          });
        }
      }
      return res.status(500).json({ error: error.message });
    }
  });
  
  app.post('/api/purchase-orders/:id/receive', requireAdmin, async (req, res) => {
    try {
      const order = await dbGetAsync(`SELECT * FROM purchase_orders WHERE id = ?`, [req.params.id]);
      if (!order) return res.status(404).json({ error: 'Purchase order not found' });
      const poStatus = getPurchaseOrderLifecycleStatus(order);
      if (!canPoReceiveInventory(poStatus)) {
        return res.status(400).json({ error: 'Only confirmed purchase orders can receive inventory' });
      }
      const b = req.body || {};
      const items = Array.isArray(b.items) ? b.items : [];
      const shouldApplyStockOnReceive = Number(order.stock_applied_on_confirm || 0) !== 1;
      let nextLifecycleStatus = poStatus;
      let nextAction = derivePurchaseNextAction(order);
      const supplierUpdates = [];
      const historyTransactionTs = buildPurchaseTransactionTimestamp(
        order.planned_order_date || order.expected_delivery || order.created_at || new Date().toISOString(),
        new Date()
      );
      await dbTxAsync(async () => {
        for (const it of items) {
          const item = await dbGetAsync(`SELECT * FROM purchase_order_items WHERE id = ? AND order_id = ?`, [it.item_id, req.params.id]);
          if (!item) continue;
          const receivedQty = Math.max(0, Number(it.received_quantity || 0));
          if (receivedQty <= 0) continue;
          const orderedQtyLimit = Math.max(0, Number(item.quantity || 0));
          const newReceived = Math.min(orderedQtyLimit, Number(item.received_quantity || 0) + receivedQty);
          const appliedReceivedQty = Math.max(0, newReceived - Number(item.received_quantity || 0));
          if (appliedReceivedQty <= 0) continue;
          const product = item.product_id
            ? await dbGetAsync(
              `SELECT id, stock, uom, base_unit, conversion_factor FROM products WHERE id = ?`,
              [item.product_id]
            )
            : null;
          const receivedQtyBase = product ? toPurchaseBaseQty(appliedReceivedQty, item.uom, product) : appliedReceivedQty;
          const unitPrice = Math.max(0, Number(it.unit_price || item.unit_price || item.rate || 0));
          const orderedQtyBase = product ? toPurchaseBaseQty(Number(item.quantity || 0), item.uom, product) : Number(item.quantity || 0);
          const gross = orderedQtyBase * unitPrice;
          const discountType = String(item.discount_type || 'percent').toLowerCase() === 'fixed' ? 'fixed' : 'percent';
          const discountValue = Math.max(0, Number(item.discount_value || 0));
          const discountAmountRaw = discountType === 'percent' ? (gross * discountValue) / 100 : discountValue;
          const discountAmount = Math.max(0, Math.min(discountAmountRaw, gross));
          const taxableValue = Math.max(0, gross - discountAmount);
          const gstRate = Math.max(0, Number(item.gst_rate || 0));
          const taxAmount = (taxableValue * gstRate) / 100;
          const lineTotal = taxableValue + taxAmount;
          const unitPriceBeforeDiscount = orderedQtyLimit > 0 ? (gross / orderedQtyLimit) : unitPrice;
          const unitDiscountAmount = orderedQtyLimit > 0 ? (discountAmount / orderedQtyLimit) : 0;
          const unitTaxAmount = orderedQtyLimit > 0 ? (taxAmount / orderedQtyLimit) : 0;
          const unitCostInclTax = orderedQtyLimit > 0 ? (lineTotal / orderedQtyLimit) : 0;
          await dbRunAsync(
            `UPDATE purchase_order_items
             SET received_quantity = ?,
                 unit_price = ?,
                 rate = ?,
                 unit_price_before_discount = ?,
                 unit_discount_amount = ?,
                 tax_rate = ?,
                 unit_tax_amount = ?,
                 unit_cost_incl_tax = ?,
                 line_total_incl_tax = ?,
                 taxable_value = ?,
                 tax_amount = ?,
                 line_total = ?,
                 total = ?
             WHERE id = ?`,
            [
            newReceived,
            unitPrice,
            unitPrice,
            unitPriceBeforeDiscount,
            unitDiscountAmount,
            gstRate,
            unitTaxAmount,
            unitCostInclTax,
            lineTotal,
            taxableValue,
            taxAmount,
            lineTotal,
            lineTotal,
            item.id,
            ]
          );
          if (item.product_id) {
            const historyUpdate = await dbRunAsync(
              `UPDATE product_cost_history
               SET unit_cost_incl_tax = ?, tax_rate = ?, discount_amount = ?
               WHERE po_item_id = ?`,
              [
                Number(unitCostInclTax || 0),
                Number(gstRate || 0),
                Number(unitDiscountAmount || 0),
                item.id,
              ]
            );
            if (Number(historyUpdate?.changes || 0) === 0) {
              await recordProductCostHistoryEntryAsync({
                productId: item.product_id,
                distributorId: order.distributor_id,
                purchaseOrderId: Number(req.params.id || 0),
                purchaseOrderItemId: item.id,
                unitCostInclTax,
                taxRate: gstRate,
                discountAmount: unitDiscountAmount,
                transactionTs: historyTransactionTs,
              });
            }
            supplierUpdates.push({
              product_id: item.product_id,
              unit_cost_incl_tax: unitCostInclTax,
            });
          }
          if (item.product_id && shouldApplyStockOnReceive && product) {
            const before = (await dbGetAsync(`SELECT stock FROM products WHERE id = ?`, [item.product_id]))?.stock || 0;
            await dbRunAsync(`UPDATE products SET stock = stock + ? WHERE id = ?`, [receivedQtyBase, item.product_id]);
            const after = (await dbGetAsync(`SELECT stock FROM products WHERE id = ?`, [item.product_id]))?.stock || 0;
            await logStockLedgerAsync({
              productId: item.product_id,
              transactionType: 'PURCHASE',
              quantityChange: receivedQtyBase,
              previousBalance: before,
              newBalance: after,
              referenceType: 'PO',
              referenceId: String(req.params.id),
              userId: b.received_by || null,
            });
          }
        }
        const totals = await dbGetAsync(
          `SELECT
             COALESCE(SUM(taxable_value), 0) AS subtotal,
             COALESCE(SUM(tax_amount), 0) AS tax_amount,
             COALESCE(SUM(line_total), 0) AS total_amount
           FROM purchase_order_items
           WHERE order_id = ?`,
          [req.params.id]
        );
        const receivePaymentSnapshot = calculatePoPaymentSnapshot(
          Number(totals?.total_amount || 0),
          Number(order.paid_amount || 0)
        );
        nextLifecycleStatus = derivePoLifecycleFromPaymentStatus(poStatus, receivePaymentSnapshot.paymentStatus);
        nextAction = derivePurchaseNextAction({
          ...order,
          status: 'received',
          received_at: new Date().toISOString(),
          po_status: nextLifecycleStatus,
          payment_status: receivePaymentSnapshot.paymentStatus,
          balance_due: receivePaymentSnapshot.balanceDue,
        });
        await dbRunAsync(
          `UPDATE purchase_orders
           SET status = 'received',
               po_status = ?,
               invoice_number = ?,
               subtotal = ?,
               tax_amount = ?,
               total_amount = ?,
               total = ?,
               payment_status = ?,
               paid_amount = ?,
               balance_due = ?,
               received_at = COALESCE(received_at, CURRENT_TIMESTAMP),
               next_action = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            nextLifecycleStatus,
            b.invoice_number || order.invoice_number || null,
            Number(totals?.subtotal || 0),
            Number(totals?.tax_amount || 0),
            Number(totals?.total_amount || 0),
            Number(totals?.total_amount || 0),
            receivePaymentSnapshot.paymentStatus,
            receivePaymentSnapshot.paidAmount,
            receivePaymentSnapshot.balanceDue,
            nextAction,
            req.params.id
          ]
        );
      });
      if (supplierUpdates.length) {
        await upsertSupplierProductsAsync(order.distributor_id, supplierUpdates);
      }
      await recordPurchaseOrderStatusHistoryAsync(req.params.id, {
        fromStatus: poStatus,
        toStatus: nextLifecycleStatus,
        note: 'Inventory received against purchase order',
        billNumber: b.invoice_number || order.invoice_number || order.bill_number || null,
        paymentStatus: order.payment_status,
        balanceDue: Number(order.balance_due || 0),
        createdBy: b.received_by || null,
      });
      await logAdminAuditAsync(req, {
        action: 'purchase_order.receive',
        entityType: 'purchase_order',
        entityId: req.params.id,
        details: {
          items_count: items.length,
          applied_stock_on_receive: shouldApplyStockOnReceive,
        },
      });
      return res.json({ success: true, po_status: nextLifecycleStatus, next_action: nextAction });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  
  app.delete('/api/purchase-orders/:id', requireAdmin, async (req, res) => {
    try {
      const existing = await dbGetAsync(`SELECT id, po_status, status FROM purchase_orders WHERE id = ?`, [req.params.id]);
      if (!existing) return res.status(404).json({ error: 'Purchase order not found' });
      if (!isPoEditableLifecycle(getPurchaseOrderLifecycleStatus(existing))) {
        return res.status(400).json({ error: 'Only prepared, sent, or revised purchase orders can be deleted' });
      }
      await dbRunAsync(`DELETE FROM purchase_order_payments WHERE purchase_order_id = ?`, [req.params.id]);
      await dbRunAsync(`DELETE FROM product_cost_history WHERE po_id = ?`, [req.params.id]);
      await dbRunAsync(`DELETE FROM purchase_order_items WHERE order_id = ?`, [req.params.id]);
      await dbRunAsync(`DELETE FROM purchase_orders WHERE id = ?`, [req.params.id]);
      await logAdminAuditAsync(req, {
        action: 'purchase_order.delete',
        entityType: 'purchase_order',
        entityId: req.params.id,
      });
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  
};

module.exports = { registerPurchaseOrdersRoutes };
