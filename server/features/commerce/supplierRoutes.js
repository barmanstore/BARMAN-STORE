const { createDistributorProductKnowledgeUtils } = require('../purchase');
const { createSupplierProductBoardUtils } = require('./supplierProductBoardUtils');

const normalizeScheduleType = (value = '') => {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (raw === 'daily' || raw === 'regular') return 'daily';
  if (raw === 'weekly' || raw === 'fixed') return 'weekly';
  if (raw === 'irregular' || raw === 'varies') return 'irregular';
  return 'irregular';
};

const sanitizeScheduleDay = (value = '') => {
  const day = String(value || '').trim();
  return day ? day[0].toUpperCase() + day.slice(1).toLowerCase() : null;
};

const normalizeSupplierTextValue = (value = '') => String(value || '').trim();
const { parseDistributorProductsSupplied } = createDistributorProductKnowledgeUtils();

const normalizeSupplierPhoneValue = (value = null) => {
  if (value === null || value === undefined) return null;

  if (typeof value === 'object') {
    const nestedPhone = String(value?.phone || '').trim();
    return nestedPhone || null;
  }

  const raw = String(value || '').trim();
  if (!raw) return null;

  const looksLikeJson = raw.startsWith('{') || raw.startsWith('[');
  if (looksLikeJson) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const nestedPhone = String(parsed?.phone || '').trim();
        return nestedPhone || null;
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  return raw;
};

const normalizeSupplierRow = (row) => {
  if (!row) return row;
  return {
    ...row,
    phone: normalizeSupplierPhoneValue(row.phone),
    alt_phone: normalizeSupplierPhoneValue(row.alt_phone),
    products_supplied: normalizeSupplierTextValue(row.products_supplied),
  };
};

const registerSupplierRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbAllAsync,
    dbGetAsync,
    dbRunAsync,
    dbTxAsync,
    normalizeBooleanFlag,
    getPrimarySupplierByDistributorIdAsync,
  } = deps;
  const supplierProductBoardUtils = createSupplierProductBoardUtils({
    dbAllAsync,
    dbGetAsync,
  });

  const reconcileSupplierProductRegistryAsync = async ({
    supplierId,
    distributorId,
    productsSupplied = '',
  } = {}) => {
    const normalizedSupplierId = Number(supplierId || 0);
    const normalizedDistributorId = Number(distributorId || 0);
    if (!normalizedSupplierId || !normalizedDistributorId) return;

    const normalizedProductNames = parseDistributorProductsSupplied(productsSupplied)
      .map((value) =>
        String(value || '')
          .trim()
          .toLowerCase()
      )
      .filter(Boolean);

    let matchedProductIds = [];
    if (normalizedProductNames.length) {
      const placeholders = normalizedProductNames.map(() => '?').join(', ');
      const productRows = await dbAllAsync(
        `SELECT id
         FROM products
         WHERE LOWER(TRIM(COALESCE(name, ''))) IN (${placeholders})`,
        normalizedProductNames
      );
      matchedProductIds = [
        ...new Set((productRows || []).map((row) => Number(row?.id || 0)).filter(Boolean)),
      ];

      for (const productId of matchedProductIds) {
        await dbRunAsync(
          `INSERT INTO supplier_products
           (distributor_id, supplier_id, product_id, is_available, availability_note, last_updated_at)
           VALUES (?, ?, ?, TRUE, NULL, CURRENT_TIMESTAMP)
           ON CONFLICT (supplier_id, product_id)
           DO UPDATE SET
             distributor_id = EXCLUDED.distributor_id,
             is_available = TRUE,
             availability_note = NULL,
             last_updated_at = CURRENT_TIMESTAMP`,
          [normalizedDistributorId, normalizedSupplierId, productId]
        );
      }
    }

    if (matchedProductIds.length) {
      const productIdPlaceholders = matchedProductIds.map(() => '?').join(', ');
      await dbRunAsync(
        `UPDATE supplier_products
         SET distributor_id = ?,
             is_available = FALSE,
             availability_note = 'Removed from supplier product group',
             last_updated_at = CURRENT_TIMESTAMP
         WHERE supplier_id = ?
           AND product_id NOT IN (${productIdPlaceholders})
           AND COALESCE(is_available, TRUE) = TRUE`,
        [normalizedDistributorId, normalizedSupplierId, ...matchedProductIds]
      );
      return;
    }

    await dbRunAsync(
      `UPDATE supplier_products
       SET distributor_id = ?,
           is_available = FALSE,
           availability_note = 'Removed from supplier product group',
           last_updated_at = CURRENT_TIMESTAMP
       WHERE supplier_id = ?
         AND COALESCE(is_available, TRUE) = TRUE`,
      [normalizedDistributorId, normalizedSupplierId]
    );
  };

  app.get('/api/suppliers', requireAdmin, async (req, res) => {
    try {
      const distributorId = Number(req.query?.distributor_id || 0) || null;
      const params = [];
      const whereSql = distributorId ? ' WHERE distributor_id = ?' : '';
      if (distributorId) params.push(distributorId);
      const rows = await dbAllAsync(
        `SELECT *
         FROM suppliers${whereSql}
         ORDER BY is_primary DESC, name ASC`,
        params
      );
      return res.json((rows || []).map(normalizeSupplierRow));
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/distributors/:id/suppliers', requireAdmin, async (req, res) => {
    try {
      const distributorId = Number(req.params.id || 0);
      if (!distributorId) return res.status(400).json({ error: 'Invalid distributor id' });
      const rows = await dbAllAsync(
        `SELECT *
         FROM suppliers
         WHERE distributor_id = ?
         ORDER BY is_primary DESC, name ASC`,
        [distributorId]
      );
      return res.json((rows || []).map(normalizeSupplierRow));
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/suppliers/:id', requireAdmin, async (req, res) => {
    try {
      const supplierId = Number(req.params.id || 0);
      if (!supplierId) return res.status(400).json({ error: 'Invalid supplier id' });
      const row = await dbGetAsync('SELECT * FROM suppliers WHERE id = ?', [supplierId]);
      if (!row) return res.status(404).json({ error: 'Supplier not found' });
      return res.json(normalizeSupplierRow(row));
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/suppliers/:id/products', requireAdmin, async (req, res) => {
    try {
      const supplierId = Number(req.params.id || 0);
      if (!supplierId) return res.status(400).json({ error: 'Invalid supplier id' });

      const { supplier, rows } = await supplierProductBoardUtils.getSupplierProductBoardAsync({
        supplierId,
      });
      if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
      return res.json(rows);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/suppliers', requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      const distributorId = Number(b.distributor_id || 0);
      if (!distributorId) return res.status(400).json({ error: 'Distributor id is required' });
      const name = normalizeSupplierTextValue(b.name);
      if (!name) return res.status(400).json({ error: 'Supplier name is required' });
      const productsSupplied = normalizeSupplierTextValue(b.products_supplied);

      const scheduleType = normalizeScheduleType(b.schedule_type);
      const scheduleDay = scheduleType === 'weekly' ? sanitizeScheduleDay(b.schedule_day) : null;
      if (scheduleType === 'weekly' && !scheduleDay) {
        return res.status(400).json({ error: 'Schedule day is required for weekly suppliers' });
      }

      const isPrimary = normalizeBooleanFlag(b.is_primary, false);
      const row = await dbTxAsync(async () => {
        if (isPrimary) {
          await dbRunAsync(
            `UPDATE suppliers
             SET is_primary = FALSE
             WHERE distributor_id = ?`,
            [distributorId]
          );
        }

        const result = await dbRunAsync(
          `INSERT INTO suppliers
           (distributor_id, name, phone, alt_phone, products_supplied, schedule_type, schedule_day, is_active, is_primary)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            distributorId,
            name,
            normalizeSupplierPhoneValue(b.phone),
            normalizeSupplierPhoneValue(b.alt_phone),
            productsSupplied || null,
            scheduleType,
            scheduleDay,
            normalizeBooleanFlag(b.is_active, true),
            isPrimary,
          ]
        );
        const createdSupplierId = Number(result?.lastInsertRowid || 0);
        await reconcileSupplierProductRegistryAsync({
          supplierId: createdSupplierId,
          distributorId,
          productsSupplied,
        });
        return dbGetAsync('SELECT * FROM suppliers WHERE id = ?', [createdSupplierId]);
      });
      return res.status(201).json(normalizeSupplierRow(row));
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/suppliers/:id', requireAdmin, async (req, res) => {
    try {
      const supplierId = Number(req.params.id || 0);
      if (!supplierId) return res.status(400).json({ error: 'Invalid supplier id' });
      const cur = await dbGetAsync('SELECT * FROM suppliers WHERE id = ?', [supplierId]);
      if (!cur) return res.status(404).json({ error: 'Supplier not found' });
      const b = req.body || {};
      const nextDistributorId = Number(
        b.distributor_id === undefined ? cur.distributor_id : b.distributor_id
      );
      if (!nextDistributorId) return res.status(400).json({ error: 'Distributor id is required' });
      const nextDistributor = await dbGetAsync('SELECT id FROM distributors WHERE id = ?', [
        nextDistributorId,
      ]);
      if (!nextDistributor) return res.status(404).json({ error: 'Distributor not found' });
      const distributorChanged = nextDistributorId !== Number(cur.distributor_id || 0);
      if (distributorChanged && Boolean(cur.is_primary)) {
        return res.status(400).json({
          error:
            'Primary supplier distributor cannot be changed. Assign another primary supplier first.',
        });
      }
      const nextName = normalizeSupplierTextValue(b.name === undefined ? cur.name : b.name);
      if (!nextName) return res.status(400).json({ error: 'Supplier name is required' });
      const nextProductsSupplied = normalizeSupplierTextValue(
        b.products_supplied === undefined ? cur.products_supplied : b.products_supplied
      );
      const shouldReconcileSupplierProducts = Object.prototype.hasOwnProperty.call(
        b,
        'products_supplied'
      );

      const nextScheduleType = normalizeScheduleType(b.schedule_type ?? cur.schedule_type);
      const nextScheduleDay =
        nextScheduleType === 'weekly'
          ? sanitizeScheduleDay(b.schedule_day ?? cur.schedule_day)
          : null;
      if (nextScheduleType === 'weekly' && !nextScheduleDay) {
        return res.status(400).json({ error: 'Schedule day is required for weekly suppliers' });
      }

      const isPrimary =
        b.is_primary === undefined
          ? Boolean(cur.is_primary)
          : normalizeBooleanFlag(b.is_primary, false);
      const row = await dbTxAsync(async () => {
        if (isPrimary) {
          await dbRunAsync(
            `UPDATE suppliers
             SET is_primary = FALSE
             WHERE distributor_id = ?
               AND id <> ?`,
            [nextDistributorId, supplierId]
          );
        }

        await dbRunAsync(
          `UPDATE suppliers
           SET distributor_id = ?, name = ?, phone = ?, alt_phone = ?, products_supplied = ?, schedule_type = ?, schedule_day = ?, is_active = ?, is_primary = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            nextDistributorId,
            nextName,
            b.phone === undefined
              ? normalizeSupplierPhoneValue(cur.phone)
              : normalizeSupplierPhoneValue(b.phone),
            b.alt_phone === undefined
              ? normalizeSupplierPhoneValue(cur.alt_phone)
              : normalizeSupplierPhoneValue(b.alt_phone),
            nextProductsSupplied || null,
            nextScheduleType,
            nextScheduleDay,
            normalizeBooleanFlag(b.is_active, cur.is_active !== false),
            isPrimary,
            supplierId,
          ]
        );
        if (distributorChanged) {
          await dbRunAsync(
            `UPDATE supplier_products
             SET distributor_id = ?, last_updated_at = CURRENT_TIMESTAMP
             WHERE supplier_id = ?`,
            [nextDistributorId, supplierId]
          );
        }
        if (shouldReconcileSupplierProducts) {
          await reconcileSupplierProductRegistryAsync({
            supplierId,
            distributorId: nextDistributorId,
            productsSupplied: nextProductsSupplied,
          });
        }
        return dbGetAsync('SELECT * FROM suppliers WHERE id = ?', [supplierId]);
      });
      return res.json(normalizeSupplierRow(row));
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/suppliers/:id', requireAdmin, async (req, res) => {
    try {
      const supplierId = Number(req.params.id || 0);
      if (!supplierId) return res.status(400).json({ error: 'Invalid supplier id' });
      const cur = await dbGetAsync('SELECT * FROM suppliers WHERE id = ?', [supplierId]);
      if (!cur) return res.status(404).json({ error: 'Supplier not found' });
      if (cur.is_primary) {
        const fallback = await getPrimarySupplierByDistributorIdAsync(cur.distributor_id);
        if (fallback && Number(fallback.id || 0) === supplierId) {
          return res.status(400).json({
            error: 'Primary supplier cannot be removed without selecting another primary supplier.',
          });
        }
      }

      const poCountRow = await dbGetAsync(
        `SELECT COUNT(*) AS count
         FROM purchase_orders
         WHERE supplier_id = ?`,
        [supplierId]
      );
      const purchaseOrderCount = Number(poCountRow?.count || 0);
      if (purchaseOrderCount > 0) {
        return res.status(400).json({
          error: 'Supplier has purchase-order history. Mark it inactive instead of deleting it.',
        });
      }

      const registryCountRow = await dbGetAsync(
        `SELECT COUNT(*) AS count
         FROM supplier_products
         WHERE supplier_id = ?`,
        [supplierId]
      );
      const registryCount = Number(registryCountRow?.count || 0);
      if (registryCount > 0) {
        return res.status(400).json({
          error:
            'Supplier has learned supplier-product records. Mark it inactive instead of deleting it.',
        });
      }

      await dbRunAsync('DELETE FROM suppliers WHERE id = ?', [supplierId]);
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerSupplierRoutes };
