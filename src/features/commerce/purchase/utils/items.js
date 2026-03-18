const findProductForItem = (products = [], item = {}) => {
  const productId = Number(item?.product_id || 0);
  if (productId > 0) {
    const byId = products.find((product) => Number(product?.id || 0) === productId);
    if (byId) return byId;
  }
  const nameKey = String(item?.product_name || '').trim().toLowerCase();
  if (!nameKey) return null;
  return products.find(
    (product) => String(product?.name || '').trim().toLowerCase() === nameKey
  ) || null;
};

const createEmptyOrderItem = () => ({
  product_id: '',
  product_query: '',
  product_name: '',
  quantity: 1,
  uom: 'pcs',
  unit_price: 0,
  rate: 0,
  reference_rate: 0,
  reference_rate_source: '',
  gst_rate: 5,
  discount_type: 'percent',
  discount_value: 0,
  last_purchase_hint: '',
});

const mergeProductsById = (existingProducts = [], incomingProducts = []) => {
  const normalizedIncoming = Array.isArray(incomingProducts)
    ? incomingProducts.filter((product) => product && product.id !== undefined && product.id !== null)
    : [];
  if (!normalizedIncoming.length) return existingProducts;

  const incomingIds = new Set(normalizedIncoming.map((product) => String(product.id)));
  const preservedProducts = existingProducts.filter((product) => !incomingIds.has(String(product?.id)));
  return [...normalizedIncoming, ...preservedProducts];
};

export { createEmptyOrderItem, findProductForItem, mergeProductsById };
