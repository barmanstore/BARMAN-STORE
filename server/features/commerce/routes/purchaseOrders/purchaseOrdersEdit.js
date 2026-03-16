const registerPurchaseOrdersEditRoutes = (deps) => {
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
    getDistributorByIdAsync,
    getPurchaseOrderLifecycleStatus,
    isPoEditableLifecycle,
    logAdminAuditAsync,
    normalizePurchaseOrderItems,
    normalizeTransactionDate,
    recordProductCostHistoryEntryAsync,
    recordPurchaseOrderStatusHistoryAsync,
    syncDistributorProductsSuppliedAsync,
    upsertSupplierProductsAsync,
    PO_LIFECYCLE_REVISED,
    PO_LIFECYCLE_SENT,
    derivePurchaseNextAction,
  } = deps;

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
      const plannedOrderDate = normalizeTransactionDate(
        b.planned_order_date || updatedExpectedDelivery || cur.planned_order_date || cur.expected_delivery || cur.created_at
      ) || new Date().toISOString().slice(0, 10);
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
};

module.exports = { registerPurchaseOrdersEditRoutes };
