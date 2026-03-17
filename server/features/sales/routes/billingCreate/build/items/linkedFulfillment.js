const buildLinkedFulfilledRemaining = ({ linkedOrderItems }) => {
  const linkedFulfilledRemainingByProductId = new Map();
  if (!linkedOrderItems.length) return linkedFulfilledRemainingByProductId;

  linkedOrderItems.forEach((item) => {
    const productId = Number(item?.product_id || 0);
    if (!productId) return;
    const requestedQty = Math.max(0, Number(item?.requested_qty || item?.quantity || 0));
    const pendingQty = Math.max(0, Number(item?.pending_qty || 0));
    const fulfilledQty = Math.max(0, requestedQty - pendingQty);
    linkedFulfilledRemainingByProductId.set(
      productId,
      Number(linkedFulfilledRemainingByProductId.get(productId) || 0) + fulfilledQty
    );
  });

  return linkedFulfilledRemainingByProductId;
};

module.exports = { buildLinkedFulfilledRemaining };
