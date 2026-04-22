const registerPurchaseOrdersListReadRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbAllAsync,
    dbGetAsync,
    normalizePoLifecycleStatus,
    normalizePoPaymentStatus,
  } = deps;

  app.get('/api/purchase-orders', requireAdmin, async (req, res) => {
    try {
      const requestedPageSize = Number(req.query?.page_size || req.query?.limit || 0);
      const isPaginated = Number.isFinite(requestedPageSize) && requestedPageSize > 0;
      const pageSize = isPaginated ? Math.max(1, Math.min(100, Math.floor(requestedPageSize))) : 0;
      const page = isPaginated ? Math.max(1, Math.floor(Number(req.query?.page || 1) || 1)) : 1;
      const offset = isPaginated ? (page - 1) * pageSize : 0;
      const includeItems =
        String(req.query?.include_items || '')
          .trim()
          .toLowerCase() === 'true' ||
        (!isPaginated &&
          String(req.query?.include_items || '')
            .trim()
            .toLowerCase() !== 'false');

      let whereSql = ' WHERE 1=1';
      let countSql = `
        SELECT COUNT(*) AS count
        FROM purchase_orders po
        WHERE 1=1
      `;
      const params = [];
      if (req.query.distributor_id) {
        whereSql += ' AND po.distributor_id = ?';
        countSql += ' AND po.distributor_id = ?';
        params.push(req.query.distributor_id);
      }
      if (req.query.status) {
        const lifecycleStatus = normalizePoLifecycleStatus(req.query.status, '');
        if (lifecycleStatus) {
          whereSql += " AND LOWER(COALESCE(po.po_status, po.status, '')) = LOWER(?)";
          countSql += " AND LOWER(COALESCE(po.po_status, po.status, '')) = LOWER(?)";
          params.push(lifecycleStatus);
        } else {
          whereSql += ' AND po.status = ?';
          countSql += ' AND po.status = ?';
          params.push(req.query.status);
        }
      }
      if (req.query.payment_status) {
        whereSql += " AND LOWER(COALESCE(po.payment_status, 'unpaid')) = LOWER(?)";
        countSql += " AND LOWER(COALESCE(po.payment_status, 'unpaid')) = LOWER(?)";
        params.push(normalizePoPaymentStatus(req.query.payment_status));
      }
      if (req.query.start_date) {
        whereSql += ' AND date(po.created_at) >= date(?)';
        countSql += ' AND date(po.created_at) >= date(?)';
        params.push(req.query.start_date);
      }
      if (req.query.end_date) {
        whereSql += ' AND date(po.created_at) <= date(?)';
        countSql += ' AND date(po.created_at) <= date(?)';
        params.push(req.query.end_date);
      }
      let sql = `
        SELECT po.*, d.name as distributor_name, s.name as supplier_name, COALESCE(poi.item_count, 0) AS item_count
        FROM purchase_orders po
        LEFT JOIN distributors d ON d.id = po.distributor_id
        LEFT JOIN suppliers s ON s.id = po.supplier_id
        LEFT JOIN (
          SELECT order_id, COUNT(*) AS item_count
          FROM purchase_order_items
          GROUP BY order_id
        ) poi ON poi.order_id = po.id
        ${whereSql}
        ORDER BY po.created_at DESC
      `;

      let baseRows = [];
      let total = 0;
      if (isPaginated) {
        const totalRow = await dbGetAsync(countSql, params);
        total = Number(totalRow?.count || 0);
        baseRows = await dbAllAsync(`${sql} LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
      } else {
        baseRows = await dbAllAsync(sql, params);
        total = baseRows.length;
      }

      const rows = includeItems
        ? await Promise.all(
            baseRows.map(async (row) => {
              try {
                const items = await dbAllAsync(
                  'SELECT * FROM purchase_order_items WHERE order_id = ?',
                  [row.id]
                );
                return { ...row, item_count: Number(row?.item_count || items.length || 0), items };
              } catch (_) {
                // Keep the list response usable even if one order's item expansion fails.
                return { ...row, item_count: Number(row?.item_count || 0), items: [] };
              }
            })
          )
        : baseRows.map((row) => ({ ...row, item_count: Number(row?.item_count || 0) }));

      if (isPaginated) {
        return res.json({
          items: rows,
          pagination: {
            page,
            page_size: pageSize,
            total,
            total_pages: total > 0 ? Math.ceil(total / pageSize) : 0,
            has_more: offset + rows.length < total,
          },
        });
      }

      return res.json(rows);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerPurchaseOrdersListReadRoutes };
