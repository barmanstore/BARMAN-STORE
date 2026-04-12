const { loadActiveOffers, decorateProductWithOffers } = require('../../../offers/offerEngine');

const PRODUCT_LIST_PAGE_LIMIT = 100;
const PRODUCT_LIST_MAX_LIMIT = 500;
const PRODUCT_LIST_CURSOR_VERSION = 1;

const buildHierarchyPath = (parent, child) => {
  const root = String(parent || '').trim();
  const leaf = String(child || '').trim();
  if (!root) return '';
  if (!leaf) return root;
  return `${root} -> ${leaf}`;
};

const normalizeQueryText = (value, maxLength = 160) => (
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
);

const escapeLikePattern = (value) => String(value || '').replace(/[\\%_]/g, '\\$&');

const splitHierarchyFilter = (value) => {
  const raw = normalizeQueryText(value);
  if (!raw) return { parent: '', child: '' };
  const parts = raw
    .split(/\s*(?:->|\/)\s*/)
    .map((part) => String(part || '').trim())
    .filter(Boolean);
  if (parts.length === 0) return { parent: '', child: '' };
  if (parts.length === 1) return { parent: parts[0], child: '' };
  return {
    parent: parts[0],
    child: parts.slice(1).join(' -> '),
  };
};

const encodeCursorToken = (payload) => {
  const json = JSON.stringify(payload);
  return Buffer.from(json, 'utf8').toString('base64url');
};

const decodeCursorToken = (token) => {
  const raw = String(token || '').trim();
  if (!raw) return null;
  const json = Buffer.from(raw, 'base64url').toString('utf8');
  const parsed = JSON.parse(json);
  return parsed && typeof parsed === 'object' ? parsed : null;
};

const normalizeSortField = (value) => {
  const raw = String(value || '').trim();
  const aliases = {
    default_discount: 'defaultDiscount',
    defaultdiscount: 'defaultDiscount',
    purchasepacksize: 'purchase_pack_size',
    purchase_pack_size: 'purchase_pack_size',
    purchasePackSize: 'purchase_pack_size',
  };
  if (!raw) return '';
  const normalized = aliases[raw] || raw;
  const lower = normalized.toLowerCase();
  if (lower === 'defaultdiscount') return 'defaultDiscount';
  if (lower === 'purchasepacksize') return 'purchase_pack_size';
  return normalized;
};

const normalizeSortDir = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'asc' || raw === 'ascending') return 'asc';
  if (raw === 'desc' || raw === 'descending') return 'desc';
  return '';
};

const translateLegacySort = (value, searchQuery = '') => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  switch (raw) {
    case 'price-asc':
      return { field: 'price', dir: 'asc' };
    case 'price-desc':
      return { field: 'price', dir: 'desc' };
    case 'stock-desc':
      return { field: 'stock', dir: 'desc' };
    case 'newest':
      return { field: 'created_at', dir: 'desc' };
    case 'relevance':
      return { field: searchQuery ? 'name' : 'created_at', dir: searchQuery ? 'asc' : 'desc' };
    default:
      return null;
  }
};

const PRODUCT_LIST_SORT_SPECS = {
  created_at: {
    expr: "COALESCE(p.created_at, TIMESTAMPTZ '1970-01-01 00:00:00+00')",
    valueFromRow: (row) => (row?.created_at ? new Date(row.created_at).toISOString() : '1970-01-01T00:00:00.000Z'),
  },
  id: {
    expr: 'COALESCE(p.id, 0)',
    valueFromRow: (row) => Number(row?.id || 0),
  },
  name: {
    expr: "LOWER(COALESCE(p.name, ''))",
    valueFromRow: (row) => String(row?.name || '').trim().toLowerCase(),
  },
  brand: {
    expr: "LOWER(TRIM(COALESCE(p.brand, '') || CASE WHEN COALESCE(p.sub_brand, '') = '' THEN '' ELSE ' -> ' || COALESCE(p.sub_brand, '') END))",
    valueFromRow: (row) => buildHierarchyPath(row?.brand, row?.sub_brand).toLowerCase(),
  },
  category: {
    expr: "LOWER(TRIM(COALESCE(p.category, '') || CASE WHEN COALESCE(p.subcategory, '') = '' THEN '' ELSE ' -> ' || COALESCE(p.subcategory, '') END))",
    valueFromRow: (row) => buildHierarchyPath(row?.category, row?.subcategory).toLowerCase(),
  },
  price: {
    expr: 'COALESCE(p.price, 0)',
    valueFromRow: (row) => Number(row?.price || 0),
  },
  mrp: {
    expr: 'COALESCE(p.mrp, 0)',
    valueFromRow: (row) => Number(row?.mrp || 0),
  },
  stock: {
    expr: 'COALESCE(p.stock, 0)',
    valueFromRow: (row) => Number(row?.stock || 0),
  },
  sku: {
    expr: "LOWER(COALESCE(p.sku, ''))",
    valueFromRow: (row) => String(row?.sku || '').trim().toLowerCase(),
  },
  barcode: {
    expr: "LOWER(COALESCE(p.barcode, ''))",
    valueFromRow: (row) => String(row?.barcode || '').trim().toLowerCase(),
  },
  is_active: {
    expr: 'COALESCE(p.is_active, 1)',
    valueFromRow: (row) => Number(row?.is_active ?? 1),
  },
  defaultDiscount: {
    expr: 'COALESCE(p.default_discount, 0)',
    valueFromRow: (row) => Number(row?.default_discount ?? row?.defaultDiscount ?? 0),
  },
  purchase_pack_size: {
    expr: 'COALESCE(p.purchase_pack_size, 0)',
    valueFromRow: (row) => Number(row?.purchase_pack_size ?? 0),
  },
};

