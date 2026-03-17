const createProductImportStore = ({ crypto }) => {
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

  return {
    PRODUCT_IMPORT_BATCH_TTL_MS,
    PRODUCT_IMPORT_HEADERS,
    PRODUCT_IMPORT_SAMPLE,
    productImportBatches,
    createImportBatchChecksum,
    cleanupExpiredImportBatches,
  };
};

module.exports = { createProductImportStore };
