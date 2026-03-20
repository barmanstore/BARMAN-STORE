const registerBillingSearchRoutes = (deps) => {
  const {
    app,
    requireAuth,
    requireAdmin,
    dbAllAsync,
    dbGetAsync,
    dbRunAsync,
    dbTxAsync,
    normalizeEmail,
    normalizePhone,
    normalizeOrderStatus,
    normalizePaymentMethod,
    normalizeProductRecord,
    ORDER_STATUS_ORDERED,
    ORDER_STATUS_RECEIVED,
    resolveClientRequestId,
    isUniqueViolationError,
    generateBillNumber,
    logStockLedgerAsync,
    logAdminAuditAsync,
    createAppNotification,
    normalizeUomToken,
    UNIT_FAMILY_BASE_BY_UNIT,
    UNIT_FAMILY_MULTIPLIERS,
    getUomFamily,
    getAllowedUnitsFromBaseUnit,
    convertQtyBetweenFamilyUnits,
    normalizeUomType,
    getProductUomProfile,
    getAllowedBillingUnits,
    toStockUnitQty,
    fromStockUnitQty,
    roundQty,
    toPricingQty,
  } = deps;

  const tableColumnsCache = new Map();

  const loadTableColumns = async (tableName) => {
    if (tableColumnsCache.has(tableName)) {
      return tableColumnsCache.get(tableName);
    }

    let rows = [];
    try {
      rows = await dbAllAsync(
        `SELECT column_name FROM information_schema.columns WHERE table_name = ?`,
        [tableName]
      );
    } catch (_) {
      // Fall through to SQLite-style introspection.
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      try {
        rows = await dbAllAsync(`PRAGMA table_info(${tableName})`);
      } catch (_) {
        rows = [];
      }
    }

    const columns = new Set(
      rows
        .map((row) => String(row?.column_name || row?.name || '').trim())
        .filter(Boolean)
    );
    tableColumnsCache.set(tableName, columns);
    return columns;
  };

  const getBillingProductSelectColumns = async () => {
    const productColumns = await loadTableColumns('products');
    const hasProductColumns = productColumns.size > 0;
    const hasColumn = (columnName) => !hasProductColumns || productColumns.has(columnName);

    return [
      'id',
      'name',
      'price',
      'mrp',
      'sku',
      'barcode',
      'brand',
      'stock',
      'uom',
      hasColumn('base_unit') ? 'base_unit' : 'uom AS base_unit',
      'uom AS unit',
      hasColumn('uom_type') ? 'uom_type' : `'selling' AS uom_type`,
      hasColumn('conversion_factor') ? 'conversion_factor' : '1 AS conversion_factor',
      hasColumn('is_active') ? 'is_active' : '1 AS is_active',
    ].join(',\n      ');
  };

  const enrichRowsWithPurchaseCost = async (rows = []) => {
    if (!Array.isArray(rows) || rows.length === 0) {
      return rows;
    }

    const productIds = rows
      .map((row) => Number(row?.id || 0))
      .filter((id) => id > 0);

    if (productIds.length === 0) {
      return rows.map((row) => ({
        ...row,
        buy_price: null,
        cost_price: null,
        purchase_price: null,
      }));
    }

    const placeholders = productIds.map(() => '?').join(', ');
    const costByProductId = new Map();

    const productCostHistoryColumns = await loadTableColumns('product_cost_history');
    if (
      productCostHistoryColumns.has('product_id')
      && productCostHistoryColumns.has('unit_cost_incl_tax')
      && productCostHistoryColumns.has('transaction_ts')
      && productCostHistoryColumns.has('id')
    ) {
      try {
        const latestCostRows = await dbAllAsync(
          `
            SELECT product_id, unit_cost_incl_tax
            FROM (
              SELECT
                product_id,
                unit_cost_incl_tax,
                ROW_NUMBER() OVER (
                  PARTITION BY product_id
                  ORDER BY transaction_ts DESC, id DESC
                ) AS rn
              FROM product_cost_history
              WHERE product_id IN (${placeholders})
            ) ranked
            WHERE rn = 1
          `,
          productIds
        );

        latestCostRows.forEach((row) => {
          const productId = Number(row?.product_id || 0);
          if (productId > 0) {
            costByProductId.set(productId, row?.unit_cost_incl_tax == null ? null : Number(row.unit_cost_incl_tax));
          }
        });
      } catch (_) {
        // Ignore PO-engine enrichment failures and fall back to null/supplier data.
      }
    }

    const supplierProductColumns = await loadTableColumns('supplier_products');
    if (
      supplierProductColumns.has('product_id')
      && supplierProductColumns.has('last_known_unit_cost_incl_tax')
    ) {
      try {
        const supplierRows = await dbAllAsync(
          `
            SELECT product_id, MAX(last_known_unit_cost_incl_tax) AS last_known_unit_cost_incl_tax
            FROM supplier_products
            WHERE product_id IN (${placeholders})
            GROUP BY product_id
          `,
          productIds
        );

        supplierRows.forEach((row) => {
          const productId = Number(row?.product_id || 0);
          if (productId > 0 && !costByProductId.has(productId)) {
            costByProductId.set(
              productId,
              row?.last_known_unit_cost_incl_tax == null ? null : Number(row.last_known_unit_cost_incl_tax)
            );
          }
        });
      } catch (_) {
        // Ignore supplier fallback failures and keep null costs.
      }
    }

    return rows.map((row) => {
      const productId = Number(row?.id || 0);
      const purchaseCost = productId > 0 && costByProductId.has(productId)
        ? costByProductId.get(productId)
        : null;

      return {
        ...row,
        buy_price: purchaseCost,
        cost_price: purchaseCost,
        purchase_price: purchaseCost,
      };
    });
  };

app.get('/api/billing/customers/search', requireAdmin, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const like = `%${q}%`;
    const rows = q
      ? await dbAllAsync(`SELECT id, name, email, phone, address FROM users WHERE role='customer' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?) ORDER BY name LIMIT 20`, [like, like, like])
      : await dbAllAsync(`SELECT id, name, email, phone, address FROM users WHERE role='customer' ORDER BY name LIMIT 20`);
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/billing/products/search', requireAdmin, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const category = String(req.query.category || '').trim();
    const normalizedQuery = q.toLowerCase();
    const requestedLimit = Math.max(1, Math.min(10, Math.floor(Number(req.query.limit || 8) || 8)));
    const includeCosts = String(req.query.include_costs || '').trim() === '1';
    const exactOnly = String(req.query.exact_only || '').trim() === '1';

    if (!normalizedQuery) {
      return res.json([]);
    }

    const selectColumns = await getBillingProductSelectColumns();

    const categoryWhere = category ? ` AND category = ?` : '';
    const categoryParams = category ? [category] : [];

    const exactRows = await dbAllAsync(
      `
        SELECT ${selectColumns}
        FROM products
        WHERE COALESCE(is_active, 1) = 1
          ${categoryWhere}
          AND (
            LOWER(COALESCE(barcode, '')) = ?
            OR LOWER(COALESCE(sku, '')) = ?
            OR LOWER(COALESCE(name, '')) = ?
          )
        ORDER BY
          CASE
            WHEN LOWER(COALESCE(barcode, '')) = ? THEN 0
            WHEN LOWER(COALESCE(sku, '')) = ? THEN 1
            ELSE 2
          END,
          name
        LIMIT ?
      `,
      [
        ...categoryParams,
        normalizedQuery,
        normalizedQuery,
        normalizedQuery,
        normalizedQuery,
        normalizedQuery,
        requestedLimit,
      ]
    );

    let rows = exactRows;

    const shouldRunFuzzySearch = !exactOnly && normalizedQuery.length >= 2;

    if (rows.length < requestedLimit && shouldRunFuzzySearch) {
      const fuzzyLike = `%${normalizedQuery}%`;
      const prefixLike = `${normalizedQuery}%`;
      const exactIds = rows
        .map((row) => Number(row?.id || 0))
        .filter((id) => id > 0);

      let fuzzySql = `
        SELECT ${selectColumns}
        FROM products
        WHERE COALESCE(is_active, 1) = 1
          ${categoryWhere}
          AND (
            LOWER(COALESCE(name, '')) LIKE ?
            OR LOWER(COALESCE(sku, '')) LIKE ?
            OR LOWER(COALESCE(brand, '')) LIKE ?
            OR LOWER(COALESCE(barcode, '')) LIKE ?
          )
      `;
      const fuzzyParams = [
        ...categoryParams,
        fuzzyLike,
        fuzzyLike,
        fuzzyLike,
        fuzzyLike,
      ];

      if (exactIds.length > 0) {
        fuzzySql += ` AND id NOT IN (${exactIds.map(() => '?').join(', ')})`;
        fuzzyParams.push(...exactIds);
      }

      fuzzySql += `
        ORDER BY
          CASE
            WHEN LOWER(COALESCE(barcode, '')) LIKE ? THEN 0
            WHEN LOWER(COALESCE(sku, '')) LIKE ? THEN 1
            WHEN LOWER(COALESCE(name, '')) LIKE ? THEN 2
            WHEN LOWER(COALESCE(brand, '')) LIKE ? THEN 3
            ELSE 4
          END,
          name
        LIMIT ?
      `;

      fuzzyParams.push(
        prefixLike,
        prefixLike,
        prefixLike,
        prefixLike,
        requestedLimit - rows.length
      );

      const fuzzyRows = await dbAllAsync(fuzzySql, fuzzyParams);
      rows = rows.concat(fuzzyRows);
    }

    const finalRows = includeCosts ? await enrichRowsWithPurchaseCost(rows) : rows;
    return res.json(finalRows.map(normalizeProductRecord));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

};

module.exports = { registerBillingSearchRoutes };

