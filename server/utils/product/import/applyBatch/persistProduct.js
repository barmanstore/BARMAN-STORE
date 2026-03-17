const persistProductRow = async ({
  action,
  payload,
  matchedProductId,
  dbRunAsync,
  SQL_INSERT_IGNORE_CATEGORY,
}) => {
  if (action === 'create') {
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
    return { created: 1, updated: 0 };
  }

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
      matchedProductId,
    ]
  );
  await dbRunAsync(SQL_INSERT_IGNORE_CATEGORY, [payload.category, 'Product category']);
  return { created: 0, updated: 1 };
};

module.exports = { persistProductRow };
