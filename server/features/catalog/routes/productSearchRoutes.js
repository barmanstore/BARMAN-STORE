const registerProductSearchRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    requireAuth,
    dbAllAsync,
    dbGetAsync,
    dbRunAsync,
    logAdminAuditAsync,
    normalizeProductRecord,
    normalizeProductInput,
    validateProductPayload,
    findProductConflictAsync,
    XLSX,
    toProductExportRow,
    PRODUCT_IMPORT_HEADERS,
    PRODUCT_IMPORT_SAMPLE,
    cleanupExpiredImportBatches,
    parseProductFileToRows,
    findExistingProductForImportAsync,
    normalizeTextKey,
    buildProductExactKey,
    crypto,
    createImportBatchChecksum,
    PRODUCT_IMPORT_BATCH_TTL_MS,
    productImportBatches,
    SQL_UPSERT_IMPORT_BATCH,
    applyProductImportBatch,
    zlib,
    clampInt,
    normalizeSearchText,
    PRODUCTS_LIST_PUBLIC_MAX_AGE_SEC,
    PRODUCTS_LIST_PUBLIC_S_MAX_AGE_SEC,
    PRODUCTS_LIST_PUBLIC_STALE_WHILE_REVALIDATE_SEC,
    PRODUCTS_LIST_COMPRESS_MIN_BYTES,
    appendVaryHeader,
    setProductsListCacheHeaders,
    sendJsonWithOptionalCompression,
    toSearchImage,
    hasOwn,
    toNullablePositiveInt,
    normalizeCategoryName,
    normalizeCategoryIcon,
    normalizeCategoryImage,
    toNullableImageDimension,
    isSameParent,
    findCategoryByNameAndParentAsync,
    splitHierarchySegments,
    isCategoryNameUniqueViolation,
    normalizeCategoryRow,
    getCategoryByIdAsync,
    ensureCategoryNodeAsync,
    resolveOrCreateCategoryHierarchyAsync,
    listCategoryRowsWithCountsAsync,
    buildCategoryTree,
    getCategoryAncestryAsync,
    detectParentCycle,
  } = deps;

  app.get('/api/products/image-search', requireAdmin, async (req, res) => {
    try {
      const apiKey = String(process.env.SERPAPI_KEY || '').trim();
      if (!apiKey) {
        return res.status(503).json({ error: 'SERPAPI_KEY is not configured' });
      }

      const query = normalizeSearchText(req.query?.q || req.query?.query || '');
      if (!query) {
        return res.status(400).json({ error: 'Query is required' });
      }
      const limit = clampInt(req.query?.limit, 4, 1, 8);

      const params = new URLSearchParams({
        engine: 'bing_images',
        q: query,
        count: String(limit),
        safeSearch: 'Strict',
        api_key: apiKey,
      });

      const upstream = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
      const payload = await upstream.json().catch(() => ({}));

      if (!upstream.ok) {
        const upstreamError = String(payload?.error || payload?.message || '').trim();
        const status = upstream.status === 429 ? 429 : 502;
        return res.status(status).json({ error: upstreamError || 'Image provider request failed' });
      }

      const rows = Array.isArray(payload?.images_results) ? payload.images_results : [];
      const images = [];
      const seen = new Set();
      for (let i = 0; i < rows.length; i += 1) {
        const mapped = toSearchImage(rows[i], i);
        if (!mapped) continue;
        const dedupeKey = mapped.fullUrl.toLowerCase();
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        images.push(mapped);
        if (images.length >= limit) break;
      }

      return res.json({
        query,
        provider: 'serpapi-bing',
        images,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Image search failed' });
    }
  });

  app.get('/api/products/suggest', async (req, res) => {
    try {
      const query = normalizeSearchText(req.query?.q || req.query?.query || '', 80);
      if (!query || query.length < 2) return res.json({ items: [] });
      const limit = clampInt(req.query?.limit, 8, 1, 12);

      const like = `%${query.toLowerCase()}%`;
      const prefix = `${query.toLowerCase()}%`;
      const rows = await dbAllAsync(
        `SELECT id, name, brand, content, uom, price, mrp, image, stock, category
         FROM products
         WHERE COALESCE(is_active, 1) = 1
           AND (
             LOWER(name) LIKE ?
             OR LOWER(brand) LIKE ?
             OR LOWER(category) LIKE ?
             OR LOWER(subcategory) LIKE ?
           )
         ORDER BY
           CASE
             WHEN LOWER(name) LIKE ? THEN 0
             WHEN LOWER(brand) LIKE ? THEN 1
             ELSE 2
           END,
           LOWER(name) ASC,
           id DESC
         LIMIT ?`,
        [like, like, like, like, prefix, prefix, limit]
      );

      const items = (Array.isArray(rows) ? rows : []).map((row) => {
        const normalized = normalizeProductRecord(row);
        return {
          id: Number(normalized.id || 0),
          name: String(normalized.name || '').trim() || 'Product',
          brand: String(normalized.brand || '').trim(),
          size: String(normalized.content || normalized.uom || '').trim(),
          price: Number(normalized.price || 0),
          mrp: Number(normalized.mrp || 0),
          image: String(normalized.image || '').trim(),
          category: String(normalized.category || '').trim(),
          stock: Number(normalized.stock || 0),
        };
      });

      return res.json({ items });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to fetch suggestions' });
    }
  });

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
      whereClauses.push(`COALESCE(is_active, 1) = 1`);
    } else if (status === 'inactive') {
      whereClauses.push(`COALESCE(is_active, 1) = 0`);
    } else if (!includeInactive) {
      whereClauses.push(`COALESCE(is_active, 1) = 1`);
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
      whereClauses.push(`category = ?`);
      params.push(qCategory);
    }
    if (qLowStock === 'true') {
      whereClauses.push(`stock <= 10`);
    }
    if (qInStock === 'true') {
      whereClauses.push(`stock > 0`);
    }

    const whereSql = whereClauses.join(' AND ');
    let orderSql = ` ORDER BY created_at DESC, id DESC`;
    const orderParams = [];
    if (sort === 'price-asc') {
      orderSql = ` ORDER BY price ASC, id DESC`;
    } else if (sort === 'price-desc') {
      orderSql = ` ORDER BY price DESC, id DESC`;
    } else if (sort === 'stock-desc') {
      orderSql = ` ORDER BY stock DESC, id DESC`;
    } else if (sort === 'newest') {
      orderSql = ` ORDER BY created_at DESC, id DESC`;
    } else if (sort === 'relevance' && qName) {
      orderSql = ` ORDER BY CASE WHEN LOWER(name) LIKE LOWER(?) THEN 0 ELSE 1 END, LOWER(name) ASC, created_at DESC, id DESC`;
      orderParams.push(`${qName}%`);
    }

    const baseSql = `FROM products WHERE ${whereSql}`;
    if (isPaginated) {
      const totalRow = await dbGetAsync(`SELECT COUNT(*) AS count ${baseSql}`, params);
      const total = Number(totalRow?.count || 0);
      const rows = await dbAllAsync(
        `SELECT * ${baseSql}${orderSql} LIMIT ? OFFSET ?`,
        [...params, ...orderParams, pageSize, offset]
      );
      const payload = {
        items: rows.map(normalizeProductRecord),
        pagination: {
          page,
          page_size: pageSize,
          total,
          total_pages: total > 0 ? Math.ceil(total / pageSize) : 0,
          has_more: offset + rows.length < total,
        },
      };
      setProductsListCacheHeaders(res, { isPaginated, includeInactive, status });
      return sendJsonWithOptionalCompression(req, res, payload);
    }

    const rows = await dbAllAsync(`SELECT * ${baseSql}${orderSql}`, [...params, ...orderParams]);
    const payload = rows.map(normalizeProductRecord);
    setProductsListCacheHeaders(res, { isPaginated, includeInactive, status });
    return sendJsonWithOptionalCompression(req, res, payload);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/recently-bought', requireAuth, async (req, res) => {
  try {
    const userId = Number(req.authUser?.id || 0);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const limit = clampInt(req.query?.limit, 12, 1, 40);
    const rows = await dbAllAsync(
      `SELECT
         oi.product_id,
         MAX(o.created_at) AS last_bought_at,
         COUNT(DISTINCT o.id) AS total_orders,
         COALESCE(SUM(oi.quantity), 0) AS total_qty,
         p.*
       FROM orders o
       INNER JOIN order_items oi ON oi.order_id = o.id
       INNER JOIN products p ON p.id = oi.product_id
       WHERE o.user_id = ?
         AND oi.product_id IS NOT NULL
         AND COALESCE(oi.is_manual, 0) = 0
         AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'rejected')
       GROUP BY oi.product_id, p.id
       ORDER BY MAX(o.created_at) DESC
       LIMIT ?`,
      [userId, limit]
    );
    const payload = rows.map((row) => ({
      product_id: Number(row.product_id || 0),
      last_bought_at: row.last_bought_at,
      total_orders: Number(row.total_orders || 0),
      total_qty: Number(row.total_qty || 0),
      product: normalizeProductRecord(row),
    }));
    return res.json(payload);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch recently bought products' });
  }
});

