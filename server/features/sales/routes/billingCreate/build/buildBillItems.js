const { sanitizeBillItems } = require('./items/sanitizeItems');
const { buildLinkedFulfilledRemaining } = require('./items/linkedFulfillment');
const { buildItemFulfillmentRows } = require('./items/buildFulfillmentRows');
const { buildSalesStockSnapshot } = require('./items/buildSalesStock');

const buildBillItems = async (deps, context, createHttpError) => {
  const {
    toStockUnitQty,
    fromStockUnitQty,
    roundQty,
  } = deps;
  const {
    items,
    billType,
    fulfillmentMode,
    linkedOrderId,
    linkedOrderItems,
  } = context;

  // Explicit custom lines may be billed without product linkage across bill flows.
  const allowLineItemsWithoutProduct = true;
  const { sanitizedItems, productCache } = await sanitizeBillItems({
    deps,
    items,
    createHttpError,
    allowLineItemsWithoutProduct,
  });

  const linkedFulfilledRemainingByProductId = buildLinkedFulfilledRemaining({ linkedOrderItems });

  const itemFulfillmentRows = buildItemFulfillmentRows({
    sanitizedItems,
    productCache,
    linkedOrderId,
    fulfillmentMode,
    linkedFulfilledRemainingByProductId,
    toStockUnitQty,
    fromStockUnitQty,
    roundQty,
  });

  const { shouldApplySalesStock, salesQtyByProduct } = buildSalesStockSnapshot({
    billType,
    linkedOrderId,
    itemFulfillmentRows,
  });

  return {
    itemFulfillmentRows,
    shouldApplySalesStock,
    salesQtyByProduct,
  };
};

module.exports = { buildBillItems };
