const applyReceivedItems = async (deps, {
  req,
  order,
  items,
  shouldApplyStockOnReceive,
  historyTransactionTs,
}) => {
  const {
    dbGetAsync,
    dbRunAsync,
    logStockLedgerAsync,
    recordProductCostHistoryEntryAsync,
    toPurchaseBaseQty,
  } = deps;

  const supplierUpdates = [];

  for (const it of items) {
    const item = await dbGetAsync('SELECT * FROM purchase_order_items WHERE id = ? AND order_id = ?', [it.item_id, req.params.id]);
    if (!item) continue;
    const receivedQty = Math.max(0, Number(it.received_quantity || 0));
    if (receivedQty <= 0) continue;
    const orderedQtyLimit = Math.max(0, Number(item.quantity || 0));
    const newReceived = Math.min(orderedQtyLimit, Number(item.received_quantity || 0) + receivedQty);
    const appliedReceivedQty = Math.max(0, newReceived - Number(item.received_quantity || 0));
    if (appliedReceivedQty <= 0) continue;
    const product = item.product_id
      ? await dbGetAsync(
        'SELECT id, stock, uom, base_unit, conversion_factor FROM products WHERE id = ?',
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
      const before = (await dbGetAsync('SELECT stock FROM products WHERE id = ?', [item.product_id]))?.stock || 0;
      await dbRunAsync('UPDATE products SET stock = stock + ? WHERE id = ?', [receivedQtyBase, item.product_id]);
      const after = (await dbGetAsync('SELECT stock FROM products WHERE id = ?', [item.product_id]))?.stock || 0;
      await logStockLedgerAsync({
        productId: item.product_id,
        transactionType: 'PURCHASE',
        quantityChange: receivedQtyBase,
        previousBalance: before,
        newBalance: after,
        referenceType: 'PO',
        referenceId: String(req.params.id),
        userId: req.body?.received_by || null,
      });
    }
  }

  return { supplierUpdates };
};

module.exports = { applyReceivedItems };
