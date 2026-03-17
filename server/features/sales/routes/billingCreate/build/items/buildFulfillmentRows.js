const buildItemFulfillmentRows = ({
  sanitizedItems,
  productCache,
  linkedOrderId,
  fulfillmentMode,
  linkedFulfilledRemainingByProductId,
  toStockUnitQty,
  fromStockUnitQty,
  roundQty,
}) => {
  return sanitizedItems.map((it) => {
    const requestedQty = Math.max(0, Number(it.qty || 0));
    const productId = Number(it.product_id || 0);
    const product = productId ? productCache.get(productId) : null;
    const stockSnapshotBase = productId ? Math.max(0, Number(product?.stock || 0)) : 0;
    const requestedStockQty = product ? toStockUnitQty(requestedQty, it.unit, product) : requestedQty;
    const stockSnapshot = product ? fromStockUnitQty(stockSnapshotBase, it.unit, product) : stockSnapshotBase;

    if (!productId) {
      return {
        ...it,
        requested_qty: roundQty(requestedQty),
        available_now_qty: roundQty(requestedQty),
        fulfilled_qty: roundQty(requestedQty),
        pending_qty: 0,
        stock_snapshot: roundQty(stockSnapshot),
        requested_stock_qty: roundQty(requestedStockQty),
        fulfilled_stock_qty: roundQty(requestedStockQty),
        pending_stock_qty: 0,
        stock_snapshot_base: roundQty(stockSnapshotBase),
      };
    }
    if (!linkedOrderId) {
      const fulfilledStockQty = Math.min(requestedStockQty, stockSnapshotBase);
      const fulfilledQtyConverted = fromStockUnitQty(fulfilledStockQty, it.unit, product);
      const fulfilledQty = Math.min(requestedQty, fulfilledQtyConverted);
      const pendingQty = Math.max(0, requestedQty - fulfilledQty);
      const pendingStockQty = Math.max(0, requestedStockQty - fulfilledStockQty);
      return {
        ...it,
        requested_qty: roundQty(requestedQty),
        available_now_qty: roundQty(fulfilledQty),
        fulfilled_qty: roundQty(fulfilledQty),
        pending_qty: roundQty(pendingQty),
        stock_snapshot: roundQty(stockSnapshot),
        requested_stock_qty: roundQty(requestedStockQty),
        fulfilled_stock_qty: roundQty(fulfilledStockQty),
        pending_stock_qty: roundQty(pendingStockQty),
        stock_snapshot_base: roundQty(stockSnapshotBase),
      };
    }
    if (fulfillmentMode === 'full_now') {
      return {
        ...it,
        requested_qty: roundQty(requestedQty),
        available_now_qty: roundQty(requestedQty),
        fulfilled_qty: roundQty(requestedQty),
        pending_qty: 0,
        stock_snapshot: roundQty(stockSnapshot),
        requested_stock_qty: roundQty(requestedStockQty),
        fulfilled_stock_qty: roundQty(requestedStockQty),
        pending_stock_qty: 0,
        stock_snapshot_base: roundQty(stockSnapshotBase),
      };
    }
    const fulfilledRemaining = Math.max(0, Number(linkedFulfilledRemainingByProductId.get(productId) || 0));
    const fulfilledQty = Math.min(requestedQty, fulfilledRemaining);
    const pendingQty = Math.max(0, requestedQty - fulfilledQty);
    const fulfilledStockQty = product ? toStockUnitQty(fulfilledQty, it.unit, product) : fulfilledQty;
    const pendingStockQty = Math.max(0, requestedStockQty - fulfilledStockQty);
    linkedFulfilledRemainingByProductId.set(productId, Math.max(0, fulfilledRemaining - fulfilledQty));
    return {
      ...it,
      requested_qty: roundQty(requestedQty),
      available_now_qty: roundQty(fulfilledQty),
      fulfilled_qty: roundQty(fulfilledQty),
      pending_qty: roundQty(pendingQty),
      stock_snapshot: roundQty(stockSnapshot),
      requested_stock_qty: roundQty(requestedStockQty),
      fulfilled_stock_qty: roundQty(fulfilledStockQty),
      pending_stock_qty: roundQty(pendingStockQty),
      stock_snapshot_base: roundQty(stockSnapshotBase),
    };
  });
};

module.exports = { buildItemFulfillmentRows };
