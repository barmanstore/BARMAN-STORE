const applyConfirmStockAdjustments = async (deps, { req, order, stockAlreadyApplied }) => {
  const {
    dbAllAsync,
    dbGetAsync,
    dbRunAsync,
    logStockLedgerAsync,
    toPurchaseBaseQty,
    PURCHASE_STOCK_CAP,
  } = deps;

  const capAdjustments = [];
  if (stockAlreadyApplied) {
    return { capAdjustments };
  }

  const items = await dbAllAsync('SELECT * FROM purchase_order_items WHERE order_id = ?', [
    req.params.id,
  ]);
  for (const item of items) {
    const productId = Number(item.product_id || 0);
    if (!productId) continue;
    const product = await dbGetAsync(
      'SELECT id, stock, uom, base_unit, conversion_factor FROM products WHERE id = ?',
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
      await dbRunAsync('UPDATE products SET stock = ? WHERE id = ?', [finalStock, productId]);
      const noteLines = ['Auto stock update on PO confirmation'];
      if (capHit) {
        noteLines.push(
          `Stock cap ${PURCHASE_STOCK_CAP} applied (intended ${intendedStock}, final ${finalStock})`
        );
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

  return { capAdjustments };
};

module.exports = { applyConfirmStockAdjustments };
