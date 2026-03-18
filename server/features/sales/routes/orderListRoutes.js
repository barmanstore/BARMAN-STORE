const registerOrderListRoutes = (deps) => {
  const {
    app,
    requireCapability,
    dbAllAsync,
    dbGetAsync,
    normalizeOrderStatus,
    ORDER_STATUS_ORDERED,
    normalizeOrderPaymentStatus,
    parseOrderAddress,
  } = deps;

  const mapOrderRecord = (order) => ({
    ...order,
    status: normalizeOrderStatus(order?.status, ORDER_STATUS_ORDERED),
    payment_method: 'cash',
    payment_status: normalizeOrderPaymentStatus(order?.payment_status, order?.status),
    shipping_address: parseOrderAddress(order?.shipping_address),
  });

  app.get('/api/orders', requireCapability('view_backoffice', 'Backoffice access required'), async (req, res) => {
    try {
      const query = String(req.query?.q || '').trim();
      const wantsPaginated = ['1', 'true', 'yes'].includes(String(req.query?.paginated || '').trim().toLowerCase());
      const page = Math.max(1, Number.parseInt(req.query?.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, Number.parseInt(req.query?.limit, 10) || 50));
      const offset = (page - 1) * limit;
      const searchClause = query
        ? `WHERE (
            CAST(o.id AS TEXT) LIKE ?
            OR o.order_number LIKE ?
            OR o.customer_name LIKE ?
            OR o.customer_email LIKE ?
            OR o.status LIKE ?
            OR CAST(o.total_amount AS TEXT) LIKE ?
            OR CAST(b.id AS TEXT) LIKE ?
            OR b.bill_number LIKE ?
          )`
        : '';
      const searchParams = query
        ? Array.from({ length: 8 }, () => `%${query}%`)
        : [];
      const baseQuery = `
        SELECT o.*,
               b.id AS bill_id,
               b.bill_number AS linked_bill_number,
               COALESCE(agg.requested_qty, 0) AS requested_qty,
               COALESCE(agg.available_now_qty, 0) AS available_now_qty,
               COALESCE(agg.fulfilled_qty, 0) AS fulfilled_qty,
               COALESCE(agg.pending_qty, 0) AS pending_qty
        FROM orders o
        LEFT JOIN (
          SELECT order_id,
                 SUM(COALESCE(requested_qty, quantity, 0)) AS requested_qty,
                 SUM(COALESCE(available_now_qty, 0)) AS available_now_qty,
                 SUM(COALESCE(fulfilled_qty, 0)) AS fulfilled_qty,
                 SUM(COALESCE(pending_qty, 0)) AS pending_qty
          FROM order_items
          GROUP BY order_id
        ) agg ON agg.order_id = o.id
        LEFT JOIN bills b ON b.order_id = o.id
        ${searchClause}
        ORDER BY o.created_at DESC
      `;

      if (!wantsPaginated) {
        const rows = await dbAllAsync(baseQuery, searchParams);
        return res.json(rows.map(mapOrderRecord));
      }

      const [items, totalRow] = await Promise.all([
        dbAllAsync(`${baseQuery} LIMIT ? OFFSET ?`, [...searchParams, limit, offset]),
        dbGetAsync(
          `SELECT COUNT(*) AS total
           FROM orders o
           LEFT JOIN bills b ON b.order_id = o.id
           ${searchClause}`,
          searchParams
        ),
      ]);

      return res.json({
        items: items.map(mapOrderRecord),
        page,
        limit,
        total: Number(totalRow?.total || 0),
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerOrderListRoutes };
