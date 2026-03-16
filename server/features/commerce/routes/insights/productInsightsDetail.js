const registerProductInsightsDetailRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbAllAsync,
    dbGetAsync,
    computeAverageDays,
    computeAverageGapDays,
    computeStdDev,
    deriveStockoutRisk,
    resolveInsightDateRange,
  } = deps;

  app.get('/api/insights/products/:id(\\d+)', requireAdmin, async (req, res) => {
    try {
      const productId = Number(req.params.id || 0);
      if (!productId) return res.status(400).json({ error: 'Invalid product id' });

      const { startDate, endExclusive } = resolveInsightDateRange({
        startDate: req.query?.start_date || req.query?.date_from || null,
        endDate: req.query?.end_date || req.query?.date_to || null,
      });

      const product = await dbGetAsync(`SELECT * FROM products WHERE id = ?`, [productId]);
      if (!product) return res.status(404).json({ error: 'Product not found' });

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
        historySql += ` AND pch.transaction_ts >= ?`;
        historyParams.push(startDate);
      }
      if (endExclusive) {
        historySql += ` AND pch.transaction_ts < ?`;
        historyParams.push(endExclusive);
      }
      historySql += ` ORDER BY pch.transaction_ts DESC, pch.id DESC`;

      const historyRows = await dbAllAsync(historySql, historyParams);
      const costValues = historyRows.map((row) => Number(row.unit_cost_incl_tax || 0)).filter((value) => Number.isFinite(value));
      const timestamps = historyRows.map((row) => row.transaction_ts).filter(Boolean);
      const avgDaysBetween = computeAverageGapDays(timestamps);
      const priceVolatility = computeStdDev(costValues);

      const latestEntry = historyRows[0] || null;
      const previousEntry = historyRows[1] || null;
      const latestCost = latestEntry ? Number(latestEntry.unit_cost_incl_tax || 0) : null;
      const previousCost = previousEntry ? Number(previousEntry.unit_cost_incl_tax || 0) : null;
      const costDelta = previousCost ? latestCost - previousCost : null;
      const costDeltaPct = previousCost ? (costDelta / previousCost) * 100 : null;

      const leadTimes = historyRows
        .map((row) => {
          if (!row.received_at) return null;
          const orderAnchor = row.planned_order_date || row.created_at;
          if (!orderAnchor) return null;
          const diff = new Date(row.received_at).getTime() - new Date(orderAnchor).getTime();
          return Number.isFinite(diff) ? diff / 86400000 : null;
        })
        .filter((value) => Number.isFinite(value));
      const avgLeadTime = computeAverageDays(leadTimes);
      const onTimeRate = (() => {
        const evaluated = historyRows.filter((row) => row.received_at && row.expected_delivery);
        if (!evaluated.length) return null;
        const onTime = evaluated.filter((row) => new Date(row.received_at) <= new Date(row.expected_delivery)).length;
        return onTime / evaluated.length;
      })();

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

      const bestSupplier = (() => {
        const available = distributors.filter((entry) => entry.is_available !== false);
        if (!available.length) return null;
        const costCandidates = available
          .map((entry) => Number(entry.avg_cost ?? entry.last_known_unit_cost_incl_tax ?? 0))
          .filter((value) => value > 0);
        const minCost = costCandidates.length ? Math.min(...costCandidates) : null;
        const leadCandidates = available
          .map((entry) => Number(entry.lead_time_days || 0))
          .filter((value) => value > 0);
        const minLead = leadCandidates.length ? Math.min(...leadCandidates) : null;
        let best = null;
        let bestScore = -1;
        for (const entry of available) {
          const costBasis = Number(entry.avg_cost ?? entry.last_known_unit_cost_incl_tax ?? 0) || (minCost || 0);
          const costScore = minCost && costBasis ? minCost / costBasis : 0.6;
          const leadBasis = Number(entry.lead_time_days || 0) || (minLead || 0);
          const leadScore = minLead && leadBasis ? minLead / leadBasis : 0.4;
          const availabilityScore = entry.is_available === false ? 0 : 1;
          const score = (0.6 * costScore) + (0.25 * leadScore) + (0.15 * availabilityScore);
          if (score > bestScore) {
            bestScore = score;
            best = { ...entry, score };
          }
        }
        return best;
      })();

      return res.json({
        product,
        latest_cost: latestCost,
        previous_cost: previousCost,
        cost_change: costDelta,
        cost_change_pct: costDeltaPct,
        purchase_count: historyRows.length,
        avg_days_between: avgDaysBetween,
        avg_lead_time: avgLeadTime,
        on_time_rate: onTimeRate,
        price_volatility: priceVolatility,
        stockout_risk: deriveStockoutRisk(avgDaysBetween, product?.stock),
        history: historyRows,
        distributors,
        best_supplier: bestSupplier,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerProductInsightsDetailRoutes };
