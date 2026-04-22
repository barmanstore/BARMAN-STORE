const buildSalesStockSnapshot = ({ billType, linkedOrderId, itemFulfillmentRows }) => {
  const salesQtyByProduct = new Map();
  const shouldApplySalesStock = billType === 'sales' && !linkedOrderId;
  if (!shouldApplySalesStock) {
    return { shouldApplySalesStock, salesQtyByProduct };
  }

  itemFulfillmentRows.forEach((it) => {
    if (!it.product_id) return;
    const fulfilledStockQty = Math.max(0, Number(it.fulfilled_stock_qty ?? it.fulfilled_qty ?? 0));
    if (fulfilledStockQty <= 0) return;
    salesQtyByProduct.set(
      it.product_id,
      Number(salesQtyByProduct.get(it.product_id) || 0) + fulfilledStockQty
    );
  });

  return { shouldApplySalesStock, salesQtyByProduct };
};

module.exports = { buildSalesStockSnapshot };