app.get('/api/products/:id(\\d+)/last-purchase', requireAdmin, async (req, res) => {
  try {
    const productId = Number(req.params.id);
    if (!productId) return res.status(400).json({ error: 'Invalid product id' });

    const row = await dbGetAsync(
      `SELECT
         poi.product_id,
         COALESCE(NULLIF(poi.rate, 0), poi.unit_price, 0) as rate,
         poi.unit_price,
         poi.gst_rate,
         poi.uom,
         po.distributor_id,
         d.name as distributor_name,
         po.po_number,
         po.created_at
       FROM purchase_order_items poi
       INNER JOIN purchase_orders po ON po.id = poi.order_id
       LEFT JOIN distributors d ON d.id = po.distributor_id
       WHERE poi.product_id = ?
       ORDER BY po.created_at DESC, poi.id DESC
       LIMIT 1`,
      [productId]
    );

    if (!row) return res.json({ found: false, product_id: productId });
    return res.json({ found: true, ...row });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/:id(\\d+)', async (req, res) => {
  try {
    const includeInactive = String(req.query?.include_inactive || '').trim() === 'true';
    const product = await dbGetAsync(
      `SELECT * FROM products WHERE id = ? ${includeInactive ? '' : 'AND COALESCE(is_active, 1) = 1'}`,
      [req.params.id]
    );
    if (!product) return res.status(404).json({ error: 'Product not found' });
    return res.json(normalizeProductRecord(product));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/category/:category', async (req, res) => {
  try {
    const includeInactive = String(req.query?.include_inactive || '').trim() === 'true';
    const rows = await dbAllAsync(
      `SELECT * FROM products WHERE category = ? ${includeInactive ? '' : 'AND COALESCE(is_active, 1) = 1'} ORDER BY created_at DESC`,
      [req.params.category]
    );
    return res.json(rows.map(normalizeProductRecord));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

};

module.exports = { registerProductSearchRoutes };

