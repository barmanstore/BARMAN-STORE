const createProductExportUtils = () => {
  const toProductExportRow = (row) => ({
    id: row.id,
    sku: row.sku || '',
    barcode: row.barcode || '',
    name: row.name || '',
    category: row.category || '',
    subcategory: row.subcategory || '',
    brand: row.brand || '',
    sub_brand: row.sub_brand || '',
    content: row.content || '',
    color: row.color || '',
    uom: row.uom || 'pcs',
    base_unit: row.base_unit || row.uom || 'pcs',
    uom_type: row.uom_type || 'selling',
    conversion_factor: Number(row.conversion_factor || 1),
    purchase_pack_size: row.purchase_pack_size == null ? '' : Number(row.purchase_pack_size),
    price: Number(row.price || 0),
    mrp: Number(row.mrp || 0),
    stock: Number(row.stock || 0),
    expiry_date: row.expiry_date || '',
    image: row.image || '',
    description: row.description || '',
    defaultDiscount: Number(row.default_discount || 0),
    discountType: row.discount_type || 'fixed',
    is_active: Number(row.is_active ?? 1),
  });

  return { toProductExportRow };
};

module.exports = { createProductExportUtils };
