const fetchProductCostHistory = async ({ dbAllAsync, productId, startDate, endExclusive }) => {
  let historySql = `
    SELECT
      pch.*,
      d.name as distributor_name,
      po.po_number,
      po.planned_order_date,
      po.expected_delivery,
      po.received_at,
      po.created_at
    FROM product_cost_history pch
    LEFT JOIN distributors d ON d.id = pch.distributor_id
    LEFT JOIN purchase_orders po ON po.id = pch.po_id
    WHERE pch.product_id = ?`;
  const historyParams = [productId];
  if (startDate) {
    historySql += ' AND pch.transaction_ts >= ?';
    historyParams.push(startDate);
  }
  if (endExclusive) {
    historySql += ' AND pch.transaction_ts < ?';
    historyParams.push(endExclusive);
  }
  historySql += ' ORDER BY pch.transaction_ts DESC, pch.id DESC';

  return dbAllAsync(historySql, historyParams);
};

module.exports = { fetchProductCostHistory };