const normalizeSortFieldOrThrow = (value) => {
  const normalized = normalizeSortField(value);
  if (!normalized) {
    throw Object.assign(new Error('sort_field is required for catalog paging'), { status: 400 });
  }
  if (!PRODUCT_LIST_SORT_SPECS[normalized]) {
    throw Object.assign(new Error(`Unsupported sort_field: ${value}`), { status: 400 });
  }
  return normalized;
};

const buildCursorFilterSql = (sortField, sortDir, cursorValue, cursorId) => {
  const spec = PRODUCT_LIST_SORT_SPECS[sortField];
  const comparator = sortDir === 'asc' ? '>' : '<';
  const idComparator = comparator;
  const sql = `(${spec.expr} ${comparator} ? OR (${spec.expr} = ? AND p.id ${idComparator} ?))`;
  return {
    sql,
    params: [cursorValue, cursorValue, cursorId],
  };
};

const encodeRowCursor = (row, sortField, sortDir) => {
  const spec = PRODUCT_LIST_SORT_SPECS[sortField];
  return encodeCursorToken({
    v: PRODUCT_LIST_CURSOR_VERSION,
    sort_field: sortField,
    sort_dir: sortDir,
    last_value: spec.valueFromRow(row),
    last_id: Number(row?.id || 0),
  });
};

const buildListResponseMeta = (options = {}) => ({
  page: Math.max(1, Number(options.page || 1)),
  page_size: Math.max(1, Number(options.pageSize || PRODUCT_LIST_PAGE_LIMIT)),
  total_count: options.totalCount == null ? null : Math.max(0, Number(options.totalCount || 0)),
  page_mode: options.pageMode || 'offset',
});

