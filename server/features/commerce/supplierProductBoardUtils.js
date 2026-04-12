const { createDistributorProductKnowledgeUtils } = require('../purchase');

const { parseDistributorProductsSupplied } = createDistributorProductKnowledgeUtils();

const normalizeBoardNumber = (value) => (
  value === null || value === undefined ? null : Number(value || 0)
);

const normalizeBoardText = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ' ');

const normalizeBoardRow = (row, { distributorId = null, supplierId = null } = {}) => ({
  ...row,
  id: Number(row.id || 0),
  distributor_id: Number(row.distributor_id || distributorId || 0),
  supplier_id: Number(row.supplier_id || supplierId || 0) || null,
  product_id: Number(row.product_id || row.id || 0),
  price: normalizeBoardNumber(row.price),
  mrp: normalizeBoardNumber(row.mrp),
  conversion_factor: normalizeBoardNumber(row.conversion_factor),
  purchase_pack_size: normalizeBoardNumber(row.purchase_pack_size),
  stock: normalizeBoardNumber(row.stock),
  default_discount: normalizeBoardNumber(row.default_discount),
  last_known_unit_cost_incl_tax: normalizeBoardNumber(row.last_known_unit_cost_incl_tax),
  min_order_qty: normalizeBoardNumber(row.min_order_qty),
  lead_time_days: normalizeBoardNumber(row.lead_time_days),
});

const getBoardRowIdentityKey = (row = {}) => [
  normalizeBoardText(row.sku) ? `sku:${normalizeBoardText(row.sku)}` : '',
  normalizeBoardText(row.name),
  normalizeBoardText(row.brand),
  normalizeBoardText(row.sub_brand),
  normalizeBoardText(row.content),
  normalizeBoardText(row.color),
].filter(Boolean).join('|');

const toBoardRowTimestamp = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return 0;
  const parsed = new Date(normalized.includes('T') ? normalized : normalized.replace(' ', 'T')).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const getBoardRowSortScore = (row = {}) => ({
  updatedAt: Math.max(
    toBoardRowTimestamp(row.supplier_last_updated_at),
    toBoardRowTimestamp(row.last_purchase_at)
  ),
  hasCost: Number(row.last_known_unit_cost_incl_tax || 0) > 0 ? 1 : 0,
  productId: Number(row.product_id || row.id || 0) || 0,
});

const isPreferredBoardRow = (candidate, current) => {
  const nextScore = getBoardRowSortScore(candidate);
  const currentScore = getBoardRowSortScore(current);
  if (nextScore.updatedAt !== currentScore.updatedAt) {
    return nextScore.updatedAt > currentScore.updatedAt;
  }
  if (nextScore.hasCost !== currentScore.hasCost) {
    return nextScore.hasCost > currentScore.hasCost;
  }
  if (Number(candidate?.last_known_unit_cost_incl_tax || 0) !== Number(current?.last_known_unit_cost_incl_tax || 0)) {
    return Number(candidate?.last_known_unit_cost_incl_tax || 0) > Number(current?.last_known_unit_cost_incl_tax || 0);
  }
  return nextScore.productId > currentScore.productId;
};

const dedupeBoardRowsByIdentity = (rows = []) => {
  const rowsByKey = new Map();
  const keyOrder = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const key = getBoardRowIdentityKey(row) || `product:${Number(row?.product_id || row?.id || 0)}`;
    if (!key) continue;
    const existing = rowsByKey.get(key);
    if (!existing) {
      rowsByKey.set(key, row);
      keyOrder.push(key);
      continue;
    }
    if (isPreferredBoardRow(row, existing)) {
      rowsByKey.set(key, row);
    }
  }

  return keyOrder
    .map((key) => rowsByKey.get(key))
    .filter(Boolean);
};

