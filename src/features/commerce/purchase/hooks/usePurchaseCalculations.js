import { useCallback } from 'react';
import { getProductSearchLabel } from '../utils/productSearch';

function usePurchaseCalculations({
  products,
  toNumber,
  createEmptyOrderItem,
  resolvePurchaseUnitForProduct,
  getProductUomProfile,
  toBaseQtyForProduct,
  normalizeGstRateOption,
  findProductForItem,
}) {
  const buildOrderDraftItem = useCallback((product = null, overrides = {}) => {
    const resolvedProduct = product || null;
    const resolvedRate = Math.max(0, toNumber(overrides.rate ?? overrides.unit_price ?? resolvedProduct?.price));
    const resolvedUom = resolvePurchaseUnitForProduct(
      resolvedProduct,
      overrides.uom || resolvedProduct?.base_unit || resolvedProduct?.uom || 'pcs'
    );
    return {
      ...createEmptyOrderItem(),
      product_id: resolvedProduct?.id ? String(resolvedProduct.id) : String(overrides.product_id || ''),
      product_query: resolvedProduct ? getProductSearchLabel(resolvedProduct) : String(overrides.product_query || overrides.product_name || '').trim(),
      product_name: String(overrides.product_name || resolvedProduct?.name || '').trim(),
      quantity: Math.max(1, toNumber(overrides.quantity ?? 1)),
      uom: resolvedUom,
      unit_price: resolvedRate,
      rate: resolvedRate,
      reference_rate: Math.max(0, toNumber(overrides.reference_rate ?? resolvedRate)),
      reference_rate_source: String(overrides.reference_rate_source || (resolvedRate > 0 ? 'current reference rate' : '')).trim(),
      gst_rate: normalizeGstRateOption(overrides.gst_rate ?? 5),
      discount_type: overrides.discount_type === 'fixed' ? 'fixed' : 'percent',
      discount_value: Math.max(0, toNumber(overrides.discount_value || 0)),
      last_purchase_hint: String(overrides.last_purchase_hint || '').trim(),
    };
  }, [
    createEmptyOrderItem,
    normalizeGstRateOption,
    resolvePurchaseUnitForProduct,
    toNumber,
  ]);

  const calculateOrderItem = useCallback((item) => {
    const product = findProductForItem(products, item);
    const profile = getProductUomProfile(product);
    const quantity = Math.max(0, toNumber(item.quantity));
    const uom = resolvePurchaseUnitForProduct(product, item.uom || profile.baseUnit);
    const quantityInBase = toBaseQtyForProduct(quantity, uom, product);
    const rate = Math.max(0, toNumber(item.rate ?? item.unit_price));
    const grossAmount = quantityInBase * rate;
    const discountType = item.discount_type === 'fixed' ? 'fixed' : 'percent';
    const discountValue = Math.max(0, toNumber(item.discount_value));
    const discountAmountRaw = discountType === 'percent'
      ? (grossAmount * discountValue) / 100
      : discountValue;
    const discountAmount = Math.max(0, Math.min(discountAmountRaw, grossAmount));
    const taxableValue = Math.max(0, grossAmount - discountAmount);
    const gstRate = Math.max(0, toNumber(item.gst_rate));
    const taxAmount = (taxableValue * gstRate) / 100;
    const totalAmount = taxableValue + taxAmount;

    return {
      quantity,
      quantityInBase,
      uom,
      baseUnit: profile.baseUnit,
      rate,
      grossAmount,
      discountType,
      discountValue,
      discountAmount,
      taxableValue,
      gstRate,
      taxAmount,
      totalAmount
    };
  }, [
    findProductForItem,
    getProductUomProfile,
    products,
    resolvePurchaseUnitForProduct,
    toBaseQtyForProduct,
    toNumber,
  ]);

  const calculateOrderTotals = useCallback((items = []) => {
    return items.reduce((totals, item) => {
      const line = calculateOrderItem(item);
      totals.grossAmount += line.grossAmount;
      totals.discountAmount += line.discountAmount;
      totals.taxableValue += line.taxableValue;
      totals.taxAmount += line.taxAmount;
      totals.totalAmount += line.totalAmount;
      return totals;
    }, {
      grossAmount: 0,
      discountAmount: 0,
      taxableValue: 0,
      taxAmount: 0,
      totalAmount: 0
    });
  }, [calculateOrderItem]);

  return {
    buildOrderDraftItem,
    calculateOrderItem,
    calculateOrderTotals,
  };
}

export default usePurchaseCalculations;
