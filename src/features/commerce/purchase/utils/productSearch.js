const normalizeProductQuery = (rawValue) => String(rawValue || '')
  .replace(/^\[(recent|all)\]\s*/i, '')
  .trim();

const isActivePurchaseProduct = (product = null) => (
  Boolean(product)
  && product?.is_active !== false
  && Number(product?.is_active ?? 1) !== 0
);

const findActivePurchaseProduct = (products = [], productId = '') => {
  const selectedProductId = String(productId || '').trim();
  if (!selectedProductId) return null;
  const product = (Array.isArray(products) ? products : []).find(
    (entry) => String(entry?.id || '').trim() === selectedProductId
  ) || null;
  return isActivePurchaseProduct(product) ? product : null;
};

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

const getProductSearchSuggestions = ({
  query = '',
  prioritized = [],
  all = [],
  limit = 12,
}) => {
  const normalizedQuery = normalizeProductQuery(query).toLowerCase();
  const seen = new Set();
  const corpus = [
    ...(Array.isArray(prioritized) ? prioritized : []).map((product, orderIndex) => ({
      product,
      scope: 'recent',
      recent: true,
      orderIndex,
    })),
    ...(Array.isArray(all) ? all : []).map((product, orderIndex) => ({
      product,
      scope: 'all',
      recent: false,
      orderIndex,
    })),
  ].filter((entry) => {
    if (!isActivePurchaseProduct(entry?.product)) return false;
    const productId = String(entry?.product?.id || '').trim();
    if (!productId || seen.has(productId)) return false;
    seen.add(productId);
    return true;
  });

  if (!normalizedQuery) {
    return corpus.slice(0, limit);
  }

  const scoreEntry = (entry) => {
    const product = entry?.product || {};
    const name = String(product.name || '').trim().toLowerCase();
    const sku = String(product.sku || '').trim().toLowerCase();
    const barcode = String(product.barcode || '').trim().toLowerCase();
    const label = getProductSearchLabel(product).toLowerCase();
    const nameWords = name.split(/\s+/).filter(Boolean);
    let score = 0;

    if ([String(product.id), name, sku, barcode, label].some((value) => String(value || '').toLowerCase() === normalizedQuery)) {
      score = 1000;
    } else if ([sku, barcode].some((value) => value.startsWith(normalizedQuery))) {
      score = 900;
    } else if (name.startsWith(normalizedQuery)) {
      score = 860;
    } else if (label.startsWith(normalizedQuery)) {
      score = 820;
    } else if (nameWords.some((word) => word.startsWith(normalizedQuery))) {
      score = 780;
    } else if ([sku, barcode].some((value) => value.includes(normalizedQuery))) {
      score = 720;
    } else if (name.includes(normalizedQuery)) {
      score = 680;
    } else if (label.includes(normalizedQuery)) {
      score = 640;
    }

    return score > 0 ? score + (entry.recent ? 25 : 0) : 0;
  };

  return corpus
    .map((entry) => ({
      ...entry,
      score: scoreEntry(entry),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (left.recent !== right.recent) return left.recent ? -1 : 1;
      return left.orderIndex - right.orderIndex;
    })
    .slice(0, limit);
};

const resolveProductByInput = (value, products = []) => {
  const query = normalizeProductQuery(value).toLowerCase();
  if (!query) return null;
  const product = (products || []).find((product) => {
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
  return isActivePurchaseProduct(product) ? product : null;
};

const getDistributorProductOptions = ({ distributorId, products = [], purchaseOrders = [] }) => {
  const selectedDistributorId = String(distributorId || '').trim();
  const activeProducts = (Array.isArray(products) ? products : []).filter(isActivePurchaseProduct);
  if (!selectedDistributorId) {
    return {
      prioritized: [],
      all: activeProducts
    };
  }

  const productById = new Map(
    activeProducts.map((product) => [String(product.id), product])
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
  const all = activeProducts.filter((product) => !prioritizedIdSet.has(String(product.id)));

  return { prioritized, all };
};

const getDistributorProductHistoryEntry = ({
  distributorId,
  productId,
  products = [],
  purchaseOrders = [],
}) => {
  const selectedDistributorId = String(distributorId || '').trim();
  const selectedProductId = String(productId || '').trim();
  if (!selectedDistributorId || !selectedProductId) return null;

  const product = findActivePurchaseProduct(products, selectedProductId);
  if (!product) return null;

  let bestEntry = null;

  (purchaseOrders || []).forEach((order) => {
    if (String(order?.distributor_id || '').trim() !== selectedDistributorId) return;

    const orderTime = new Date(order?.created_at || order?.order_date || order?.expected_delivery || 0).getTime();
    const normalizedOrderTime = Number.isFinite(orderTime) ? orderTime : 0;
    const items = Array.isArray(order?.items) ? order.items : [];

    items.forEach((item) => {
      if (String(item?.product_id || '').trim() !== selectedProductId) return;

      if (!bestEntry || normalizedOrderTime >= bestEntry.latest) {
        bestEntry = {
          product,
          item,
          order,
          latest: normalizedOrderTime,
        };
      }
    });
  });

  return bestEntry;
};

const getLatestProductHistoryEntry = ({
  productId,
  products = [],
  purchaseOrders = [],
}) => {
  const selectedProductId = String(productId || '').trim();
  if (!selectedProductId) return null;

  const product = findActivePurchaseProduct(products, selectedProductId);
  if (!product) return null;
  let bestEntry = null;

  (purchaseOrders || []).forEach((order) => {
    const orderTime = new Date(order?.created_at || order?.order_date || order?.expected_delivery || 0).getTime();
    const normalizedOrderTime = Number.isFinite(orderTime) ? orderTime : 0;
    const items = Array.isArray(order?.items) ? order.items : [];

    items.forEach((item) => {
      if (String(item?.product_id || '').trim() !== selectedProductId) return;

      if (!bestEntry || normalizedOrderTime >= bestEntry.latest) {
        bestEntry = {
          product,
          item,
          order,
          latest: normalizedOrderTime,
        };
      }
    });
  });

  return bestEntry;
};

const getDistributorHistoryProducts = ({
  distributorId,
  products = [],
  purchaseOrders = [],
  buildOrderDraftItem,
}) => {
  const selectedDistributorId = String(distributorId || '').trim();
  if (!selectedDistributorId) return [];

  const activeProducts = (Array.isArray(products) ? products : []).filter(isActivePurchaseProduct);
  const productsById = new Map(activeProducts.map((product) => [String(product.id), product]));
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
          order,
        });
        return;
      }
      existing.count += 1;
      if (normalizedOrderTime >= existing.latest) {
        existing.latest = normalizedOrderTime;
        existing.item = item;
        existing.order = order;
      }
    });
  });

  return [...historyByProductId.values()]
    .sort((left, right) => {
      if (right.latest !== left.latest) return right.latest - left.latest;
      return right.count - left.count;
    })
    .map((entry) => entry.product ? buildOrderDraftItem(entry.product, {
      quantity: Math.max(1, Number(entry.item?.quantity || 1) || 1),
      uom: entry.item?.uom || entry.product?.base_unit || entry.product?.uom || 'pcs',
      rate: entry.item?.rate ?? entry.item?.unit_price ?? entry.product?.price,
      unit_price: entry.item?.unit_price ?? entry.item?.rate ?? entry.product?.price,
      reference_rate: entry.item?.rate ?? entry.item?.unit_price ?? entry.product?.price,
      reference_rate_source: entry.order?.po_number ? `supplier history ${entry.order.po_number}` : 'supplier history',
      gst_rate: entry.item?.gst_rate ?? 5,
      discount_type: 'percent',
      discount_value: 0,
      last_purchase_hint: 'Loaded from supplier history',
      last_purchase_rate: entry.item?.rate ?? entry.item?.unit_price ?? entry.product?.price,
      last_purchase_distributor_name: String(entry.order?.distributor_name || '').trim(),
      last_purchase_created_at: String(
        entry.order?.created_at || entry.order?.order_date || entry.order?.expected_delivery || ''
      ).trim(),
      last_purchase_po_number: String(entry.order?.po_number || '').trim(),
    }) : null)
    .filter(Boolean);
};

export {
  normalizeProductQuery,
  isActivePurchaseProduct,
  findActivePurchaseProduct,
  getProductSearchLabel,
  getProductSearchOptionLabel,
  getProductSearchSuggestions,
  resolveProductByInput,
  getDistributorProductOptions,
  getDistributorProductHistoryEntry,
  getLatestProductHistoryEntry,
  getDistributorHistoryProducts,
};
