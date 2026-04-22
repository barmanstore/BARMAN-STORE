const { persistProductRow } = require('./persistProduct');

const processImportRow = async ({ row, deps, seenInBatch, allowIdenticalSet }) => {
  const {
    dbGetAsync,
    normalizeProductInput,
    validateProductPayload,
    findProductConflictAsync,
    buildProductExactKey,
    normalizeTextKey,
    dbRunAsync,
    SQL_INSERT_IGNORE_CATEGORY,
  } = deps;

  const existing =
    row.action === 'update'
      ? await dbGetAsync('SELECT * FROM products WHERE id = ?', [row.matched_product_id])
      : null;
  if (row.action === 'update' && !existing) {
    throw new Error('Matched product no longer exists');
  }

  const payload = normalizeProductInput(row.payload, existing || null);
  const validationErrors = validateProductPayload(payload);
  if (validationErrors.length) {
    throw new Error(validationErrors.join('; '));
  }

  const duplicate = await findProductConflictAsync(payload, {
    excludeId: row.action === 'update' ? row.matched_product_id : null,
  });
  if (duplicate) {
    if (duplicate.severity === 'confirm') {
      if (!allowIdenticalSet.has(Number(row.row))) {
        throw new Error(`${duplicate.message} (row ${row.row} requires allow_identical choice)`);
      }
    } else {
      throw new Error(duplicate.message);
    }
  }

  const matchedId = row.action === 'update' ? Number(row.matched_product_id) : null;
  if (matchedId) {
    const seenProductRow = seenInBatch.productIds.get(matchedId);
    if (seenProductRow)
      throw new Error(
        `Duplicate update target in import batch (also seen at row ${seenProductRow})`
      );
    seenInBatch.productIds.set(matchedId, row.row);
  }
  const skuKey = normalizeTextKey(payload.sku);
  if (skuKey) {
    const seenSkuRow = seenInBatch.sku.get(skuKey);
    if (seenSkuRow)
      throw new Error(`Duplicate SKU in import batch (also seen at row ${seenSkuRow})`);
    seenInBatch.sku.set(skuKey, row.row);
  }
  const barcodeKey = normalizeTextKey(payload.barcode);
  if (barcodeKey) {
    const seenBarcodeRow = seenInBatch.barcode.get(barcodeKey);
    if (seenBarcodeRow)
      throw new Error(`Duplicate barcode in import batch (also seen at row ${seenBarcodeRow})`);
    seenInBatch.barcode.set(barcodeKey, row.row);
  }
  const identityKey = buildProductExactKey(payload);
  if (identityKey) {
    const seenIdentityRow = seenInBatch.identity.get(identityKey);
    if (seenIdentityRow)
      throw new Error(`Exact duplicate in import batch (also seen at row ${seenIdentityRow})`);
    seenInBatch.identity.set(identityKey, row.row);
  }

  return persistProductRow({
    action: row.action,
    payload,
    matchedProductId: row.matched_product_id,
    dbRunAsync,
    SQL_INSERT_IGNORE_CATEGORY,
  });
};

module.exports = { processImportRow };
