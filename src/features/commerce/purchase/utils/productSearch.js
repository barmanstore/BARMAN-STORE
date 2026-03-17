const normalizeProductQuery = (rawValue) => String(rawValue || '')
  .replace(/^\[(recent|all)\]\s*/i, '')
  .trim();

const getProductSearchLabel = (product) => {
  if (!product) return '';
  const name = String(product.name || '').trim();
  const sku = String(product.sku || '').trim();
  return sku ? `${name} (${sku})` : name;
};

const getProductSearchOptionLabel = (product, scope = 'all') => {
  const base = getProductSearchLabel(product);
  return scope === 'recent' ? `[Recent] ${base}` : `[All] ${base}`;
};

const resolveProductByInput = (value, products = []) => {
  const query = normalizeProductQuery(value).toLowerCase();
  if (!query) return null;
  return (products || []).find((product) => {
    if (!product) return false;
    const name = String(product.name || '').trim().toLowerCase();
    const sku = String(product.sku || '').trim().toLowerCase();
    const label = getProductSearchLabel(product).toLowerCase();
    return (
      String(product.id) === query ||
      name === query ||
      sku === query ||
      label === query
    );
  }) || null;
};

const getDistributorProductOptions = ({ distributorId, products = [], purchaseOrders = [] }) => {
  const selectedDistributorId = String(distributorId || '').trim();
  if (!selectedDistributorId) {
    return {
      prioritized: [],
      all: products
    };
  }

  const productById = new Map(
    products.map((product) => [String(product.id), product])
  );
  const scoreByProductId = new Map();

  (purchaseOrders || []).forEach((order) => {
    if (String(order?.distributor_id || '') !== selectedDistributorId) return;

    const orderTime = new Date(order?.created_at || order?.order_date || order?.expected_delivery || 0).getTime();
    const items = Array.isArray(order?.items) ? order.items : [];

    items.forEach((item) => {
      const productId = String(item?.product_id || '').trim();
      if (!productId) return;

      const existing = scoreByProductId.get(productId) || { count: 0, latest: 0 };
      scoreByProductId.set(productId, {
        count: existing.count + 1,
        latest: Math.max(existing.latest, Number.isFinite(orderTime) ? orderTime : 0)
      });
    });
  });

  const prioritizedIds = [...scoreByProductId.entries()]
    .sort((a, b) => {
      if (b[1].latest !== a[1].latest) return b[1].latest - a[1].latest;
      return b[1].count - a[1].count;
    })
    .map(([productId]) => productId);

  const prioritized = prioritizedIds
    .map((productId) => productById.get(productId))
    .filter(Boolean);

  const prioritizedIdSet = new Set(prioritized.map((product) => String(product.id)));
  const all = products.filter((product) => !prioritizedIdSet.has(String(product.id)));

  return { prioritized, all };
};

const getDistributorHistoryProducts = ({
  distributorId,
  products = [],
  purchaseOrders = [],
  buildOrderDraftItem,
}) => {
  const selectedDistributorId = String(distributorId || '').trim();
  if (!selectedDistributorId) return [];

  const productsById = new Map(products.map((product) => [String(product.id), product]));
  const historyByProductId = new Map();

  (purchaseOrders || []).forEach((order) => {
    if (String(order?.distributor_id || '') !== selectedDistributorId) return;
    const orderTime = new Date(order?.created_at || order?.order_date || order?.expected_delivery || 0).getTime();
    const normalizedOrderTime = Number.isFinite(orderTime) ? orderTime : 0;
    const items = Array.isArray(order?.items) ? order.items : [];
    items.forEach((item) => {
      const productId = String(item?.product_id || '').trim();
      if (!productId) return;
      const product = productsById.get(productId);
      if (!product) return;
      const existing = historyByProductId.get(productId);
      if (!existing) {
        historyByProductId.set(productId, {
          product,
          count: 1,
          latest: normalizedOrderTime,
          item,
        });
        return;
      }
      existing.count += 1;
      if (normalizedOrderTime >= existing.latest) {
        existing.latest = normalizedOrderTime;
        existing.item = item;
      }
    });
  });

  return [...historyByProductId.values()]
    .sort((left, right) => {
      if (right.latest !== left.latest) return right.latest - left.latest;
      return right.count - left.count;
    })
    .map((entry) => entry.product ? buildOrderDraftItem(entry.product, {
      quantity: 0,
      uom: entry.item?.uom || entry.product?.base_unit || entry.product?.uom || 'pcs',
      rate: entry.item?.rate ?? entry.item?.unit_price ?? entry.product?.price,
      unit_price: entry.item?.unit_price ?? entry.item?.rate ?? entry.product?.price,
      gst_rate: entry.item?.gst_rate ?? 5,
      discount_type: entry.item?.discount_type,
      discount_value: entry.item?.discount_value ?? 0,
      last_purchase_hint: 'Loaded from distributor history',
    }) : null)
    .filter(Boolean);
};

export {
  normalizeProductQuery,
  getProductSearchLabel,
  getProductSearchOptionLabel,
  resolveProductByInput,
  getDistributorProductOptions,
  getDistributorHistoryProducts,
};