const createSupplierProductBoardUtils = ({
  dbAllAsync,
  dbGetAsync,
} = {}) => {
  const getSupplierContextAsync = async ({ supplierId, distributorId = null } = {}) => {
    const normalizedSupplierId = Number(supplierId || 0);
    if (!normalizedSupplierId) return null;

    const normalizedDistributorId = Number(distributorId || 0) || null;
    const params = [normalizedSupplierId];
    let sql = 'SELECT * FROM suppliers WHERE id = ?';
    if (normalizedDistributorId) {
      sql += ' AND distributor_id = ?';
      params.push(normalizedDistributorId);
    }

    const supplier = await dbGetAsync(sql, params);
    if (!supplier) return null;

    return {
      ...supplier,
      id: Number(supplier.id || 0),
      distributor_id: Number(supplier.distributor_id || 0),
    };
  };

  const getSupplierRegistryBoardRowsAsync = async ({ supplierId, distributorId } = {}) => {
    const rows = await dbAllAsync(
      `SELECT
         p.id,
         p.name,
         p.brand,
         p.sub_brand,
         p.content,
         p.color,
         p.price,
         p.mrp,
         p.uom,
         p.base_unit,
         p.uom_type,
         p.conversion_factor,
         p.purchase_pack_size,
         p.sku,
         p.barcode,
         p.image,
         p.stock,
         p.category,
         p.subcategory,
         p.default_discount,
         p.discount_type,
         p.is_active,
         sp.distributor_id,
         sp.product_id,
         sp.supplier_id,
         sp.last_known_unit_cost_incl_tax,
         sp.min_order_qty,
         sp.lead_time_days,
         sp.is_available,
         sp.availability_note,
         sp.last_updated_at AS supplier_last_updated_at,
         pch.last_purchase_at
       FROM supplier_products sp
       INNER JOIN products p ON p.id = sp.product_id
       LEFT JOIN (
         SELECT
           product_id,
           distributor_id,
           MAX(transaction_ts) AS last_purchase_at
         FROM product_cost_history
         WHERE distributor_id = ?
         GROUP BY product_id, distributor_id
       ) pch
         ON pch.product_id = sp.product_id
        AND pch.distributor_id = sp.distributor_id
       WHERE sp.supplier_id = ?
         AND COALESCE(sp.is_available, TRUE) = TRUE
         AND COALESCE(p.is_active, 1) <> 0
       ORDER BY LOWER(COALESCE(p.name, '')) ASC, p.id ASC`,
      [
        Number(distributorId || 0),
        Number(supplierId || 0),
      ]
    );

    return dedupeBoardRowsByIdentity((rows || []).map((row) => normalizeBoardRow(row, { distributorId, supplierId })));
  };

  const getSupplierGroupBoardRowsAsync = async ({
    supplierId,
    distributorId,
    suppliedNames = [],
  } = {}) => {
    const normalizedSupplierId = Number(supplierId || 0);
    const normalizedDistributorId = Number(distributorId || 0);
    const normalizedNames = (Array.isArray(suppliedNames) ? suppliedNames : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    if (!normalizedSupplierId || !normalizedDistributorId || !normalizedNames.length) {
      return [];
    }

    const normalizedNameKeys = [...new Set(
      normalizedNames.map((value) => value.toLowerCase())
    )];
    const placeholders = normalizedNameKeys.map(() => '?').join(', ');

    const rows = await dbAllAsync(
      `SELECT
         p.id,
         p.name,
         p.brand,
         p.sub_brand,
         p.content,
         p.color,
         p.price,
         p.mrp,
         p.uom,
         p.base_unit,
         p.uom_type,
         p.conversion_factor,
         p.purchase_pack_size,
         p.sku,
         p.barcode,
         p.image,
         p.stock,
         p.category,
         p.subcategory,
         p.default_discount,
         p.discount_type,
         p.is_active,
         COALESCE(sp.distributor_id, ?) AS distributor_id,
         p.id AS product_id,
         COALESCE(sp.supplier_id, ?) AS supplier_id,
         sp.last_known_unit_cost_incl_tax,
         sp.min_order_qty,
         sp.lead_time_days,
         COALESCE(sp.is_available, TRUE) AS is_available,
         sp.availability_note,
         sp.last_updated_at AS supplier_last_updated_at,
         pch.last_purchase_at
       FROM products p
       LEFT JOIN supplier_products sp
         ON sp.supplier_id = ?
        AND sp.product_id = p.id
       LEFT JOIN (
         SELECT
           product_id,
           distributor_id,
           MAX(transaction_ts) AS last_purchase_at
         FROM product_cost_history
         WHERE distributor_id = ?
         GROUP BY product_id, distributor_id
       ) pch
         ON pch.product_id = p.id
        AND pch.distributor_id = ?
       WHERE LOWER(TRIM(COALESCE(p.name, ''))) IN (${placeholders})
         AND COALESCE(p.is_active, 1) <> 0
         AND COALESCE(sp.is_available, TRUE) = TRUE`,
      [
        normalizedDistributorId,
        normalizedSupplierId,
        normalizedSupplierId,
        normalizedDistributorId,
        normalizedDistributorId,
        ...normalizedNameKeys,
      ]
    );

    const nameOrderMap = new Map();
    normalizedNames.forEach((value, index) => {
      const key = value.toLowerCase();
      if (!nameOrderMap.has(key)) {
        nameOrderMap.set(key, index);
      }
    });

    return dedupeBoardRowsByIdentity((rows || [])
      .map((row) => normalizeBoardRow(row, {
        distributorId: normalizedDistributorId,
        supplierId: normalizedSupplierId,
      }))
      .sort((left, right) => {
        const leftIndex = nameOrderMap.get(String(left?.name || '').trim().toLowerCase());
        const rightIndex = nameOrderMap.get(String(right?.name || '').trim().toLowerCase());
        if (leftIndex !== rightIndex) {
          return Number(leftIndex ?? Number.MAX_SAFE_INTEGER) - Number(rightIndex ?? Number.MAX_SAFE_INTEGER);
        }
        return String(left?.name || '').localeCompare(String(right?.name || ''));
      }));
  };

  const getSupplierProductBoardAsync = async ({ supplierId, distributorId = null } = {}) => {
    const supplier = await getSupplierContextAsync({ supplierId, distributorId });
    if (!supplier) return { supplier: null, rows: [] };

    const suppliedNames = parseDistributorProductsSupplied(supplier.products_supplied || '');
    const groupedRows = await getSupplierGroupBoardRowsAsync({
      supplierId: supplier.id,
      distributorId: supplier.distributor_id,
      suppliedNames,
    });

    if (groupedRows.length) {
      return {
        supplier,
        rows: groupedRows,
        source: 'supplier_products_group',
      };
    }

    if (suppliedNames.length) {
      return {
        supplier,
        rows: [],
        source: 'supplier_products_group',
      };
    }

    const fallbackRows = await getSupplierRegistryBoardRowsAsync({
      supplierId: supplier.id,
      distributorId: supplier.distributor_id,
    });

    return {
      supplier,
      rows: fallbackRows,
      source: suppliedNames.length ? 'supplier_products_registry_fallback' : 'supplier_products_registry',
    };
  };

  return {
    getSupplierContextAsync,
    getSupplierProductBoardAsync,
  };
};

module.exports = { createSupplierProductBoardUtils };
