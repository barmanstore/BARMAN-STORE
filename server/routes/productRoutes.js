const registerProductRoutes = (deps) => {
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
    applyProductImportBatch
  } = deps;

  const clampInt = (value, fallback, min, max) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.round(parsed)));
  };

  const normalizeSearchText = (value, maxLength = 160) => (
    String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength)
  );

  const toSearchImage = (row, index = 0) => {
    const thumbUrl = String(
      row?.thumbnail
      || row?.thumbnail_url
      || row?.image
      || row?.original
      || row?.link
      || ''
    ).trim();
    const fullUrl = String(
      row?.original
      || row?.image
      || row?.link
      || row?.thumbnail
      || ''
    ).trim();
    if (!fullUrl) return null;
    const position = Number(row?.position || 0) || (index + 1);
    return {
      id: `serpapi-bing-${position}`,
      thumbUrl: thumbUrl || fullUrl,
      fullUrl,
      source: 'serpapi-bing',
      title: String(row?.title || row?.source || row?.source_name || `Suggestion ${index + 1}`).trim(),
    };
  };

  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

  const toNullablePositiveInt = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    return parsed;
  };

  const normalizeCategoryName = (value) => String(value || '').trim();
  const normalizeCategoryIcon = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    return raw.slice(0, 32);
  };
  const normalizeCategoryImage = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) return raw.slice(0, 800);
    return null;
  };
  const toNullableImageDimension = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    const rounded = Math.round(parsed);
    if (rounded < 16 || rounded > 4096) return null;
    return rounded;
  };
  const isSameParent = (left, right) => {
    const a = toNullablePositiveInt(left);
    const b = toNullablePositiveInt(right);
    return a === b;
  };

  const findCategoryByNameAndParentAsync = async ({ name, parentId = null, excludeId = null }) => {
    const trimmedName = normalizeCategoryName(name);
    if (!trimmedName) return null;
    const normalizedParentId = toNullablePositiveInt(parentId);
    const normalizedExcludeId = toNullablePositiveInt(excludeId);
    const parentFilter = normalizedParentId == null
      ? `parent_id IS NULL`
      : `parent_id = ?`;
    const parentParams = normalizedParentId == null ? [] : [normalizedParentId];
    const row = await dbGetAsync(
      `SELECT id, name, description, icon, image, image_width, image_height, parent_id, created_at
       FROM categories
       WHERE lower(name) = lower(?)
         AND ${parentFilter}
         ${normalizedExcludeId ? 'AND id <> ?' : ''}
       LIMIT 1`,
      normalizedExcludeId
        ? [trimmedName, ...parentParams, normalizedExcludeId]
        : [trimmedName, ...parentParams]
    );
    return row ? normalizeCategoryRow(row) : null;
  };

  const splitHierarchySegments = (value) => (
    String(value || '')
      .split('->')
      .map((part) => normalizeCategoryName(part))
      .filter(Boolean)
  );
  const isCategoryNameUniqueViolation = (error) => {
    const message = String(error?.message || '').toLowerCase();
    if (!message) return false;
    return (
      message.includes('uq_categories_parent_name_ci')
      || (
        message.includes('duplicate key')
        && message.includes('categories')
      )
    );
  };

  const normalizeCategoryRow = (row) => ({
    ...row,
    id: Number(row?.id || 0),
    parent_id: row?.parent_id == null ? null : Number(row.parent_id),
    icon: normalizeCategoryIcon(row?.icon),
    image: normalizeCategoryImage(row?.image),
    image_width: toNullableImageDimension(row?.image_width),
    image_height: toNullableImageDimension(row?.image_height),
    product_count: Number(row?.product_count || 0),
    total_product_count: Number(row?.total_product_count || 0),
  });

  const getCategoryByIdAsync = async (id) => {
    if (!Number.isInteger(Number(id)) || Number(id) <= 0) return null;
    const row = await dbGetAsync(
      `SELECT id, name, description, icon, image, image_width, image_height, parent_id, created_at
       FROM categories
       WHERE id = ?`,
      [Number(id)]
    );
    return row ? normalizeCategoryRow(row) : null;
  };

  const ensureCategoryNodeAsync = async ({ name, parentId = null, description = null }) => {
    const trimmedName = normalizeCategoryName(name);
    if (!trimmedName) return null;
    const normalizedParentId = toNullablePositiveInt(parentId);
    const existing = await findCategoryByNameAndParentAsync({
      name: trimmedName,
      parentId: normalizedParentId,
    });
    if (existing) return existing;
    const inserted = await dbRunAsync(
      `INSERT INTO categories (name, description, parent_id)
       VALUES (?, ?, ?)`,
      [trimmedName, description || null, normalizedParentId]
    );
    const created = await dbGetAsync(
      `SELECT id, name, description, icon, image, image_width, image_height, parent_id, created_at
       FROM categories
       WHERE id = ?`,
      [inserted.lastInsertRowid]
    );
    return created ? normalizeCategoryRow(created) : null;
  };

  const resolveOrCreateCategoryHierarchyAsync = async ({ category, subcategory }) => {
    const categorySegments = splitHierarchySegments(category);
    const subcategorySegments = splitHierarchySegments(subcategory);

    let fullPath = [];
    if (categorySegments.length === 0 && subcategorySegments.length === 0) {
      fullPath = ['Groceries'];
    } else if (categorySegments.length === 0) {
      fullPath = ['Groceries', ...subcategorySegments];
    } else if (subcategorySegments.length === 0) {
      fullPath = categorySegments;
    } else if (categorySegments.length === 1) {
      // Legacy payloads commonly send category root + subcategory path separately.
      fullPath = [categorySegments[0], ...subcategorySegments];
    } else {
      // If category already contains a full path, keep it authoritative.
      fullPath = categorySegments;
    }

    const rootName = normalizeCategoryName(fullPath[0]) || 'Groceries';
    const rootNode = await ensureCategoryNodeAsync({
      name: rootName,
      parentId: null,
      description: 'Product category',
    });

    let leafNode = rootNode;
    const subPathNames = [];
    for (const segment of fullPath.slice(1)) {
      const childNode = await ensureCategoryNodeAsync({
        name: segment,
        parentId: leafNode?.id || null,
        description: 'Product subcategory',
      });
      if (!childNode) continue;
      subPathNames.push(String(childNode.name || '').trim());
      leafNode = childNode;
    }

    return {
      categoryName: rootName,
      subcategoryName: subPathNames.length ? subPathNames.join(' -> ') : null,
      categoryId: Number(leafNode?.id || rootNode?.id || 0) || null,
    };
  };

  const listCategoryRowsWithCountsAsync = async () => (
    await dbAllAsync(
      `SELECT
         c.id,
         c.name,
         c.description,
         c.icon,
         c.image,
         c.image_width,
         c.image_height,
         c.parent_id,
         c.created_at,
         p.name AS parent_name,
         COALESCE(pc.direct_count, 0) AS product_count
       FROM categories c
       LEFT JOIN categories p ON p.id = c.parent_id
       LEFT JOIN (
         SELECT category_id, COUNT(*) AS direct_count
         FROM products
         WHERE category_id IS NOT NULL
         GROUP BY category_id
       ) pc ON pc.category_id = c.id
       ORDER BY LOWER(c.name) ASC`
    )
  ).map(normalizeCategoryRow);

  const buildCategoryTree = (rows) => {
    const byId = new Map();
    rows.forEach((row) => {
      byId.set(row.id, {
        ...row,
        children: [],
        path: String(row.name || '').trim(),
        total_product_count: Number(row.product_count || 0),
      });
    });

    const roots = [];
    byId.forEach((node) => {
      if (node.parent_id && byId.has(node.parent_id) && node.parent_id !== node.id) {
        byId.get(node.parent_id).children.push(node);
      } else {
        roots.push(node);
      }
    });

    const walk = (node, parentPath = '') => {
      const currentPath = parentPath ? `${parentPath} -> ${node.name}` : String(node.name || '').trim();
      node.path = currentPath;
      node.children.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
      let subtotal = Number(node.product_count || 0);
      node.children.forEach((child) => {
        subtotal += walk(child, currentPath);
      });
      node.total_product_count = subtotal;
      return subtotal;
    };

    roots.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
    roots.forEach((node) => walk(node, ''));
    return roots;
  };

  const getCategoryAncestryAsync = async (categoryId) => {
    let currentId = toNullablePositiveInt(categoryId);
    const seen = new Set();
    const chain = [];
    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      const node = await getCategoryByIdAsync(currentId);
      if (!node) break;
      chain.unshift(node);
      currentId = node.parent_id;
    }
    return chain;
  };

  const detectParentCycle = (rows, sourceId, nextParentId) => {
    if (!nextParentId) return false;
    const rowMap = new Map(rows.map((row) => [Number(row.id), row]));
    const visited = new Set();
    let cursor = Number(nextParentId);
    while (cursor && !visited.has(cursor)) {
      if (cursor === Number(sourceId)) return true;
      visited.add(cursor);
      const row = rowMap.get(cursor);
      cursor = row?.parent_id == null ? 0 : Number(row.parent_id);
    }
    return false;
  };

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
      return res.json({
        items: rows.map(normalizeProductRecord),
        pagination: {
          page,
          page_size: pageSize,
          total,
          total_pages: total > 0 ? Math.ceil(total / pageSize) : 0,
          has_more: offset + rows.length < total,
        },
      });
    }

    const rows = await dbAllAsync(`SELECT * ${baseSql}${orderSql}`, [...params, ...orderParams]);
    return res.json(rows.map(normalizeProductRecord));
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

app.post('/api/products', requireAdmin, async (req, res) => {
  try {
    const body = normalizeProductInput(req.body || {});
    const errors = validateProductPayload(body);
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });
    const duplicate = await findProductConflictAsync(body);
    if (duplicate) {
      const allowIdentical = Boolean(req.body?.allow_identical);
      if (duplicate.severity === 'confirm' && allowIdentical) {
        // allowed by explicit user choice
      } else {
        return res.status(409).json({
          error: duplicate.message,
          field: duplicate.field,
          conflict_type: duplicate.conflict_type,
          conflict: duplicate
        });
      }
    }
    const categoryResolution = await resolveOrCreateCategoryHierarchyAsync({
      category: body.category || 'Groceries',
      subcategory: body.subcategory || null,
    });
    const result = await dbRunAsync(
      `INSERT INTO products
      (name, description, brand, sub_brand, content, color, price, mrp, uom, base_unit, uom_type, conversion_factor, sku, barcode, image, stock, category, subcategory, category_id, expiry_date, default_discount, discount_type, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.name,
        body.description || null,
        body.brand || null,
        body.sub_brand || null,
        body.content || null,
        body.color || null,
        Number(body.price || 0),
        body.mrp != null ? Number(body.mrp) : Number(body.price || 0),
        body.uom || 'pcs',
        body.base_unit || body.uom || 'pcs',
        body.uom_type || 'selling',
        Number(body.conversion_factor || 1),
        body.sku,
        body.barcode,
        body.image || null,
        Number(body.stock || 0),
        categoryResolution.categoryName,
        categoryResolution.subcategoryName || null,
        categoryResolution.categoryId,
        body.expiry_date || null,
        Number(body.default_discount || 0),
        body.discount_type || 'fixed',
        Number(body.is_active ?? 1),
      ]
    );
    return res.status(201).json(normalizeProductRecord(await dbGetAsync(`SELECT * FROM products WHERE id = ?`, [result.lastInsertRowid])));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/products/:id(\\d+)', requireAdmin, async (req, res) => {
  try {
    const current = await dbGetAsync(`SELECT * FROM products WHERE id = ?`, [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Product not found' });
    const body = normalizeProductInput(req.body || {}, current);
    const errors = validateProductPayload(body);
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });
    if (Number(current.is_active ?? 1) !== 1) {
      body.is_active = 1;
    }
    const duplicate = await findProductConflictAsync(body, { excludeId: req.params.id });
    if (duplicate) {
      const allowIdentical = Boolean(req.body?.allow_identical);
      if (duplicate.severity === 'confirm' && allowIdentical) {
        // allowed by explicit user choice
      } else {
        return res.status(409).json({
          error: duplicate.message,
          field: duplicate.field,
          conflict_type: duplicate.conflict_type,
          conflict: duplicate
        });
      }
    }
    const categoryResolution = await resolveOrCreateCategoryHierarchyAsync({
      category: body.category || current.category || 'Groceries',
      subcategory: body.subcategory ?? current.subcategory ?? null,
    });
    await dbRunAsync(
      `UPDATE products SET
       name=?, description=?, brand=?, sub_brand=?, content=?, color=?, price=?, mrp=?, uom=?, base_unit=?, uom_type=?, conversion_factor=?, sku=?, barcode=?, image=?, stock=?, category=?, subcategory=?, category_id=?, expiry_date=?, default_discount=?, discount_type=?, is_active=?
       WHERE id=?`,
      [
        body.name,
        body.description,
        body.brand,
        body.sub_brand,
        body.content,
        body.color,
        Number(body.price),
        Number(body.mrp),
        body.uom,
        body.base_unit || body.uom || 'pcs',
        body.uom_type || 'selling',
        Number(body.conversion_factor || 1),
        body.sku,
        body.barcode,
        body.image,
        Number(body.stock),
        categoryResolution.categoryName,
        categoryResolution.subcategoryName,
        categoryResolution.categoryId,
        body.expiry_date,
        Number(body.default_discount || 0),
        body.discount_type || 'fixed',
        Number(body.is_active ?? 1),
        req.params.id,
      ]
    );
    return res.json(normalizeProductRecord(await dbGetAsync(`SELECT * FROM products WHERE id = ?`, [req.params.id])));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.patch('/api/products/:id(\\d+)/category', requireAdmin, async (req, res) => {
  try {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: 'Invalid product id' });
    }
    const categoryId = toNullablePositiveInt(req.body?.category_id);
    if (!categoryId) {
      return res.status(400).json({ error: 'category_id is required' });
    }

    const current = await dbGetAsync(`SELECT * FROM products WHERE id = ?`, [productId]);
    if (!current) return res.status(404).json({ error: 'Product not found' });

    const targetCategory = await getCategoryByIdAsync(categoryId);
    if (!targetCategory) return res.status(404).json({ error: 'Target category not found' });

    const ancestry = await getCategoryAncestryAsync(categoryId);
    if (!ancestry.length) {
      return res.status(400).json({ error: 'Unable to resolve target category hierarchy' });
    }

    const rootCategory = ancestry[0];
    const childPath = ancestry.slice(1).map((node) => String(node.name || '').trim()).filter(Boolean).join(' -> ');

    await dbRunAsync(
      `UPDATE products
       SET category_id = ?, category = ?, subcategory = ?
       WHERE id = ?`,
      [categoryId, rootCategory.name, childPath || null, productId]
    );

    const updated = await dbGetAsync(`SELECT * FROM products WHERE id = ?`, [productId]);
    await logAdminAuditAsync(req, {
      action: 'product.category_reassign',
      entityType: 'product',
      entityId: productId,
      details: {
        from_category_id: current.category_id || null,
        to_category_id: categoryId,
      },
    });
    return res.json(normalizeProductRecord(updated));
  } catch (error) {
    if (isCategoryNameUniqueViolation(error)) {
      return res.status(409).json({ error: 'Category name already exists' });
    }
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/products/:id(\\d+)', requireAdmin, async (req, res) => {
  try {
    const current = await dbGetAsync(`SELECT * FROM products WHERE id = ?`, [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Product not found' });
    await dbRunAsync(`UPDATE products SET is_active = 0 WHERE id = ?`, [req.params.id]);
    await logAdminAuditAsync(req, {
      action: 'product.deactivate',
      entityType: 'product',
      entityId: req.params.id,
      details: { name: current.name || null },
    });
    return res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

const doesTableExistAsync = async (tableName) => Boolean(
  (await dbGetAsync(
    `SELECT 1 AS ok
     FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_name = ?
     LIMIT 1`,
    [tableName]
  ))?.ok
);

app.delete('/api/products/:id(\\d+)/permanent', requireAdmin, async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const current = await dbGetAsync(`SELECT * FROM products WHERE id = ?`, [productId]);
    if (!current) return res.status(404).json({ error: 'Product not found' });

    const referenceChecks = [
      { table: 'order_items', sql: `SELECT COUNT(*) as count FROM order_items WHERE product_id = ?` },
      { table: 'purchase_order_items', sql: `SELECT COUNT(*) as count FROM purchase_order_items WHERE product_id = ?` },
      { table: 'purchase_return_items', sql: `SELECT COUNT(*) as count FROM purchase_return_items WHERE product_id = ?` },
      { table: 'stock_ledger', sql: `SELECT COUNT(*) as count FROM stock_ledger WHERE product_id = ?` },
      { table: 'batch_stock', sql: `SELECT COUNT(*) as count FROM batch_stock WHERE product_id = ?` },
    ];

    const blockingRefs = [];
    for (const check of referenceChecks) {
      if (!await doesTableExistAsync(check.table)) continue;
      const count = Number((await dbGetAsync(check.sql, [productId]))?.count || 0);
      if (count > 0) blockingRefs.push(`${check.table} (${count})`);
    }
    if (blockingRefs.length) {
      return res.status(409).json({
        error: `Cannot permanently delete product. Referenced in: ${blockingRefs.join(', ')}`,
        references: blockingRefs,
      });
    }

    await dbRunAsync(`DELETE FROM products WHERE id = ?`, [productId]);
    await logAdminAuditAsync(req, {
      action: 'product.permanent_delete',
      entityType: 'product',
      entityId: productId,
      details: { name: current.name || null },
    });
    return res.json({ success: true, message: 'Product permanently deleted' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/template', requireAdmin, async (req, res) => {
  try {
    const format = String(req.query?.format || 'csv').trim().toLowerCase();
    const rows = [PRODUCT_IMPORT_SAMPLE];
    if (format === 'xlsx' || format === 'xls') {
      const sheet = XLSX.utils.json_to_sheet(rows, { header: PRODUCT_IMPORT_HEADERS });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, 'Products');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="products-template.xlsx"');
      return res.send(buffer);
    }
    const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows, { header: PRODUCT_IMPORT_HEADERS }));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="products-template.csv"');
    return res.send(`\uFEFF${csv}`);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/export', requireAdmin, async (req, res) => {
  try {
    const format = String(req.query?.format || 'csv').trim().toLowerCase();
    const includeInactive = String(req.query?.include_inactive || '').trim() === 'true';
    const rows = (await dbAllAsync(
      `SELECT * FROM products ${includeInactive ? '' : 'WHERE COALESCE(is_active,1)=1'} ORDER BY created_at DESC`
    )).map(toProductExportRow);
    if (format === 'xlsx' || format === 'xls') {
      const sheet = XLSX.utils.json_to_sheet(rows, { header: PRODUCT_IMPORT_HEADERS });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, 'Products');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="products-export-${new Date().toISOString().slice(0, 10)}.xlsx"`);
      return res.send(buffer);
    }
    const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows, { header: PRODUCT_IMPORT_HEADERS }));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="products-export-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(`\uFEFF${csv}`);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/products/import/preview', requireAdmin, async (req, res) => {
  try {
    cleanupExpiredImportBatches();
    const mode = String(req.body?.mode || 'upsert').trim().toLowerCase();
    const stockMode = String(req.body?.stock_mode || 'replace').trim().toLowerCase();
    if (!['create_only', 'update_only', 'upsert'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode. Use create_only, update_only or upsert' });
    }
    if (!['replace', 'delta'].includes(stockMode)) {
      return res.status(400).json({ error: 'Invalid stock_mode. Use replace or delta' });
    }

    const rows = parseProductFileToRows({
      fileName: req.body?.file_name,
      fileContentBase64: req.body?.file_content_base64,
    });

    const normalizedRows = [];
    const preview = [];
    let creates = 0;
    let updates = 0;
    let skips = 0;
    let errors = 0;
    let needsConfirmation = 0;
    const seenInBatch = {
      productIds: new Map(),
      sku: new Map(),
      barcode: new Map(),
      identity: new Map(),
    };

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const rowNo = index + 2;
      const existing = await findExistingProductForImportAsync(row);
      const action = existing ? 'update' : 'create';
      const normalized = normalizeProductInput(
        {
          ...row,
          stock: stockMode === 'delta' && existing
            ? Number(existing.stock || 0) + Number(row.stock || 0)
            : row.stock,
        },
        existing || null
      );
      const rowErrors = validateProductPayload(normalized);

      if (mode === 'create_only' && existing) rowErrors.push('Row matches existing product but mode is create_only');
      if (mode === 'update_only' && !existing) rowErrors.push('Row does not match an existing product but mode is update_only');
      const duplicate = await findProductConflictAsync(normalized, { excludeId: existing?.id || null });
      let requiresIdenticalConfirmation = false;
      let warnings = [];
      if (duplicate) {
        if (duplicate.severity === 'confirm') {
          requiresIdenticalConfirmation = true;
          warnings = [duplicate.message];
        } else {
          rowErrors.push(duplicate.message);
        }
      }

      const matchedId = existing?.id ? Number(existing.id) : null;
      if (matchedId) {
        const seenProductRow = seenInBatch.productIds.get(matchedId);
        if (seenProductRow) rowErrors.push(`Duplicate update target in import file (also row ${seenProductRow})`);
      }
      const skuKey = normalizeTextKey(normalized.sku);
      if (skuKey) {
        const seenSkuRow = seenInBatch.sku.get(skuKey);
        if (seenSkuRow) rowErrors.push(`Duplicate SKU in import file (also row ${seenSkuRow})`);
      }
      const barcodeKey = normalizeTextKey(normalized.barcode);
      if (barcodeKey) {
        const seenBarcodeRow = seenInBatch.barcode.get(barcodeKey);
        if (seenBarcodeRow) rowErrors.push(`Duplicate barcode in import file (also row ${seenBarcodeRow})`);
      }
      const identityKey = buildProductExactKey(normalized);
      if (identityKey) {
        const seenIdentityRow = seenInBatch.identity.get(identityKey);
        if (seenIdentityRow) rowErrors.push(`Exact duplicate in import file (also row ${seenIdentityRow})`);
      }

      if (rowErrors.length) {
        errors += 1;
        preview.push({ row: rowNo, action, status: 'error', errors: rowErrors, matched_product_id: existing?.id || null });
        return;
      }

      if (matchedId) seenInBatch.productIds.set(matchedId, rowNo);
      if (skuKey) seenInBatch.sku.set(skuKey, rowNo);
      if (barcodeKey) seenInBatch.barcode.set(barcodeKey, rowNo);
      if (identityKey) seenInBatch.identity.set(identityKey, rowNo);

      normalizedRows.push({
        row: rowNo,
        action,
        matched_product_id: existing?.id || null,
        payload: normalized,
        barcode: normalized.barcode,
        requires_identical_confirmation: requiresIdenticalConfirmation,
      });

      if (action === 'create') creates += 1;
      if (action === 'update') updates += 1;
      if (requiresIdenticalConfirmation) {
        needsConfirmation += 1;
      }
      preview.push({
        row: rowNo,
        action,
        status: requiresIdenticalConfirmation ? 'needs_confirmation' : 'ready',
        errors: [],
        warnings,
        matched_product_id: existing?.id || null
      });
    }

    if (!normalizedRows.length) {
      return res.status(400).json({
        error: 'No valid rows found in import file',
        preview,
      });
    }

    const batchId = crypto.randomUUID();
    const checksum = createImportBatchChecksum(normalizedRows, mode, stockMode);
    const createdAt = Date.now();
    const expiresAt = createdAt + PRODUCT_IMPORT_BATCH_TTL_MS;

    const batchPayload = {
      mode,
      stockMode,
      rows: normalizedRows,
      createdBy: req.authUser?.id || null,
      createdAt,
      expiresAt,
    };
    productImportBatches.set(batchId, {
      ...batchPayload,
      checksum,
    });
    await dbRunAsync(SQL_UPSERT_IMPORT_BATCH, [
      batchId,
      'products',
      req.authUser?.id || null,
      JSON.stringify(batchPayload),
      checksum,
      errors ? 'staged_with_errors' : 'staged',
      expiresAt,
    ]);

    const responsePayload = {
      batch_id: batchId,
      checksum,
      expires_at: new Date(expiresAt).toISOString(),
      summary: {
        creates,
        updates,
        skips,
        errors,
        needs_confirmation: needsConfirmation,
      },
      preview,
    };

    if (Boolean(req.body?.auto_confirm)) {
      const applied = await applyProductImportBatch({
        batchId,
        checksum,
        authUser: req.authUser,
      });
      responsePayload.auto_confirmed = true;
      responsePayload.apply_result = applied.result;
      responsePayload.notification = {
        type: 'success',
        title: 'Product import completed',
        message: `Created ${applied.result.created}, updated ${applied.result.updated}, failed ${applied.result.failed}`,
      };
    }

    return res.json(responsePayload);
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }
});

app.post('/api/products/import/confirm', requireAdmin, async (req, res) => {
  try {
    const applied = await applyProductImportBatch({
      batchId: req.body?.batch_id,
      checksum: req.body?.checksum,
      authUser: req.authUser,
      allowIdenticalRows: req.body?.allow_identical_rows,
    });
    return res.json({
      success: true,
      ...applied.result,
      notification: {
        type: 'success',
        title: 'Product import completed',
        message: `Created ${applied.result.created}, updated ${applied.result.updated}, failed ${applied.result.failed}`,
      },
    });
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }
});

app.get('/api/categories', async (req, res) => {
  try {
    const includeAll = String(req.query?.scope || '').trim().toLowerCase() === 'all';
    let rows = await listCategoryRowsWithCountsAsync();
    if (!includeAll) {
      rows = rows.filter((row) => row.parent_id == null);
    }
    return res.json(rows);
  } catch (error) {
    if (isCategoryNameUniqueViolation(error)) {
      return res.status(409).json({ error: 'Category name already exists' });
    }
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/categories/tree', async (_, res) => {
  try {
    const rows = await listCategoryRowsWithCountsAsync();
    return res.json(buildCategoryTree(rows));
  } catch (error) {
    if (isCategoryNameUniqueViolation(error)) {
      return res.status(409).json({ error: 'A sibling category with this name already exists in the target parent' });
    }
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/categories/:id(\\d+)', async (req, res) => {
  try {
    const category = await getCategoryByIdAsync(req.params.id);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    return res.json(category);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/categories/:id(\\d+)/products', requireAdmin, async (req, res) => {
  try {
    const categoryId = toNullablePositiveInt(req.params.id);
    if (!categoryId) return res.status(400).json({ error: 'Invalid category id' });
    const category = await getCategoryByIdAsync(categoryId);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    const includeInactive = String(req.query?.include_inactive || '').trim() === 'true';
    const rows = await dbAllAsync(
      `SELECT *
       FROM products
       WHERE category_id = ? ${includeInactive ? '' : 'AND COALESCE(is_active, 1) = 1'}
       ORDER BY name ASC, id DESC`,
      [categoryId]
    );
    return res.json(rows.map(normalizeProductRecord));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/categories', requireAdmin, async (req, res) => {
  try {
    const name = normalizeCategoryName(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Category name is required' });
    const icon = normalizeCategoryIcon(req.body?.icon);
    const image = normalizeCategoryImage(req.body?.image);
    const imageWidth = toNullableImageDimension(req.body?.image_width ?? req.body?.imageWidth);
    const imageHeight = toNullableImageDimension(req.body?.image_height ?? req.body?.imageHeight);

    let parentId = null;
    if (hasOwn(req.body, 'parent_id')) {
      const rawParent = req.body?.parent_id;
      if (rawParent !== null && rawParent !== '') {
        parentId = toNullablePositiveInt(rawParent);
        if (!parentId) return res.status(400).json({ error: 'parent_id must be a positive integer or null' });
      }
    }

    if (parentId) {
      const parent = await getCategoryByIdAsync(parentId);
      if (!parent) return res.status(404).json({ error: 'Parent category not found' });
    }

    const duplicate = await findCategoryByNameAndParentAsync({ name, parentId });
    if (duplicate) return res.status(409).json({ error: 'Category name already exists' });

    const result = await dbRunAsync(
      `INSERT INTO categories (name, description, icon, image, image_width, image_height, parent_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        req.body?.description == null ? null : (String(req.body.description).trim() || null),
        icon,
        image,
        image ? imageWidth : null,
        image ? imageHeight : null,
        parentId,
      ]
    );
    return res.status(201).json(await getCategoryByIdAsync(result.lastInsertRowid));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/categories/:id(\\d+)', requireAdmin, async (req, res) => {
  try {
    const categoryId = toNullablePositiveInt(req.params.id);
    if (!categoryId) return res.status(400).json({ error: 'Invalid category id' });
    const current = await getCategoryByIdAsync(categoryId);
    if (!current) return res.status(404).json({ error: 'Category not found' });

    const nextName = hasOwn(req.body, 'name')
      ? normalizeCategoryName(req.body?.name)
      : normalizeCategoryName(current.name);
    if (!nextName) return res.status(400).json({ error: 'Category name is required' });

    let nextParentId = current.parent_id == null ? null : Number(current.parent_id);
    if (hasOwn(req.body, 'parent_id')) {
      const rawParent = req.body?.parent_id;
      if (rawParent === null || rawParent === '') {
        nextParentId = null;
      } else {
        nextParentId = toNullablePositiveInt(rawParent);
        if (!nextParentId) return res.status(400).json({ error: 'parent_id must be a positive integer or null' });
      }
    }
    if (nextParentId === categoryId) {
      return res.status(400).json({ error: 'A category cannot be its own parent' });
    }

    if (nextParentId) {
      const parent = await getCategoryByIdAsync(nextParentId);
      if (!parent) return res.status(404).json({ error: 'Parent category not found' });
      const allRows = await dbAllAsync(`SELECT id, parent_id FROM categories`);
      if (detectParentCycle(allRows, categoryId, nextParentId)) {
        return res.status(400).json({ error: 'Cannot move category inside its own subtree' });
      }
    }

    const duplicate = await findCategoryByNameAndParentAsync({
      name: nextName,
      parentId: nextParentId,
      excludeId: categoryId,
    });
    if (duplicate) return res.status(409).json({ error: 'Category name already exists' });

    const nextDescription = hasOwn(req.body, 'description')
      ? (req.body?.description == null ? null : (String(req.body.description).trim() || null))
      : current.description;
    const nextIcon = hasOwn(req.body, 'icon')
      ? normalizeCategoryIcon(req.body?.icon)
      : normalizeCategoryIcon(current.icon);
    const nextImage = hasOwn(req.body, 'image')
      ? normalizeCategoryImage(req.body?.image)
      : normalizeCategoryImage(current.image);
    const nextImageWidthInput = hasOwn(req.body, 'image_width') || hasOwn(req.body, 'imageWidth')
      ? req.body?.image_width ?? req.body?.imageWidth
      : current.image_width;
    const nextImageHeightInput = hasOwn(req.body, 'image_height') || hasOwn(req.body, 'imageHeight')
      ? req.body?.image_height ?? req.body?.imageHeight
      : current.image_height;
    const nextImageWidth = nextImage ? toNullableImageDimension(nextImageWidthInput) : null;
    const nextImageHeight = nextImage ? toNullableImageDimension(nextImageHeightInput) : null;

    await dbRunAsync(
      `UPDATE categories
       SET name = ?, description = ?, icon = ?, image = ?, image_width = ?, image_height = ?, parent_id = ?
       WHERE id = ?`,
      [nextName, nextDescription, nextIcon, nextImage, nextImageWidth, nextImageHeight, nextParentId, categoryId]
    );
    return res.json(await getCategoryByIdAsync(categoryId));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/categories/:id(\\d+)/move', requireAdmin, async (req, res) => {
  try {
    const categoryId = toNullablePositiveInt(req.params.id);
    if (!categoryId) return res.status(400).json({ error: 'Invalid category id' });
    const current = await getCategoryByIdAsync(categoryId);
    if (!current) return res.status(404).json({ error: 'Category not found' });

    const rawParent = req.body?.parent_id;
    let nextParentId = null;
    if (rawParent !== null && rawParent !== '') {
      nextParentId = toNullablePositiveInt(rawParent);
      if (!nextParentId) return res.status(400).json({ error: 'parent_id must be a positive integer or null' });
    }
    if (nextParentId === categoryId) return res.status(400).json({ error: 'A category cannot be its own parent' });
    if (nextParentId) {
      const parent = await getCategoryByIdAsync(nextParentId);
      if (!parent) return res.status(404).json({ error: 'Parent category not found' });
    }
    const allRows = await dbAllAsync(`SELECT id, parent_id FROM categories`);
    if (detectParentCycle(allRows, categoryId, nextParentId)) {
      return res.status(400).json({ error: 'Cannot move category inside its own subtree' });
    }
    if (!isSameParent(current.parent_id, nextParentId)) {
      const duplicate = await findCategoryByNameAndParentAsync({
        name: current.name,
        parentId: nextParentId,
        excludeId: categoryId,
      });
      if (duplicate) {
        return res.status(409).json({ error: 'A sibling category with this name already exists in the target parent' });
      }
    }

    await dbRunAsync(`UPDATE categories SET parent_id = ? WHERE id = ?`, [nextParentId, categoryId]);
    return res.json(await getCategoryByIdAsync(categoryId));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/categories/:id(\\d+)', requireAdmin, async (req, res) => {
  try {
    const categoryId = toNullablePositiveInt(req.params.id);
    if (!categoryId) return res.status(400).json({ error: 'Invalid category id' });
    const current = await getCategoryByIdAsync(categoryId);
    if (!current) return res.status(404).json({ error: 'Category not found' });

    const childrenCount = Number((await dbGetAsync(`SELECT COUNT(*) AS count FROM categories WHERE parent_id = ?`, [categoryId]))?.count || 0);
    const directProductsCount = Number((await dbGetAsync(`SELECT COUNT(*) AS count FROM products WHERE category_id = ?`, [categoryId]))?.count || 0);
    const legacyProductsCount = Number((await dbGetAsync(
      `SELECT COUNT(*) AS count
       FROM products
       WHERE category_id IS NULL
         AND (lower(category) = lower(?) OR lower(COALESCE(subcategory, '')) = lower(?))`,
      [current.name, current.name]
    ))?.count || 0);

    if (childrenCount > 0 || directProductsCount > 0 || legacyProductsCount > 0) {
      return res.status(409).json({
        error: 'Cannot delete category with child categories or linked products',
        details: {
          children: childrenCount,
          direct_products: directProductsCount,
          legacy_products: legacyProductsCount,
        },
      });
    }

    await dbRunAsync(`DELETE FROM categories WHERE id = ?`, [categoryId]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});
};

module.exports = {
  registerProductRoutes,
};
