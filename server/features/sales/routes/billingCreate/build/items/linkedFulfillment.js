const buildLinkedFulfilledRemaining = ({ linkedOrderItems }) => {
  const linkedFulfilledRemainingByOrderItemId = new Map();
  const linkedFulfilledRemainingByProductId = new Map();
  if (!linkedOrderItems.length) {
    return {
      byOrderItemId: linkedFulfilledRemainingByOrderItemId,
      byProductId: linkedFulfilledRemainingByProductId,
    };
  }

  linkedOrderItems.forEach((item) => {
    const orderItemId = Number(item?.id || 0);
    const productId = Number(item?.product_id || 0);
    const requestedQty = Math.max(0, Number(item?.requested_qty || item?.quantity || 0));
    const pendingQty = Math.max(0, Number(item?.pending_qty || 0));
    const fulfilledQty = Math.max(0, requestedQty - pendingQty);
    if (orderItemId > 0) {
      linkedFulfilledRemainingByOrderItemId.set(
        orderItemId,
        Number(linkedFulfilledRemainingByOrderItemId.get(orderItemId) || 0) + fulfilledQty
      );
    }
    if (!productId) return;
    linkedFulfilledRemainingByProductId.set(
      productId,
      Number(linkedFulfilledRemainingByProductId.get(productId) || 0) + fulfilledQty
    );
  });

  return {
    byOrderItemId: linkedFulfilledRemainingByOrderItemId,
    byProductId: linkedFulfilledRemainingByProductId,
  };
};

module.exports = { buildLinkedFulfilledRemaining };
