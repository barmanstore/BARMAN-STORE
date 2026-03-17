const { normalizePurchaseUomToken } = require('./uomUtils');
const {
  getAllowedPurchaseUnitsForProductRow,
  getPurchaseProductUomProfile,
  toPurchaseBaseQty,
} = require('./productUomProfile');

const createPurchaseItemNormalizer = ({ dbGetAsync, createPurchaseValidationError } = {}) => {
  const normalizePurchaseOrderItems = async (rawItems = []) => {
    const items = Array.isArray(rawItems) ? rawItems : [];
    const productCache = new Map();
    const itemErrors = [];
    const normalizedItems = [];

    for (let index = 0; index < items.length; index += 1) {
      const rowNo = index + 1;
      const it = items[index] || {};
      const productId = Number(it.product_id || 0) || 0;
      if (productId && !productCache.has(productId)) {
        const product = await dbGetAsync(
          `SELECT id, name, uom, base_unit, conversion_factor FROM products WHERE id = ?`,
          [productId]
        );
        productCache.set(productId, product || null);
      }
      const product = productId ? productCache.get(productId) : null;
      if (productId && !product) {
        itemErrors.push(`Item ${rowNo}: product ${productId} not found`);
        continue;
      }

      const quantity = Math.max(0, Number(it.quantity || 0));
      if (quantity <= 0) {
        itemErrors.push(`Item ${rowNo}: quantity must be greater than 0`);
        continue;
      }

      const providedUomRaw = String(it.uom || '').trim();
      let normalizedUom = normalizePurchaseUomToken(providedUomRaw, 'pcs');
      if (product) {
        const allowedUnits = getAllowedPurchaseUnitsForProductRow(product);
        if (providedUomRaw) {
          const requestedUnit = normalizePurchaseUomToken(providedUomRaw, allowedUnits[0] || 'pcs');
          if (!allowedUnits.includes(requestedUnit)) {
            itemErrors.push(
              `Item ${rowNo}: unit "${providedUomRaw}" is invalid for product ${product.id}. Allowed: ${allowedUnits.join(', ')}`
            );
            continue;
          }
          normalizedUom = requestedUnit;
        } else {
          normalizedUom = allowedUnits[0] || getPurchaseProductUomProfile(product).baseUnit;
        }
      }

      const quantityBase = product ? toPurchaseBaseQty(quantity, normalizedUom, product) : quantity;
      const rate = Math.max(0, Number(it.rate ?? it.unit_price ?? 0));
      const gross = quantityBase * rate;
      const discountType = String(it.discount_type || 'percent').toLowerCase() === 'fixed' ? 'fixed' : 'percent';
      const discountValue = Math.max(0, Number(it.discount_value || 0));
      const discountAmountRaw = discountType === 'percent' ? (gross * discountValue) / 100 : discountValue;
      const discountAmount = Math.max(0, Math.min(discountAmountRaw, gross));
      const taxableValue = Math.max(0, gross - discountAmount);
      const gstRate = Math.max(0, Number(it.gst_rate || 0));
      const taxAmount = (taxableValue * gstRate) / 100;
      const lineTotal = taxableValue + taxAmount;
      const unitPriceBeforeDiscount = quantity > 0 ? (gross / quantity) : rate;
      const unitDiscountAmount = quantity > 0 ? (discountAmount / quantity) : 0;
      const unitTaxAmount = quantity > 0 ? (taxAmount / quantity) : 0;
      const unitCostInclTax = quantity > 0 ? (lineTotal / quantity) : 0;

      normalizedItems.push({
        ...it,
        product_id: productId || null,
        product_name: String(it.product_name || '').trim() || String(product?.name || '').trim() || 'Unknown',
        quantity,
        quantity_base: quantityBase,
        uom: normalizedUom,
        rate,
        unit_price: rate,
        unit_price_before_discount: unitPriceBeforeDiscount,
        unit_discount_amount: unitDiscountAmount,
        tax_rate: gstRate,
        unit_tax_amount: unitTaxAmount,
        unit_cost_incl_tax: unitCostInclTax,
        line_total_incl_tax: lineTotal,
        discount_type: discountType,
        discount_value: discountValue,
        taxable_value: taxableValue,
        gst_rate: gstRate,
        tax_amount: taxAmount,
        line_total: lineTotal,
        total: lineTotal,
      });
    }

    if (itemErrors.length) throw createPurchaseValidationError('Invalid purchase order items', itemErrors);
    return normalizedItems;
  };

  return { normalizePurchaseOrderItems };
};

module.exports = { createPurchaseItemNormalizer };
