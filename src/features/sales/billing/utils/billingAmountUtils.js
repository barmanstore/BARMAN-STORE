import { toPricingQtyFromProduct } from './billingUnitUtils';

const calculateLineAmount = (price, qty, disc, discType, unit = 'pcs', product = null) => {
  const priceNum = Number(price) || 0;
  const qtyNum = Math.max(1, Number(qty) || 1);
  const pricingQty = toPricingQtyFromProduct(qtyNum, unit, product);
  const discNum = Number(disc) || 0;

  const subtotal = priceNum * pricingQty;

  let discountAmount = 0;
  if (discType === 'percentage') {
    const validDiscPercent = Math.min(100, Math.max(0, discNum));
    discountAmount = (subtotal * validDiscPercent) / 100;
  } else {
    discountAmount = Math.min(subtotal, Math.max(0, discNum));
  }

  return { amount: Math.max(0, subtotal - discountAmount) };
};

export { calculateLineAmount };
