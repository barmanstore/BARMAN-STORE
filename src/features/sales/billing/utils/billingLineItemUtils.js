import { formatCurrency as formatCurrencyDefault } from '../../../../shared/utils/formatters';
import { resolveLineUnitForProduct } from './billingUnitUtils';

const createEmptyItem = () => ({
  id: Date.now() + Math.random(),
  name: '',
  price: 0,
  qty: 1,
  unit: 'pcs',
  disc: 0,
  discType: 'fixed',
  amount: 0
});

const getProductOptionLabel = (product = null, formatCurrency) => {
  if (!product) return '';

  const name = String(product.name || '').trim() || 'Product';
  const price = Number(product.price ?? product.mrp ?? 0) || 0;
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

export { createEmptyItem, getProductOptionLabel };
