const { loadActiveOffers, decorateProductWithOffers } = require('../../offers/offerEngine');
const { createBillingSearchHelpers } = require('./billingSearch/billingSearchHelpers');
const { sendRouteError } = require('../../../core/routeErrors');

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

  const { getBillingProductSelectColumns, enrichRowsWithPurchaseCost } = createBillingSearchHelpers(
    {
      dbAllAsync,
      dbGetAsync,
    }
  );

  app.get('/api/billing/customers/search', requireAdmin, async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const like = `%${q}%`;
      const rows = q
        ? await dbAllAsync(
            `SELECT id, name, email, phone, address FROM users WHERE role='customer' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?) ORDER BY name LIMIT 20`,
            [like, like, like]
          )
        : await dbAllAsync(
            `SELECT id, name, email, phone, address FROM users WHERE role='customer' ORDER BY name LIMIT 20`
          );
      return res.json(rows);
    } catch (error) {
      return sendRouteError(res, error, { fallbackMessage: 'Failed to search customers' });
    }
  });

  app.get('/api/billing/products/search', requireAdmin, async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const category = String(req.query.category || '').trim();
      const normalizedQuery = q.toLowerCase();
      const requestedLimit = Math.max(
        1,
        Math.min(10, Math.floor(Number(req.query.limit || 8) || 8))
      );
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
        const exactIds = rows.map((row) => Number(row?.id || 0)).filter((id) => id > 0);

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
        const fuzzyParams = [...categoryParams, fuzzyLike, fuzzyLike, fuzzyLike, fuzzyLike];

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

      const [finalRows, activeOffers] = await Promise.all([
        includeCosts ? enrichRowsWithPurchaseCost(rows) : Promise.resolve(rows),
        loadActiveOffers(dbAllAsync),
      ]);
      return res.json(
        finalRows.map((row) =>
          decorateProductWithOffers(normalizeProductRecord(row), activeOffers, {
            offersArePrepared: true,
          })
        )
      );
    } catch (error) {
      return sendRouteError(res, error, { fallbackMessage: 'Failed to search products' });
    }
  });
};

module.exports = { registerBillingSearchRoutes };
