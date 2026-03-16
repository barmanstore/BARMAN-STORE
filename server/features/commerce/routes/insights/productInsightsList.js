const registerProductInsightsListRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbAllAsync,
    deriveStockoutRisk,
    resolveInsightDateRange,
  } = deps;

  app.get('/api/insights/products', requireAdmin, async (req, res) => {
    try {
      const distributorId = Number(req.query?.distributor_id || 0) || null;
      const category = String(req.query?.category || '').trim();
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
      if (distributorId) {
        filters.push('pch.distributor_id = ?');
        params.push(distributorId);
      }
      if (category) {
        filters.push('(p.category = ? OR p.subcategory = ?)');
        params.push(category, category);
      }

      const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
      const rows = await dbAllAsync(
        `WITH filtered AS (
           SELECT
             pch.id,
             pch.product_id,
             pch.distributor_id,
             pch.unit_cost_incl_tax,
             pch.transaction_ts,
             po.expected_delivery,
             po.received_at,
             po.planned_order_date,
             po.created_at,
             p.name as product_name,
             p.category,
             p.subcategory,
             p.stock
           FROM product_cost_history pch
           INNER JOIN purchase_orders po ON po.id = pch.po_id
           INNER JOIN products p ON p.id = pch.product_id
           ${whereSql}
         ),
         stats AS (
           SELECT
             product_id,
             COUNT(*) as purchase_count,
             AVG(unit_cost_incl_tax) as avg_cost,
             MIN(unit_cost_incl_tax) as min_cost,
             MAX(unit_cost_incl_tax) as max_cost,
             STDDEV_SAMP(unit_cost_incl_tax) as price_volatility,
             MIN(transaction_ts) as first_purchase_at,
             MAX(transaction_ts) as last_purchase_at
           FROM filtered
           GROUP BY product_id
         ),
         latest AS (
           SELECT DISTINCT ON (product_id)
             product_id,
             unit_cost_incl_tax as latest_cost,
             distributor_id as latest_distributor_id,
             transaction_ts as latest_at
           FROM filtered
           ORDER BY product_id, transaction_ts DESC, id DESC
         ),
         prev AS (
           SELECT product_id, unit_cost_incl_tax as previous_cost
           FROM (
             SELECT
               product_id,
               unit_cost_incl_tax,
               ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY transaction_ts DESC, id DESC) as rn
             FROM filtered
           ) ranked
           WHERE rn = 2
         ),
         freq AS (
           SELECT product_id, AVG(gap_days) as avg_days_between
           FROM (
             SELECT
               product_id,
               EXTRACT(EPOCH FROM (transaction_ts - LAG(transaction_ts) OVER (PARTITION BY product_id ORDER BY transaction_ts))) / 86400 as gap_days
             FROM filtered
           ) gaps
           WHERE gap_days IS NOT NULL
           GROUP BY product_id
         ),
         lead AS (
           SELECT product_id,
                  AVG(lead_days) as avg_lead_time,
                  AVG(on_time_flag) as on_time_rate
           FROM (
             SELECT
               product_id,
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
           ) lead_rows
           WHERE lead_days IS NOT NULL
           GROUP BY product_id
         ),
         best_supplier AS (
           SELECT product_id, distributor_id, AVG(unit_cost_incl_tax) as avg_cost
           FROM filtered
           GROUP BY product_id, distributor_id
         ),
         best_supplier_ranked AS (
           SELECT *,
                  ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY avg_cost ASC) as rn
           FROM best_supplier
         ),
         series AS (
           SELECT product_id, ARRAY_AGG(unit_cost_incl_tax ORDER BY transaction_ts DESC, id DESC) as cost_series
           FROM filtered
           GROUP BY product_id
         )
         SELECT
           p.id as product_id,
           p.name as product_name,
           p.category,
           p.subcategory,
           p.stock, p.price, p.mrp,
           stats.purchase_count,
           stats.avg_cost,
           stats.min_cost,
           stats.max_cost,
           stats.price_volatility,
           stats.first_purchase_at,
           stats.last_purchase_at,
           latest.latest_cost,
           latest.latest_distributor_id,
           latest.latest_at,
           prev.previous_cost,
           freq.avg_days_between,
           lead.avg_lead_time,
           lead.on_time_rate,
           best_supplier_ranked.distributor_id as best_distributor_id,
           best_supplier_ranked.avg_cost as best_distributor_avg_cost,
           ld.name as latest_distributor_name,
           bd.name as best_distributor_name,
           series.cost_series
         FROM stats
         INNER JOIN products p ON p.id = stats.product_id
         LEFT JOIN latest ON latest.product_id = stats.product_id
         LEFT JOIN prev ON prev.product_id = stats.product_id
         LEFT JOIN freq ON freq.product_id = stats.product_id
         LEFT JOIN lead ON lead.product_id = stats.product_id
         LEFT JOIN best_supplier_ranked ON best_supplier_ranked.product_id = stats.product_id AND best_supplier_ranked.rn = 1
         LEFT JOIN distributors ld ON ld.id = latest.latest_distributor_id
         LEFT JOIN distributors bd ON bd.id = best_supplier_ranked.distributor_id
         LEFT JOIN series ON series.product_id = stats.product_id
         ORDER BY stats.last_purchase_at DESC NULLS LAST, p.name ASC`,
        params
      );

      const payload = (rows || []).map((row) => {
        const latestCost = Number(row.latest_cost || 0);
        const previousCost = Number(row.previous_cost || 0);
        const costDelta = previousCost ? latestCost - previousCost : null;
        const costDeltaPct = previousCost ? (costDelta / previousCost) * 100 : null;
        const rawSeries = Array.isArray(row.cost_series)
          ? row.cost_series
          : (typeof row.cost_series === 'string' && row.cost_series.startsWith('{')
            ? row.cost_series.slice(1, -1).split(',')
            : []);
        const costSeries = rawSeries
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value))
          .slice(0, 12)
          .reverse();
        const avgDaysBetween = row.avg_days_between === null ? null : Number(row.avg_days_between || 0);
        const sellingPrice = row.price == null ? null : Number(row.price || 0);
        const mrpPrice = row.mrp == null ? null : Number(row.mrp || 0);
        const effectivePrice = sellingPrice != null && sellingPrice > 0 ? sellingPrice : (mrpPrice != null && mrpPrice > 0 ? mrpPrice : null);
        const marginAmount = effectivePrice != null && latestCost > 0 ? (effectivePrice - latestCost) : null;
        const marginPct = marginAmount != null && latestCost > 0 ? (marginAmount / latestCost) * 100 : null;
        const stockLevel = row.stock === null || row.stock === undefined ? null : Number(row.stock || 0);
        return {
          product_id: Number(row.product_id || 0),
          product_name: row.product_name,
          category: row.category,
          subcategory: row.subcategory,
          stock: stockLevel,
          price: sellingPrice,
          mrp: mrpPrice,
          margin_amount: marginAmount,
          margin_pct: marginPct,
          latest_cost: latestCost || null,
          latest_distributor_id: row.latest_distributor_id ? Number(row.latest_distributor_id) : null,
          latest_distributor_name: row.latest_distributor_name || null,
          latest_at: row.latest_at || null,
          previous_cost: previousCost || null,
          cost_change: costDelta,
          cost_change_pct: costDeltaPct,
          avg_cost: row.avg_cost === null ? null : Number(row.avg_cost || 0),
          min_cost: row.min_cost === null ? null : Number(row.min_cost || 0),
          max_cost: row.max_cost === null ? null : Number(row.max_cost || 0),
          price_volatility: row.price_volatility === null ? null : Number(row.price_volatility || 0),
          purchase_count: Number(row.purchase_count || 0),
          avg_days_between: avgDaysBetween,
          avg_lead_time: row.avg_lead_time === null ? null : Number(row.avg_lead_time || 0),
          on_time_rate: row.on_time_rate === null ? null : Number(row.on_time_rate || 0),
          best_distributor_id: row.best_distributor_id ? Number(row.best_distributor_id) : null,
          best_distributor_name: row.best_distributor_name || null,
          best_distributor_avg_cost: row.best_distributor_avg_cost === null ? null : Number(row.best_distributor_avg_cost || 0),
          stockout_risk: deriveStockoutRisk(avgDaysBetween, stockLevel),
          cost_series: costSeries,
        };
      });

      return res.json(payload);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerProductInsightsListRoutes };
