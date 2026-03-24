const isCustomBillItem = (item = {}) =>
  String(item?.item_type || '').trim().toLowerCase() === 'custom' || Boolean(item?.is_custom);

const sanitizeBillItems = async ({
  deps,
  items,
  createHttpError,
  allowLineItemsWithoutProduct,
}) => {
  const {
    dbGetAsync,
    normalizeUomToken,
    getProductUomProfile,
    getAllowedBillingUnits,
    toPricingQty,
  } = deps;

  const productCache = new Map();
  const itemErrors = [];
  const sanitizedItems = [];

  for (let index = 0; index < items.length; index += 1) {
    const it = items[index];
    const rowNo = index + 1;
    const productId = Number(it.product_id || 0);
    const allowMissingProductForItem = allowLineItemsWithoutProduct && isCustomBillItem(it);
    if (!productId && !allowMissingProductForItem) {
      itemErrors.push(`Item ${rowNo}: product_id is required`);
      continue;
    }
    if (productId && !productCache.has(productId)) {
      productCache.set(
        productId,
        (await dbGetAsync(
          'SELECT id, name, price, category, subcategory, stock, is_active, uom, base_unit, uom_type, conversion_factor FROM products WHERE id = ?',
          [productId]
        )) || null
      );
    }
    const product = productId ? productCache.get(productId) : null;
    if (!product && productId && !allowMissingProductForItem) {
      itemErrors.push(`Item ${rowNo}: Product ${productId} not found`);
      continue;
    }
    if (product && Number(product.is_active ?? 1) !== 1 && !allowMissingProductForItem) {
      itemErrors.push(`Item ${rowNo}: Product ${productId} is inactive`);
      continue;
    }
    const qty = Math.max(0, Number(it.qty || 0));
    const submittedMrp = Math.max(0, Number(it.mrp || 0));
    const productPrice = Math.max(0, Number(product?.price || 0));
    const pricingQty = toPricingQty(qty, it.unit, product);
    const skipOffers = Boolean(it?.skip_offers)
      || (product && submittedMrp > 0 && Math.abs(submittedMrp - productPrice) > 0.009);
    const baseMrp = skipOffers ? submittedMrp : (product ? productPrice : submittedMrp);
    const lineSubtotal = baseMrp * pricingQty;
    const manualDiscount = Math.min(lineSubtotal, Math.max(0, Number(it.discount || 0)));
    const productName =
      String(it.product_name || '').trim()
      || String(product?.name || '').trim()
      || 'Unknown';
    if (!productName) {
      itemErrors.push(`Item ${rowNo}: product_name is required`);
      continue;
    }
    const providedUnitRaw = String(it.unit || '').trim();
    let normalizedUnit = normalizeUomToken(providedUnitRaw, 'pcs');
    if (product) {
      const profile = getProductUomProfile(product);
      const allowedUnits = getAllowedBillingUnits(product);
      if (providedUnitRaw) {
        const requestedUnit = normalizeUomToken(providedUnitRaw, profile.sellingUnit);
        if (!allowedUnits.includes(requestedUnit)) {
          itemErrors.push(
            `Item ${rowNo}: unit "${providedUnitRaw}" is invalid for product ${product.id}. Allowed: ${allowedUnits.join(', ')}`
          );
          continue;
        }
        normalizedUnit = requestedUnit;
      } else {
        normalizedUnit = allowedUnits[0] || profile.baseUnit;
      }
    }
    const normalized = {
      client_item_id: it.client_item_id ?? rowNo,
      linked_order_item_id: Number(it?.linked_order_item_id || 0) || null,
      product_id: product ? Number(product.id) : null,
      product_name: productName,
      mrp: baseMrp,
      submitted_mrp: submittedMrp,
      qty,
      unit: normalizedUnit,
      manual_discount: manualDiscount,
      skip_offers: skipOffers,
    };
    if (normalized.qty > 0 && normalized.mrp >= 0) {
      sanitizedItems.push(normalized);
    }
  }

  if (itemErrors.length) {
    throw createHttpError(400, 'Invalid bill items', itemErrors);
  }

  if (!sanitizedItems.length) throw createHttpError(400, 'At least one valid item is required');

  return { sanitizedItems, productCache };
};

module.exports = { sanitizeBillItems };
