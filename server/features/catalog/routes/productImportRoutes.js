const registerProductImportRoutes = (deps) => {
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
        continue;
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

};

module.exports = { registerProductImportRoutes };

