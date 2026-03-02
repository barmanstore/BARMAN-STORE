const registerProductRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbAllAsync,
    dbGetAsync,
    dbRunAsync,
    logAdminAuditAsync,
    normalizeProductRecord,
    normalizeProductInput,
    validateProductPayload,
    findProductConflictAsync,
    resolveOrCreateCategoryNameAsync,
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

app.get('/api/products', async (req, res) => {
  try {
    const qName = String(req.query?.name || '').trim();
    const qCategory = String(req.query?.category || '').trim();
    const qLowStock = String(req.query?.low_stock || '').trim();
    const includeInactive = String(req.query?.include_inactive || '').trim() === 'true';
    const status = String(req.query?.status || '').trim().toLowerCase();
    let sql = `SELECT * FROM products WHERE 1=1`;
    const params = [];
    if (status === 'active') {
      sql += ` AND COALESCE(is_active, 1) = 1`;
    } else if (status === 'inactive') {
      sql += ` AND COALESCE(is_active, 1) = 0`;
    } else if (!includeInactive) {
      sql += ` AND COALESCE(is_active, 1) = 1`;
    }
    if (qName) {
      sql += ` AND (
        name LIKE ?
        OR sku LIKE ?
        OR brand LIKE ?
        OR barcode LIKE ?
        OR category LIKE ?
        OR subcategory LIKE ?
        OR content LIKE ?
        OR color LIKE ?
      )`;
      const like = `%${qName}%`;
      params.push(like, like, like, like, like, like, like, like);
    }
    if (qCategory) {
      sql += ` AND category = ?`;
      params.push(qCategory);
    }
    if (qLowStock === 'true') {
      sql += ` AND stock <= 10`;
    }
    sql += ` ORDER BY created_at DESC`;
    const rows = await dbAllAsync(sql, params);
    return res.json(rows.map(normalizeProductRecord));
  } catch (error) {
    return res.status(500).json({ error: error.message });
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
    const categoryName = await resolveOrCreateCategoryNameAsync(body.category || 'Groceries');
    const result = await dbRunAsync(
      `INSERT INTO products
      (name, description, brand, sub_brand, content, color, price, mrp, uom, sku, barcode, image, stock, category, subcategory, expiry_date, default_discount, discount_type, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        body.sku,
        body.barcode,
        body.image || null,
        Number(body.stock || 0),
        categoryName,
        body.subcategory || null,
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
    const categoryName = await resolveOrCreateCategoryNameAsync(body.category || current.category || 'Groceries');
    await dbRunAsync(
      `UPDATE products SET
       name=?, description=?, brand=?, sub_brand=?, content=?, color=?, price=?, mrp=?, uom=?, sku=?, barcode=?, image=?, stock=?, category=?, subcategory=?, expiry_date=?, default_discount=?, discount_type=?, is_active=?
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
        body.sku,
        body.barcode,
        body.image,
        Number(body.stock),
        categoryName,
        body.subcategory,
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

app.get('/api/categories', async (_, res) => {
  try {
    const rows = await dbAllAsync(`SELECT id, name, description, created_at FROM categories ORDER BY name ASC`);
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/categories', requireAdmin, async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Category name is required' });
    const result = await dbRunAsync(`INSERT INTO categories (name, description) VALUES (?, ?)`, [name, req.body?.description || null]);
    return res.status(201).json(await dbGetAsync(`SELECT * FROM categories WHERE id = ?`, [result.lastInsertRowid]));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/categories/:id', requireAdmin, async (req, res) => {
  try {
    const current = await dbGetAsync(`SELECT * FROM categories WHERE id = ?`, [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Category not found' });
    await dbRunAsync(`UPDATE categories SET name=?, description=? WHERE id=?`, [
      req.body?.name ?? current.name,
      req.body?.description ?? current.description,
      req.params.id,
    ]);
    return res.json(await dbGetAsync(`SELECT * FROM categories WHERE id = ?`, [req.params.id]));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/categories/:id', requireAdmin, async (req, res) => {
  try {
    await dbRunAsync(`DELETE FROM categories WHERE id = ?`, [req.params.id]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});
};

module.exports = {
  registerProductRoutes,
};
