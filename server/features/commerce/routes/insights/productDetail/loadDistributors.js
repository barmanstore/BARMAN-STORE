const loadProductDistributorInsights = async ({ dbAllAsync, productId }) => {
  const distributorRows = await dbAllAsync(
    `SELECT
       pch.distributor_id,
       d.name as distributor_name,
       COUNT(*) as purchase_count,
       AVG(pch.unit_cost_incl_tax) as avg_cost,
       MIN(pch.unit_cost_incl_tax) as min_cost,
       MAX(pch.unit_cost_incl_tax) as max_cost,
       MAX(pch.transaction_ts) as last_purchase_at,
       STDDEV_SAMP(pch.unit_cost_incl_tax) as price_volatility
     FROM product_cost_history pch
     LEFT JOIN distributors d ON d.id = pch.distributor_id
     WHERE pch.product_id = ?
     GROUP BY pch.distributor_id, d.name
     ORDER BY avg_cost ASC NULLS LAST`,
    [productId]
  );

  const supplierRows = await dbAllAsync(
    `SELECT sp.*, d.name as distributor_name
     FROM supplier_products sp
     LEFT JOIN distributors d ON d.id = sp.distributor_id
     WHERE sp.product_id = ?`,
    [productId]
  );

  const supplierById = new Map();
  for (const supplier of supplierRows || []) {
    supplierById.set(Number(supplier.distributor_id || 0), supplier);
  }

  const distributors = (distributorRows || []).map((row) => {
    const supplier = supplierById.get(Number(row.distributor_id || 0));
    return {
      distributor_id: Number(row.distributor_id || 0),
      distributor_name: row.distributor_name || supplier?.distributor_name || null,
      purchase_count: Number(row.purchase_count || 0),
      avg_cost: row.avg_cost === null ? null : Number(row.avg_cost || 0),
      min_cost: row.min_cost === null ? null : Number(row.min_cost || 0),
      max_cost: row.max_cost === null ? null : Number(row.max_cost || 0),
      last_purchase_at: row.last_purchase_at || null,
      price_volatility: row.price_volatility === null ? null : Number(row.price_volatility || 0),
      is_available: supplier?.is_available ?? null,
      lead_time_days: supplier?.lead_time_days ?? null,
      min_order_qty: supplier?.min_order_qty ?? null,
      last_known_unit_cost_incl_tax: supplier?.last_known_unit_cost_incl_tax ?? null,
      availability_note: supplier?.availability_note ?? null,
      supplier_last_updated_at: supplier?.last_updated_at ?? null,
    };
  });

  return { distributors };
};

module.exports = { loadProductDistributorInsights };
