const {
  loadActiveOffers,
  decorateProductWithOffers,
} = require('../../../offers/offerEngine');

const registerProductListRoutes = (deps) => {
  const {
    app,
    dbAllAsync,
    dbGetAsync,
    normalizeProductRecord,
    setProductsListCacheHeaders,
    sendJsonWithOptionalCompression,
  } = deps;

  app.get('/api/products', async (req, res) => {
    try {
      const qName = String(req.query?.name || '').trim();
      const qCategory = String(req.query?.category || '').trim();
      const qLowStock = String(req.query?.low_stock || '').trim();
      const qInStock = String(req.query?.in_stock || '').trim();
      const includeInactive = String(req.query?.include_inactive || '').trim() === 'true';
      const status = String(req.query?.status || '').trim().toLowerCase();
      const sort = String(req.query?.sort || '').trim().toLowerCase();
      const requestedPageSize = Number(req.query?.page_size || req.query?.limit || 0);
      const isPaginated = Number.isFinite(requestedPageSize) && requestedPageSize > 0;
      const pageSize = isPaginated ? Math.max(1, Math.min(100, Math.floor(requestedPageSize))) : 0;
      const page = isPaginated
        ? Math.max(1, Math.floor(Number(req.query?.page || 1) || 1))
        : 1;
      const offset = isPaginated ? (page - 1) * pageSize : 0;
      const whereClauses = ['1=1'];
      const params = [];
      if (status === 'active') {
        whereClauses.push('COALESCE(is_active, 1) = 1');
      } else if (status === 'inactive') {
        whereClauses.push('COALESCE(is_active, 1) = 0');
      } else if (!includeInactive) {
        whereClauses.push('COALESCE(is_active, 1) = 1');
      }
      if (qName) {
        whereClauses.push(`(
          name LIKE ?
          OR sku LIKE ?
          OR brand LIKE ?
          OR barcode LIKE ?
          OR category LIKE ?
          OR subcategory LIKE ?
          OR content LIKE ?
          OR color LIKE ?
        )`);
        const like = `%${qName}%`;
        params.push(like, like, like, like, like, like, like, like);
      }
      if (qCategory) {
        whereClauses.push('category = ?');
        params.push(qCategory);
      }
      if (qLowStock === 'true') {
        whereClauses.push('stock <= 10');
      }
      if (qInStock === 'true') {
        whereClauses.push('stock > 0');
      }

      const whereSql = whereClauses.join(' AND ');
      let orderSql = ' ORDER BY created_at DESC, id DESC';
      const orderParams = [];
      if (sort === 'price-asc') {
        orderSql = ' ORDER BY price ASC, id DESC';
      } else if (sort === 'price-desc') {
        orderSql = ' ORDER BY price DESC, id DESC';
      } else if (sort === 'stock-desc') {
        orderSql = ' ORDER BY stock DESC, id DESC';
      } else if (sort === 'newest') {
        orderSql = ' ORDER BY created_at DESC, id DESC';
      } else if (sort === 'relevance' && qName) {
        orderSql = ' ORDER BY CASE WHEN LOWER(name) LIKE LOWER(?) THEN 0 ELSE 1 END, LOWER(name) ASC, created_at DESC, id DESC';
        orderParams.push(`${qName}%`);
      }

      const baseSql = `FROM products WHERE ${whereSql}`;
      if (isPaginated) {
        const [totalRow, rows, activeOffers] = await Promise.all([
          dbGetAsync(`SELECT COUNT(*) AS count ${baseSql}`, params),
          dbAllAsync(
            `SELECT * ${baseSql}${orderSql} LIMIT ? OFFSET ?`,
            [...params, ...orderParams, pageSize, offset]
          ),
          loadActiveOffers(dbAllAsync),
        ]);
        const total = Number(totalRow?.count || 0);
        const payload = {
          items: rows.map((row) => decorateProductWithOffers(normalizeProductRecord(row), activeOffers, { offersArePrepared: true })),
          pagination: {
            page,
            page_size: pageSize,
            total,
            total_pages: total > 0 ? Math.ceil(total / pageSize) : 0,
            has_more: offset + rows.length < total,
          },
        };
        setProductsListCacheHeaders(res, {
          isPaginated,
          includeInactive,
          status,
          hasActiveOffers: activeOffers.length > 0,
        });
        return sendJsonWithOptionalCompression(req, res, payload);
      }

      const [rows, activeOffers] = await Promise.all([
        dbAllAsync(`SELECT * ${baseSql}${orderSql}`, [...params, ...orderParams]),
        loadActiveOffers(dbAllAsync),
      ]);
      const payload = rows.map((row) => decorateProductWithOffers(normalizeProductRecord(row), activeOffers, { offersArePrepared: true }));
      setProductsListCacheHeaders(res, {
        isPaginated,
        includeInactive,
        status,
        hasActiveOffers: activeOffers.length > 0,
      });
      return sendJsonWithOptionalCompression(req, res, payload);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerProductListRoutes };
