const createInventoryUtils = (deps = {}) => {
  const { dbGetAsync, dbRunAsync, mergeDistributorProductKnowledge } = deps;

  const syncProductKnowledgeTextAsync = async ({
    tableName,
    idColumn,
    idValue,
    manualProductsSupplied = '',
    itemNames = [],
  } = {}) => {
    const normalizedIdValue = Number(idValue || 0);
    if (!normalizedIdValue) return null;
    const normalizedItemNames = (Array.isArray(itemNames) ? itemNames : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    const currentText = String(manualProductsSupplied || '').trim();
    if (!normalizedItemNames.length) return currentText || null;
    const merged = mergeDistributorProductKnowledge({
      manualProductsSupplied: currentText,
      likelyItems: normalizedItemNames,
    });
    const nextText = merged.merged_text;
    if (currentText === nextText) {
      return nextText;
    }
    await dbRunAsync(
      `UPDATE ${tableName}
       SET products_supplied = ?, updated_at = CURRENT_TIMESTAMP
       WHERE ${idColumn} = ?`,
      [nextText || null, normalizedIdValue]
    );
    return nextText;
  };

  const syncDistributorProductsSuppliedAsync = async (
    distributorId,
    items = [],
    { supplierId = null } = {}
  ) => {
    const normalizedDistributorId = Number(distributorId || 0);
    if (!normalizedDistributorId) return null;
    const distributor = await dbGetAsync(
      `SELECT products_supplied
       FROM distributors
       WHERE id = ?`,
      [normalizedDistributorId]
    );
    if (!distributor) return null;
    const itemNames = (Array.isArray(items) ? items : [])
      .map((item) => String(item?.product_name || item?.name || '').trim())
      .filter(Boolean);
    const normalizedSupplierId = Number(supplierId || 0) || null;
    if (normalizedSupplierId) {
      const supplier = await dbGetAsync(
        `SELECT id, products_supplied
         FROM suppliers
         WHERE id = ?
           AND distributor_id = ?`,
        [normalizedSupplierId, normalizedDistributorId]
      );
      if (supplier) {
        await syncProductKnowledgeTextAsync({
          tableName: 'suppliers',
          idColumn: 'id',
          idValue: supplier.id,
          manualProductsSupplied: supplier.products_supplied || '',
          itemNames,
        });
      }
    }
    return syncProductKnowledgeTextAsync({
      tableName: 'distributors',
      idColumn: 'id',
      idValue: normalizedDistributorId,
      manualProductsSupplied: distributor.products_supplied || '',
      itemNames,
    });
  };

  const recordProductCostHistoryEntryAsync = async ({
    productId,
    distributorId,
    purchaseOrderId,
    purchaseOrderItemId,
    unitCostInclTax,
    taxRate,
    discountAmount,
    transactionTs,
  } = {}) => {
    if (!productId || !distributorId || !purchaseOrderId || !purchaseOrderItemId) return null;
    return dbRunAsync(
      `INSERT INTO product_cost_history
       (product_id, distributor_id, po_id, po_item_id, unit_cost_incl_tax, tax_rate, discount_amount, transaction_ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(productId || 0),
        Number(distributorId || 0),
        Number(purchaseOrderId || 0),
        Number(purchaseOrderItemId || 0),
        Number(unitCostInclTax || 0),
        Number(taxRate || 0),
        Number(discountAmount || 0),
        transactionTs || new Date().toISOString(),
      ]
    );
  };

  const upsertSupplierProductsAsync = async (
    distributorId,
    items = [],
    { supplierId = null } = {}
  ) => {
    const normalizedDistributorId = Number(distributorId || 0);
    if (!normalizedDistributorId) return null;
    let normalizedSupplierId = Number(supplierId || 0) || null;
    if (!normalizedSupplierId) {
      const primarySupplier = await dbGetAsync(
        `SELECT id
         FROM suppliers
         WHERE distributor_id = ?
           AND is_primary = TRUE
         ORDER BY id ASC
         LIMIT 1`,
        [normalizedDistributorId]
      );
      normalizedSupplierId = Number(primarySupplier?.id || 0) || null;
    }
    if (!normalizedSupplierId) return null;
    const uniqueItems = new Map();
    for (const item of Array.isArray(items) ? items : []) {
      const productId = Number(item?.product_id || 0);
      if (!productId) continue;
      if (!uniqueItems.has(productId)) uniqueItems.set(productId, item);
    }
    for (const item of uniqueItems.values()) {
      const unitCost = Number(item?.unit_cost_incl_tax ?? 0);
      if (!Number.isFinite(unitCost) || unitCost <= 0) continue;
      await dbRunAsync(
        `INSERT INTO supplier_products (distributor_id, supplier_id, product_id, last_known_unit_cost_incl_tax, last_updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT (supplier_id, product_id)
         DO UPDATE SET
           distributor_id = EXCLUDED.distributor_id,
           last_known_unit_cost_incl_tax = EXCLUDED.last_known_unit_cost_incl_tax,
           is_available = TRUE,
           availability_note = NULL,
           last_updated_at = CURRENT_TIMESTAMP`,
        [normalizedDistributorId, normalizedSupplierId, Number(item.product_id || 0), unitCost]
      );
    }
    return true;
  };

  const logStockLedgerAsync = async ({
    productId,
    transactionType,
    quantityChange,
    previousBalance,
    newBalance,
    referenceType = null,
    referenceId = null,
    userId = null,
    userName = null,
    notes = null,
  }) => {
    const product = await dbGetAsync(`SELECT name, sku FROM products WHERE id = ?`, [productId]);
    await dbRunAsync(
      `INSERT INTO stock_ledger
      (product_id, product_name, sku, transaction_type, quantity_change, previous_balance, new_balance, reference_type, reference_id, user_id, user_name, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        productId,
        product?.name || null,
        product?.sku || null,
        transactionType,
        Number(quantityChange || 0),
        Number(previousBalance || 0),
        Number(newBalance || 0),
        referenceType || null,
        referenceId || null,
        userId || null,
        userName || null,
        notes || null,
      ]
    );
  };

  return {
    syncDistributorProductsSuppliedAsync,
    recordProductCostHistoryEntryAsync,
    upsertSupplierProductsAsync,
    logStockLedgerAsync,
  };
};

module.exports = { createInventoryUtils };