const registerProductListRoutes = (deps) => {
  const {
    app,
    dbAllAsync,
    dbGetAsync,
    normalizeProductRecord,
    setProductsListCacheHeaders,
    sendJsonWithOptionalCompression,
    normalizeSearchText,
  } = deps;

  app.get('/api/products', async (req, res) => {
    try {
      const query = req.query || {};
      const hasExplicitParams = Object.entries(query).some(([key, value]) => {
        if (['limit', 'page_size', 'page'].includes(key)) return false;
        return String(value ?? '').trim() !== '';
      });

      const rawSearch = normalizeSearchText(query.q || query.name || '');
      const searchQuery = String(rawSearch || '').trim().toLowerCase();
      const categoryQuery = normalizeSearchText(query.category || '');
      const brandQuery = normalizeSearchText(query.brand || '');
      const rawStatus = String(query.status || '').trim().toLowerCase();
      const includeInactive = String(query.include_inactive || '').trim().toLowerCase() === 'true';
      const lowStockOnly = String(query.low_stock || '').trim().toLowerCase() === 'true';
      const inStockOnly = String(query.in_stock || '').trim().toLowerCase() === 'true';
      const requestedCursor = String(query.cursor || '').trim();
      const rawSortDirInput = String(query.sort_dir || '').trim().toLowerCase();

      let sortField = normalizeSortField(query.sort_field || '');
      let sortDir = normalizeSortDir(query.sort_dir || '');
      if (!sortField && String(query.sort || '').trim()) {
        const legacySort = translateLegacySort(query.sort, searchQuery);
        if (!legacySort) {
          throw Object.assign(new Error(`Unsupported sort value: ${query.sort}`), { status: 400 });
        }
        sortField = legacySort.field;
        sortDir = legacySort.dir;
      }
      if (sortField) {
        sortField = normalizeSortFieldOrThrow(sortField);
      }
      if (rawSortDirInput && !sortDir) {
        throw Object.assign(new Error(`Unsupported sort_dir: ${query.sort_dir}`), { status: 400 });
      }
      if (sortDir && !['asc', 'desc'].includes(sortDir)) {
        throw Object.assign(new Error(`Unsupported sort_dir: ${query.sort_dir}`), { status: 400 });
      }
      if (!sortDir && sortField) {
        sortDir = sortField === 'name' || sortField === 'brand' || sortField === 'category' || sortField === 'sku'
          ? 'asc'
          : 'desc';
      }

      const responseMode = hasExplicitParams ? 'object' : 'array';
      const requestedPageSizeRaw = Number(query.limit || query.page_size || PRODUCT_LIST_PAGE_LIMIT);
      const pageSize = Number.isFinite(requestedPageSizeRaw) && requestedPageSizeRaw > 0
        ? Math.max(1, Math.min(PRODUCT_LIST_MAX_LIMIT, Math.floor(requestedPageSizeRaw)))
        : PRODUCT_LIST_PAGE_LIMIT;
      const page = Math.max(1, Math.floor(Number(query.page || 1) || 1));
      const cursorMode = Boolean(requestedCursor);

      if (cursorMode && !sortField) {
        throw Object.assign(new Error('cursor requires sort_field'), { status: 400 });
      }

      const whereClauses = ['1=1'];
      const whereParams = [];

      if (rawStatus === 'active') {
        whereClauses.push('COALESCE(p.is_active, 1) = 1');
      } else if (rawStatus === 'inactive') {
        whereClauses.push('COALESCE(p.is_active, 1) = 0');
      } else if (!includeInactive) {
        whereClauses.push('COALESCE(p.is_active, 1) = 1');
      }

      if (rawStatus === 'available') {
        whereClauses.push('COALESCE(p.is_active, 1) = 1');
        whereClauses.push('COALESCE(p.stock, 0) > 0');
      } else if (rawStatus === 'out_of_stock') {
        whereClauses.push('COALESCE(p.is_active, 1) = 1');
        whereClauses.push('COALESCE(p.stock, 0) <= 0');
      }

      if (searchQuery) {
        whereClauses.push("COALESCE(p.search_text, '') LIKE ? ESCAPE '\\'");
        whereParams.push(`%${escapeLikePattern(searchQuery)}%`);
      }

      if (categoryQuery) {
        const categoryParts = splitHierarchyFilter(categoryQuery);
        if (categoryParts.parent) {
          whereClauses.push('LOWER(COALESCE(p.category, \'\')) = LOWER(?)');
          whereParams.push(categoryParts.parent);
        }
        if (categoryParts.child) {
          whereClauses.push('LOWER(COALESCE(p.subcategory, \'\')) = LOWER(?)');
          whereParams.push(categoryParts.child);
        }
      }

      if (brandQuery) {
        const brandParts = splitHierarchyFilter(brandQuery);
        if (brandParts.parent) {
          whereClauses.push('LOWER(COALESCE(p.brand, \'\')) = LOWER(?)');
          whereParams.push(brandParts.parent);
        }
        if (brandParts.child) {
          whereClauses.push('LOWER(COALESCE(p.sub_brand, \'\')) = LOWER(?)');
          whereParams.push(brandParts.child);
        }
      }

      if (lowStockOnly) {
        whereClauses.push('COALESCE(p.stock, 0) <= 10');
      }
      if (inStockOnly) {
        whereClauses.push('COALESCE(p.stock, 0) > 0');
      }

      const whereSql = whereClauses.join(' AND ');
      const sortSpec = PRODUCT_LIST_SORT_SPECS[sortField || 'created_at'];
      const effectiveSortField = sortField || 'created_at';
      const effectiveSortDir = sortDir || 'desc';
      const orderSql = ` ORDER BY ${sortSpec.expr} ${effectiveSortDir.toUpperCase()}, p.id ${effectiveSortDir.toUpperCase()}`;

      const filtersPayload = {
        q: searchQuery || '',
        category: categoryQuery || '',
        brand: brandQuery || '',
        status: rawStatus || 'all',
        low_stock: Boolean(lowStockOnly),
        include_inactive: Boolean(includeInactive),
      };

      if (responseMode === 'array') {
        const [rows, activeOffers] = await Promise.all([
          dbAllAsync(`SELECT * FROM products p WHERE ${whereSql}${orderSql}`, whereParams),
          loadActiveOffers(dbAllAsync),
        ]);
        const payload = rows.map((row) => decorateProductWithOffers(normalizeProductRecord(row), activeOffers, { offersArePrepared: true }));
        setProductsListCacheHeaders(res, {
          isPaginated: false,
          includeInactive,
          status: rawStatus,
          hasActiveOffers: activeOffers.length > 0,
        });
        return sendJsonWithOptionalCompression(req, res, payload);
      }

      const activeOffersPromise = loadActiveOffers(dbAllAsync);
      const [countRow, activeOffers] = cursorMode
        ? [null, await activeOffersPromise]
        : await Promise.all([
            dbGetAsync(`SELECT COUNT(*) AS count FROM products p WHERE ${whereSql}`, whereParams),
            activeOffersPromise,
          ]);

      let listSql = `SELECT * FROM products p WHERE ${whereSql}`;
      let listParams = [...whereParams];
      let totalCount = countRow ? Number(countRow?.count || 0) : null;
      let hasMore = false;
      let pageMode = cursorMode ? 'cursor' : 'offset';

      if (cursorMode) {
        let cursorPayload;
        try {
          cursorPayload = decodeCursorToken(requestedCursor);
        } catch (error) {
          throw Object.assign(new Error('Invalid cursor token'), { status: 400, details: error.message });
        }
        if (!cursorPayload || Number(cursorPayload?.v || 0) !== PRODUCT_LIST_CURSOR_VERSION) {
          throw Object.assign(new Error('Invalid cursor token'), { status: 400 });
        }
        if (normalizeSortField(cursorPayload.sort_field || '') !== effectiveSortField || normalizeSortDir(cursorPayload.sort_dir || '') !== effectiveSortDir) {
          throw Object.assign(new Error('Cursor sort mismatch'), { status: 400 });
        }
        const cursorValue = cursorPayload.last_value;
        const cursorId = Number(cursorPayload.last_id || 0);
        if (!cursorId) {
          throw Object.assign(new Error('Invalid cursor token'), { status: 400 });
        }
        const cursorSql = buildCursorFilterSql(effectiveSortField, effectiveSortDir, cursorValue, cursorId);
        listSql += ` AND ${cursorSql.sql}${orderSql} LIMIT ?`;
        listParams = [...whereParams, ...cursorSql.params, pageSize + 1];
      } else {
        const offset = (page - 1) * pageSize;
        listSql += `${orderSql} LIMIT ? OFFSET ?`;
        listParams = [...whereParams, pageSize, offset];
      }

      const rows = await dbAllAsync(listSql, listParams);
      const limitedRows = cursorMode ? rows.slice(0, pageSize) : rows;
      hasMore = cursorMode ? rows.length > pageSize : (page * pageSize) < totalCount;

      const decoratedRows = limitedRows.map((row) => decorateProductWithOffers(normalizeProductRecord(row), activeOffers, { offersArePrepared: true }));
      const pageInfo = {
        has_more: Boolean(hasMore),
        next_cursor: limitedRows.length > 0 && hasMore ? encodeRowCursor(limitedRows[limitedRows.length - 1], effectiveSortField, effectiveSortDir) : null,
        prev_cursor: limitedRows.length > 0 && (cursorMode || page > 1)
          ? encodeRowCursor(limitedRows[0], effectiveSortField, effectiveSortDir)
          : null,
      };
      const payload = {
        items: decoratedRows,
        page_info: pageInfo,
        sort: {
          field: effectiveSortField,
          dir: effectiveSortDir,
          cursor_version: PRODUCT_LIST_CURSOR_VERSION,
        },
        filters: filtersPayload,
        meta: buildListResponseMeta({
          page,
          pageSize,
          totalCount,
          pageMode,
        }),
      };

      setProductsListCacheHeaders(res, {
        isPaginated: true,
        includeInactive,
        status: rawStatus,
        hasActiveOffers: activeOffers.length > 0,
      });
      return sendJsonWithOptionalCompression(req, res, payload);
    } catch (error) {
      const status = Number(error?.status || 0) || 500;
      return res.status(status).json({ error: error.message });
    }
  });
};

module.exports = { registerProductListRoutes };
