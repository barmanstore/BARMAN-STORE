const buildHierarchyPath = (parent, child) => {
  const root = String(parent || '').trim();
  const leaf = String(child || '').trim();
  if (!root) return '';
  if (!leaf) return root;
  return `${root} -> ${leaf}`;
};

const normalizeQueryText = (value, maxLength = 160) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);

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
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (raw === 'asc' || raw === 'ascending') return 'asc';
  if (raw === 'desc' || raw === 'descending') return 'desc';
  return '';
};

const PRODUCT_EXPORT_SORT_SPECS = {
  created_at: { expr: "COALESCE(p.created_at, TIMESTAMPTZ '1970-01-01 00:00:00+00')" },
  id: { expr: 'COALESCE(p.id, 0)' },
  name: { expr: "LOWER(COALESCE(p.name, ''))" },
  brand: {
    expr: "LOWER(TRIM(COALESCE(p.brand, '') || CASE WHEN COALESCE(p.sub_brand, '') = '' THEN '' ELSE ' -> ' || COALESCE(p.sub_brand, '') END))",
  },
  category: {
    expr: "LOWER(TRIM(COALESCE(p.category, '') || CASE WHEN COALESCE(p.subcategory, '') = '' THEN '' ELSE ' -> ' || COALESCE(p.subcategory, '') END))",
  },
  price: { expr: 'COALESCE(p.price, 0)' },
  mrp: { expr: 'COALESCE(p.mrp, 0)' },
  stock: { expr: 'COALESCE(p.stock, 0)' },
  sku: { expr: "LOWER(COALESCE(p.sku, ''))" },
  barcode: { expr: "LOWER(COALESCE(p.barcode, ''))" },
  is_active: { expr: 'COALESCE(p.is_active, 1)' },
  defaultDiscount: { expr: 'COALESCE(p.default_discount, 0)' },
  purchase_pack_size: { expr: 'COALESCE(p.purchase_pack_size, 0)' },
};

const registerProductExportRoutes = (deps) => {
  const { app, requireAdmin, dbAllAsync, XLSX, toProductExportRow, PRODUCT_IMPORT_HEADERS } = deps;

  app.get('/api/products/export', requireAdmin, async (req, res) => {
    try {
      const format = String(req.query?.format || 'csv')
        .trim()
        .toLowerCase();
      const mode = String(req.query?.mode || 'current')
        .trim()
        .toLowerCase();
      const includeInactive =
        mode === 'all'
          ? true
          : String(req.query?.include_inactive || '')
              .trim()
              .toLowerCase() === 'true';
      const applyFilters = mode !== 'all';
      const searchQuery = applyFilters
        ? normalizeQueryText(req.query?.q || req.query?.name || '').toLowerCase()
        : '';
      const categoryQuery = applyFilters ? normalizeQueryText(req.query?.category || '') : '';
      const brandQuery = applyFilters ? normalizeQueryText(req.query?.brand || '') : '';
      const rawStatus = applyFilters
        ? String(req.query?.status || '')
            .trim()
            .toLowerCase()
        : '';
      const lowStockOnly =
        applyFilters &&
        String(req.query?.low_stock || '')
          .trim()
          .toLowerCase() === 'true';
      const sortField = normalizeSortField(req.query?.sort_field || '') || 'created_at';
      const sortDir =
        normalizeSortDir(req.query?.sort_dir || '') ||
        (sortField === 'name' ||
        sortField === 'brand' ||
        sortField === 'category' ||
        sortField === 'sku'
          ? 'asc'
          : 'desc');

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
          whereClauses.push("LOWER(COALESCE(p.category, '')) = LOWER(?)");
          whereParams.push(categoryParts.parent);
        }
        if (categoryParts.child) {
          whereClauses.push("LOWER(COALESCE(p.subcategory, '')) = LOWER(?)");
          whereParams.push(categoryParts.child);
        }
      }

      if (brandQuery) {
        const brandParts = splitHierarchyFilter(brandQuery);
        if (brandParts.parent) {
          whereClauses.push("LOWER(COALESCE(p.brand, '')) = LOWER(?)");
          whereParams.push(brandParts.parent);
        }
        if (brandParts.child) {
          whereClauses.push("LOWER(COALESCE(p.sub_brand, '')) = LOWER(?)");
          whereParams.push(brandParts.child);
        }
      }

      if (lowStockOnly) {
        whereClauses.push('COALESCE(p.stock, 0) <= 10');
      }

      const sortSpec = PRODUCT_EXPORT_SORT_SPECS[sortField] || PRODUCT_EXPORT_SORT_SPECS.created_at;
      const orderSql = ` ORDER BY ${sortSpec.expr} ${sortDir.toUpperCase()}, p.id ${sortDir.toUpperCase()}`;
      const rows = (
        await dbAllAsync(
          `SELECT * FROM products p WHERE ${whereClauses.join(' AND ')}${orderSql}`,
          whereParams
        )
      ).map(toProductExportRow);

      if (format === 'xlsx' || format === 'xls') {
        const sheet = XLSX.utils.json_to_sheet(rows, { header: PRODUCT_IMPORT_HEADERS });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, sheet, 'Products');
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="products-export-${new Date().toISOString().slice(0, 10)}.xlsx"`
        );
        return res.send(buffer);
      }
      const csv = XLSX.utils.sheet_to_csv(
        XLSX.utils.json_to_sheet(rows, { header: PRODUCT_IMPORT_HEADERS })
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="products-export-${new Date().toISOString().slice(0, 10)}.csv"`
      );
      return res.send(`\uFEFF${csv}`);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerProductExportRoutes };
