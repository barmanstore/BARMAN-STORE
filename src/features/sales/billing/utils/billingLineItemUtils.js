import { formatCurrency as formatCurrencyDefault } from '../../../../shared/utils/formatters';
import { resolveLineUnitForProduct } from './billingUnitUtils';

const roundMoney = (value = 0) => Math.round((Number(value) || 0) * 100) / 100;

const createEmptyItem = () => ({
  id: Date.now() + Math.random(),
  type: 'inventory',
  productId: null,
  name: '',
  isCustom: false,
  price: 0,
  qty: 1,
  unit: 'pcs',
  disc: 0,
  discount: 0,
  discType: 'fixed',
  amount: 0,
  total: 0,
});

const getProductDefaultPrice = (product = null) => Number(product?.price ?? product?.mrp ?? 0) || 0;

const getStockWarningMeta = (product = null, pricingQty = 0) => {
  const stock = Number(product?.stock);
  const requiredQty = Math.max(0, Number(pricingQty || 0) || 0);
  if (!Number.isFinite(stock)) return null;

  if (stock < 0) {
    return {
      tone: 'danger',
      text: `Negative stock: ${stock} (selling anyway)`,
    };
  }

  if (stock === 0) {
    return {
      tone: 'danger',
      text: 'Out of stock (selling anyway)',
    };
  }

  const projectedBalance = roundMoney(stock - requiredQty);
  if (projectedBalance < 0) {
    return {
      tone: 'danger',
      text: `Only ${stock} left, stock will become ${projectedBalance}`,
    };
  }

  if (stock <= requiredQty || stock <= 5) {
    return {
      tone: 'warning',
      text: `Only ${stock} left`,
    };
  }

  return null;
};

const getProductOptionLabel = (product = null, formatCurrency) => {
  if (!product) return '';

  const name = String(product.name || '').trim() || 'Product';
  const price = getProductDefaultPrice(product);
  const defaultUnit = resolveLineUnitForProduct(
    product,
    product.base_unit || product.uom || product.unit || 'pcs'
  );
  const formatPrice = typeof formatCurrency === 'function' ? formatCurrency : formatCurrencyDefault;
  const parts = [name];

  if (price > 0) {
    parts.push(`${formatPrice(price)} / ${defaultUnit}`);
  }
  if (product.sku) {
    parts.push(`SKU: ${String(product.sku).trim()}`);
  }
  if (product.brand) {
    parts.push(String(product.brand).trim());
  }

  return parts.join(' | ');
};

export { createEmptyItem, getProductDefaultPrice, getProductOptionLabel, getStockWarningMeta };
