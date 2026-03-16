const registerDistributorInsightsRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbAllAsync,
    resolveInsightDateRange,
  } = deps;

  app.get('/api/insights/distributors', requireAdmin, async (req, res) => {
    try {
      const { startDate, endExclusive } = resolveInsightDateRange({
        startDate: req.query?.start_date || req.query?.date_from || null,
        endDate: req.query?.end_date || req.query?.date_to || null,
      });

      const filters = [`COALESCE(LOWER(po.po_status), '') <> 'cancelled'`];
      const params = [];
      if (startDate) {
        filters.push('pch.transaction_ts >= ?');
        params.push(startDate);
      }
      if (endExclusive) {
        filters.push('pch.transaction_ts < ?');
        params.push(endExclusive);
      }

      const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
      const rows = await dbAllAsync(
        `WITH filtered AS (
           SELECT
             pch.distributor_id,
             pch.product_id,
             pch.unit_cost_incl_tax,
             pch.transaction_ts,
             po.expected_delivery,
             po.received_at,
             po.planned_order_date,
             po.created_at
           FROM product_cost_history pch
           INNER JOIN purchase_orders po ON po.id = pch.po_id
           ${whereSql}
         ),
         scored AS (
           SELECT
             distributor_id,
             product_id,
             unit_cost_incl_tax,
             CASE
               WHEN received_at IS NULL THEN NULL
               ELSE EXTRACT(EPOCH FROM (received_at - COALESCE(planned_order_date, created_at))) / 86400
             END as lead_days,
             CASE
               WHEN received_at IS NOT NULL AND expected_delivery IS NOT NULL
                 THEN CASE WHEN received_at <= expected_delivery THEN 1 ELSE 0 END
               ELSE NULL
             END as on_time_flag
           FROM filtered
         )
         SELECT
           d.id as distributor_id,
           d.name as distributor_name,
           COUNT(*) as purchase_count,
           COUNT(DISTINCT product_id) as product_count,
           AVG(unit_cost_incl_tax) as avg_cost,
           MIN(unit_cost_incl_tax) as min_cost,
           MAX(unit_cost_incl_tax) as max_cost,
           STDDEV_SAMP(unit_cost_incl_tax) as price_volatility,
           AVG(lead_days) as avg_lead_time,
           AVG(on_time_flag) as on_time_rate
         FROM scored
         LEFT JOIN distributors d ON d.id = scored.distributor_id
         GROUP BY d.id, d.name
         ORDER BY avg_cost ASC NULLS LAST, d.name ASC`,
        params
      );

      const payload = (rows || []).map((row) => ({
        distributor_id: Number(row.distributor_id || 0),
        distributor_name: row.distributor_name || null,
        purchase_count: Number(row.purchase_count || 0),
        product_count: Number(row.product_count || 0),
        avg_cost: row.avg_cost === null ? null : Number(row.avg_cost || 0),
        min_cost: row.min_cost === null ? null : Number(row.min_cost || 0),
        max_cost: row.max_cost === null ? null : Number(row.max_cost || 0),
        price_volatility: row.price_volatility === null ? null : Number(row.price_volatility || 0),
        avg_lead_time: row.avg_lead_time === null ? null : Number(row.avg_lead_time || 0),
        on_time_rate: row.on_time_rate === null ? null : Number(row.on_time_rate || 0),
      }));

      return res.json(payload);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/insights/distributors/:id(\\d+)/products', requireAdmin, async (req, res) => {
    try {
      const distributorId = Number(req.params.id || 0);
      if (!distributorId) return res.status(400).json({ error: 'Invalid distributor id' });

      const rows = await dbAllAsync(
        `SELECT
           p.id as product_id,
           p.name as product_name,
           p.category,
           p.subcategory,
           COUNT(*) as purchase_count,
           AVG(pch.unit_cost_incl_tax) as avg_cost,
           MIN(pch.unit_cost_incl_tax) as min_cost,
           MAX(pch.unit_cost_incl_tax) as max_cost,
           MAX(pch.transaction_ts) as last_purchase_at
         FROM product_cost_history pch
         INNER JOIN products p ON p.id = pch.product_id
         WHERE pch.distributor_id = ?
         GROUP BY p.id, p.name, p.category, p.subcategory
         ORDER BY avg_cost ASC NULLS LAST, p.name ASC`,
        [distributorId]
      );

      const supplierRows = await dbAllAsync(
        `SELECT * FROM supplier_products WHERE distributor_id = ?`,
        [distributorId]
      );
      const supplierByProduct = new Map();
      for (const row of supplierRows || []) {
        supplierByProduct.set(Number(row.product_id || 0), row);
      }

      const payload = (rows || []).map((row) => {
        const supplier = supplierByProduct.get(Number(row.product_id || 0));
        return {
          product_id: Number(row.product_id || 0),
          product_name: row.product_name,
          category: row.category,
          subcategory: row.subcategory,
          purchase_count: Number(row.purchase_count || 0),
          avg_cost: row.avg_cost === null ? null : Number(row.avg_cost || 0),
          min_cost: row.min_cost === null ? null : Number(row.min_cost || 0),
          max_cost: row.max_cost === null ? null : Number(row.max_cost || 0),
          last_purchase_at: row.last_purchase_at || null,
          is_available: supplier?.is_available ?? null,
          lead_time_days: supplier?.lead_time_days ?? null,
          min_order_qty: supplier?.min_order_qty ?? null,
          last_known_unit_cost_incl_tax: supplier?.last_known_unit_cost_incl_tax ?? null,
          availability_note: supplier?.availability_note ?? null,
          supplier_last_updated_at: supplier?.last_updated_at ?? null,
        };
      });

      return res.json(payload);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerDistributorInsightsRoutes };
