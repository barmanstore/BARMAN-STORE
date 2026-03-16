const zlib = require('zlib');
const { registerProductSearchRoutes } = require('./routes/productSearchRoutes');
const { registerProductAdminRoutes } = require('./routes/productAdminRoutes');
const { registerProductImportRoutes } = require('./routes/productImportRoutes');
const { registerCategoryRoutes } = require('./routes/categoryRoutes');

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
  const PRODUCTS_LIST_PUBLIC_MAX_AGE_SEC = clampInt(
    process.env.PRODUCTS_LIST_PUBLIC_MAX_AGE_SEC,
    20,
    0,
    3600
  );
  const PRODUCTS_LIST_PUBLIC_S_MAX_AGE_SEC = clampInt(
    process.env.PRODUCTS_LIST_PUBLIC_S_MAX_AGE_SEC,
    120,
    0,
    86400
  );
  const PRODUCTS_LIST_PUBLIC_STALE_WHILE_REVALIDATE_SEC = clampInt(
    process.env.PRODUCTS_LIST_PUBLIC_STALE_WHILE_REVALIDATE_SEC,
    180,
    0,
    86400
  );
  const PRODUCTS_LIST_COMPRESS_MIN_BYTES = clampInt(
    process.env.PRODUCTS_LIST_COMPRESS_MIN_BYTES,
    1024,
    256,
    64 * 1024
  );
  const appendVaryHeader = (res, headerName) => {
    const key = String(headerName || '').trim();
    if (!key) return;
    const existing = String(res.getHeader('Vary') || '').trim();
    if (!existing) {
      res.setHeader('Vary', key);
      return;
    }
    const parts = existing.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean);
    if (parts.includes(key.toLowerCase())) return;
    res.setHeader('Vary', `${existing}, ${key}`);
  };
  const setProductsListCacheHeaders = (res, options = {}) => {
    const {
      isPaginated = false,
      includeInactive = false,
      status = ''
    } = options;
    const normalizedStatus = String(status || '').trim().toLowerCase();
    const cacheablePublicListing = isPaginated && !includeInactive && normalizedStatus !== 'inactive';
    if (cacheablePublicListing) {
      res.setHeader(
        'Cache-Control',
        `public, max-age=${PRODUCTS_LIST_PUBLIC_MAX_AGE_SEC}, s-maxage=${PRODUCTS_LIST_PUBLIC_S_MAX_AGE_SEC}, stale-while-revalidate=${PRODUCTS_LIST_PUBLIC_STALE_WHILE_REVALIDATE_SEC}`
      );
      return;
    }
    res.setHeader('Cache-Control', 'private, no-store');
  };
  const sendJsonWithOptionalCompression = (req, res, payload) => {
    const json = JSON.stringify(payload);
    const rawBuffer = Buffer.from(json, 'utf8');
    const acceptEncoding = String(req.headers['accept-encoding'] || '').toLowerCase();
    const supportsBrotli = acceptEncoding.includes('br');
    const supportsGzip = acceptEncoding.includes('gzip');
    appendVaryHeader(res, 'Accept-Encoding');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (rawBuffer.length < PRODUCTS_LIST_COMPRESS_MIN_BYTES || (!supportsBrotli && !supportsGzip)) {
      return res.send(rawBuffer);
    }
    try {
      let compressedBuffer = null;
      let encoding = '';
      if (supportsBrotli) {
        compressedBuffer = zlib.brotliCompressSync(rawBuffer, {
          params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: 4,
          }
        });
        encoding = 'br';
      } else if (supportsGzip) {
        compressedBuffer = zlib.gzipSync(rawBuffer, { level: 6 });
        encoding = 'gzip';
      }
      if (!compressedBuffer || compressedBuffer.length >= rawBuffer.length) {
        return res.send(rawBuffer);
      }
      res.setHeader('Content-Encoding', encoding);
      return res.send(compressedBuffer);
    } catch (_) {
      return res.send(rawBuffer);
    }
  };

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


  const routeDeps = {
    ...deps,
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
  };

  registerProductSearchRoutes(routeDeps);
  registerProductAdminRoutes(routeDeps);
  registerProductImportRoutes(routeDeps);
  registerCategoryRoutes(routeDeps);
};

module.exports = { registerProductRoutes };
