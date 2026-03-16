const registerPurchaseOrdersReceiveRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbGetAsync,
    dbRunAsync,
    dbTxAsync,
    buildPurchaseTransactionTimestamp,
    calculatePoPaymentSnapshot,
    canPoReceiveInventory,
    derivePoLifecycleFromPaymentStatus,
    derivePurchaseNextAction,
    getPurchaseOrderLifecycleStatus,
    logAdminAuditAsync,
    logStockLedgerAsync,
    recordProductCostHistoryEntryAsync,
    recordPurchaseOrderStatusHistoryAsync,
    toPurchaseBaseQty,
    upsertSupplierProductsAsync,
  } = deps;

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
};

module.exports = { registerPurchaseOrdersReceiveRoutes };
