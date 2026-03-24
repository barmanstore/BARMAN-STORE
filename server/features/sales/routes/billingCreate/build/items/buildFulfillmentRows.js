const roundMoney = (value = 0) => Math.round((Number(value) || 0) * 100) / 100;

const buildItemFulfillmentRows = ({
  sanitizedItems,
  productCache,
  linkedOrderId,
  fulfillmentMode,
  linkedFulfilledRemaining,
  toStockUnitQty,
  fromStockUnitQty,
  roundQty,
}) => {
  const linkedFulfilledRemainingByOrderItemId = linkedFulfilledRemaining?.byOrderItemId instanceof Map
    ? linkedFulfilledRemaining.byOrderItemId
    : new Map();
  const linkedFulfilledRemainingByProductId = linkedFulfilledRemaining?.byProductId instanceof Map
    ? linkedFulfilledRemaining.byProductId
    : new Map();

  return sanitizedItems.map((it) => {
    const requestedQty = Math.max(0, Number(it.qty || 0));
    const productId = Number(it.product_id || 0);
    const linkedOrderItemId = Number(it.linked_order_item_id || 0);
    const product = productId ? productCache.get(productId) : null;
    const stockSnapshotBase = productId ? Number(product?.stock || 0) : 0;
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
    const fulfilledRemaining = linkedOrderItemId > 0 && linkedFulfilledRemainingByOrderItemId.has(linkedOrderItemId)
      ? Math.max(0, Number(linkedFulfilledRemainingByOrderItemId.get(linkedOrderItemId) || 0))
      : Math.max(0, Number(linkedFulfilledRemainingByProductId.get(productId) || 0));
    const fulfilledQty = Math.min(requestedQty, fulfilledRemaining);
    const pendingQty = Math.max(0, requestedQty - fulfilledQty);
    const fulfilledStockQty = product ? toStockUnitQty(fulfilledQty, it.unit, product) : fulfilledQty;
    const pendingStockQty = Math.max(0, requestedStockQty - fulfilledStockQty);
    const fulfillmentRatio = requestedQty > 0 ? (fulfilledQty / requestedQty) : 0;
    const scaleMoney = (value = 0) => roundMoney(Math.max(0, Number(value || 0)) * fulfillmentRatio);
    if (linkedOrderItemId > 0 && linkedFulfilledRemainingByOrderItemId.has(linkedOrderItemId)) {
      linkedFulfilledRemainingByOrderItemId.set(
        linkedOrderItemId,
        Math.max(0, fulfilledRemaining - fulfilledQty)
      );
      if (productId > 0 && linkedFulfilledRemainingByProductId.has(productId)) {
        linkedFulfilledRemainingByProductId.set(
          productId,
          Math.max(0, Number(linkedFulfilledRemainingByProductId.get(productId) || 0) - fulfilledQty)
        );
      }
    } else {
      linkedFulfilledRemainingByProductId.set(productId, Math.max(0, fulfilledRemaining - fulfilledQty));
    }
    return {
      ...it,
      qty: roundQty(fulfilledQty),
      line_subtotal: scaleMoney(it.line_subtotal),
      offer_discount: scaleMoney(it.offer_discount),
      manual_discount: scaleMoney(it.manual_discount),
      discount: scaleMoney(it.discount),
      amount: scaleMoney(it.amount),
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
