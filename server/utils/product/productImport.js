const createProductImportUtils = ({
  dbGetAsync,
  dbRunAsync,
  dbTxAsync,
  XLSX,
  crypto,
  path,
  SQL_INSERT_IGNORE_CATEGORY,
  normalizeProductInput,
  validateProductPayload,
  findProductConflictAsync,
  buildProductExactKey,
  normalizeTextKey,
}) => {
  const PRODUCT_IMPORT_BATCH_TTL_MS = Number(process.env.PRODUCT_IMPORT_BATCH_TTL_MS || 30 * 60 * 1000);
  const PRODUCT_IMPORT_HEADERS = [
    'id',
    'sku',
    'barcode',
    'name',
    'category',
    'subcategory',
    'brand',
    'sub_brand',
    'content',
    'color',
    'uom',
    'base_unit',
    'uom_type',
    'conversion_factor',
    'purchase_pack_size',
    'price',
    'mrp',
    'stock',
    'expiry_date',
    'image',
    'description',
    'defaultDiscount',
    'discountType',
    'is_active',
  ];
  const PRODUCT_IMPORT_SAMPLE = {
    id: '',
    sku: 'NESC-BRA-250G-129-P12',
    barcode: '',
    name: 'Sample Product',
    category: 'Groceries',
    subcategory: '',
    brand: 'BrandX',
    sub_brand: '',
    content: '250g',
    color: '',
    uom: 'pcs',
    base_unit: 'pcs',
    uom_type: 'selling',
    conversion_factor: 1,
    purchase_pack_size: 12,
    price: 99,
    mrp: 120,
    stock: 25,
    expiry_date: '',
    image: '',
    description: 'Sample product description',
    defaultDiscount: 0,
    discountType: 'fixed',
    is_active: 1,
  };
  const productImportBatches = new Map();

  const createImportBatchChecksum = (rows, mode, stockMode) => (
    crypto
      .createHash('sha256')
      .update(JSON.stringify({ rows, mode, stockMode }))
      .digest('hex')
  );

  const cleanupExpiredImportBatches = () => {
    const now = Date.now();
    for (const [batchId, batch] of productImportBatches.entries()) {
      if (batch.expiresAt <= now) productImportBatches.delete(batchId);
    }
  };

  const applyProductImportBatch = async ({ batchId, checksum, authUser, allowIdenticalRows = [] }) => {
    cleanupExpiredImportBatches();
    const normalizedBatchId = String(batchId || '').trim();
    const normalizedChecksum = String(checksum || '').trim();
    if (!normalizedBatchId || !normalizedChecksum) {
      const err = new Error('batch_id and checksum are required');
      err.status = 400;
      throw err;
    }

    const batch = productImportBatches.get(normalizedBatchId);
    if (!batch) {
      const err = new Error('Import batch not found or expired');
      err.status = 404;
      throw err;
    }
    if (batch.checksum !== normalizedChecksum) {
      const err = new Error('Batch checksum mismatch');
      err.status = 409;
      throw err;
    }
    if ((authUser?.id || null) !== (batch.createdBy || null) && authUser?.role !== 'admin') {
      const err = new Error('Not allowed to confirm this batch');
      err.status = 403;
      throw err;
    }

    const result = {
      created: 0,
      updated: 0,
      failed: 0,
      errors: [],
    };
    const seenInBatch = {
      productIds: new Map(),
      sku: new Map(),
      barcode: new Map(),
      identity: new Map(),
    };
    const allowIdenticalSet = new Set(
      Array.isArray(allowIdenticalRows)
        ? allowIdenticalRows.map((v) => Number(v)).filter((v) => Number.isFinite(v))
        : []
    );

    await dbTxAsync(async () => {
      for (const row of batch.rows) {
        try {
          const existing = row.action === 'update'
            ? await dbGetAsync(`SELECT * FROM products WHERE id = ?`, [row.matched_product_id])
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
            excludeId: row.action === 'update' ? row.matched_product_id : null
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
            if (seenProductRow) throw new Error(`Duplicate update target in import batch (also seen at row ${seenProductRow})`);
            seenInBatch.productIds.set(matchedId, row.row);
          }
          const skuKey = normalizeTextKey(payload.sku);
          if (skuKey) {
            const seenSkuRow = seenInBatch.sku.get(skuKey);
            if (seenSkuRow) throw new Error(`Duplicate SKU in import batch (also seen at row ${seenSkuRow})`);
            seenInBatch.sku.set(skuKey, row.row);
          }
          const barcodeKey = normalizeTextKey(payload.barcode);
          if (barcodeKey) {
            const seenBarcodeRow = seenInBatch.barcode.get(barcodeKey);
            if (seenBarcodeRow) throw new Error(`Duplicate barcode in import batch (also seen at row ${seenBarcodeRow})`);
            seenInBatch.barcode.set(barcodeKey, row.row);
          }
          const identityKey = buildProductExactKey(payload);
          if (identityKey) {
            const seenIdentityRow = seenInBatch.identity.get(identityKey);
            if (seenIdentityRow) throw new Error(`Exact duplicate in import batch (also seen at row ${seenIdentityRow})`);
            seenInBatch.identity.set(identityKey, row.row);
          }

          if (row.action === 'create') {
            await dbRunAsync(
              `INSERT INTO products
              (name, description, brand, sub_brand, content, color, price, mrp, uom, base_unit, uom_type, conversion_factor, purchase_pack_size, sku, barcode, image, stock, category, subcategory, expiry_date, default_discount, discount_type, is_active)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                payload.name,
                payload.description,
                payload.brand,
                payload.sub_brand,
                payload.content,
                payload.color,
                payload.price,
                payload.mrp,
                payload.uom,
                payload.base_unit,
                payload.uom_type,
                payload.conversion_factor,
                payload.purchase_pack_size,
                payload.sku,
                payload.barcode,
                payload.image,
                payload.stock,
                payload.category,
                payload.subcategory,
                payload.expiry_date,
                payload.default_discount,
                payload.discount_type,
                payload.is_active,
              ]
            );
            await dbRunAsync(SQL_INSERT_IGNORE_CATEGORY, [payload.category, 'Product category']);
            result.created += 1;
          } else {
            await dbRunAsync(
              `UPDATE products SET
               name=?, description=?, brand=?, sub_brand=?, content=?, color=?, price=?, mrp=?, uom=?, base_unit=?, uom_type=?, conversion_factor=?, purchase_pack_size=?, sku=?, barcode=?, image=?, stock=?, category=?, subcategory=?, expiry_date=?, default_discount=?, discount_type=?, is_active=?
               WHERE id=?`,
              [
                payload.name,
                payload.description,
                payload.brand,
                payload.sub_brand,
                payload.content,
                payload.color,
                payload.price,
                payload.mrp,
                payload.uom,
                payload.base_unit,
                payload.uom_type,
                payload.conversion_factor,
                payload.purchase_pack_size,
                payload.sku,
                payload.barcode,
                payload.image,
                payload.stock,
                payload.category,
                payload.subcategory,
                payload.expiry_date,
                payload.default_discount,
                payload.discount_type,
                payload.is_active,
                row.matched_product_id,
              ]
            );
            await dbRunAsync(SQL_INSERT_IGNORE_CATEGORY, [payload.category, 'Product category']);
            result.updated += 1;
          }
        } catch (err) {
          result.failed += 1;
          result.errors.push({ row: row.row, message: err.message });
          throw err;
        }
      }
    });

    productImportBatches.delete(normalizedBatchId);
    await dbRunAsync(`UPDATE import_batches SET status = 'applied' WHERE batch_id = ?`, [normalizedBatchId]);

    return {
      batch_id: normalizedBatchId,
      checksum: normalizedChecksum,
      result,
    };
  };

  const parseProductFileToRows = ({ fileName, fileContentBase64 }) => {
    if (!fileName || !fileContentBase64) {
      throw new Error('file_name and file_content_base64 are required');
    }
    const ext = String(path.extname(fileName || '')).toLowerCase();
    const buffer = Buffer.from(String(fileContentBase64 || ''), 'base64');
    let workbook;
    if (ext === '.csv') {
      workbook = XLSX.read(buffer.toString('utf8'), { type: 'string' });
    } else if (ext === '.xlsx' || ext === '.xls') {
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } else {
      throw new Error('Unsupported file format. Use .csv, .xlsx or .xls');
    }

    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) throw new Error('No sheet found in file');
    const sheet = workbook.Sheets[firstSheet];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('No data rows found');
    return rows;
  };

  return {
    PRODUCT_IMPORT_BATCH_TTL_MS,
    PRODUCT_IMPORT_HEADERS,
    PRODUCT_IMPORT_SAMPLE,
    productImportBatches,
    createImportBatchChecksum,
    cleanupExpiredImportBatches,
    applyProductImportBatch,
    parseProductFileToRows,
  };
};

module.exports = { createProductImportUtils };
