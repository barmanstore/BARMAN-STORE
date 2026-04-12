import { getPurchaseDraftDiagnostics } from './orderDraftValidation';

const normalizeDraftRate = (value, toNumber) => Math.max(0, toNumber(value));
const hasSelectedProduct = (item = {}) => String(item?.product_id || '').trim().length > 0;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DISCOUNT_TYPE = 'percent';
const DEFAULT_DISCOUNT_VALUE = 0;
const PURCHASE_ORDER_ITEM_ROW_SOURCE_SUPPLIER = 'supplier';
const PURCHASE_ORDER_ITEM_ROW_SOURCE_MANUAL = 'manual';
const DISCOUNT_ACK_RESET_FIELDS = new Set([
  'quantity',
  'uom',
  'rate',
  'unit_price',
  'discount_type',
  'discount_value',
]);
const RATE_ACK_RESET_FIELDS = new Set([
  'rate',
  'unit_price',
]);

const toDateLabel = (value) => {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString();
};

const getRelativeAgeLabel = (value) => {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  const ageInDays = Math.max(0, Math.floor((Date.now() - dt.getTime()) / ONE_DAY_MS));
  if (ageInDays === 0) return 'today';
  if (ageInDays === 1) return '1 day ago';
  return `${ageInDays} days ago`;
};

const formatDraftCurrency = (value) => Number(value || 0).toFixed(2);

const normalizePurchaseOrderItemRowSource = (
  value,
  fallback = PURCHASE_ORDER_ITEM_ROW_SOURCE_MANUAL,
) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (
    normalized === PURCHASE_ORDER_ITEM_ROW_SOURCE_SUPPLIER
    || normalized === 'supplier_default'
  ) {
    return PURCHASE_ORDER_ITEM_ROW_SOURCE_SUPPLIER;
  }
  if (
    normalized === PURCHASE_ORDER_ITEM_ROW_SOURCE_MANUAL
    || normalized === 'manual_added'
  ) {
    return PURCHASE_ORDER_ITEM_ROW_SOURCE_MANUAL;
  }
  return fallback;
};

const getPurchaseDraftItemSourceFlags = (item = {}) => {
  const fallbackSource = item?.po_item_locked === true
    ? PURCHASE_ORDER_ITEM_ROW_SOURCE_SUPPLIER
    : PURCHASE_ORDER_ITEM_ROW_SOURCE_MANUAL;
  const rowSource = normalizePurchaseOrderItemRowSource(
    item?.row_source || item?.po_item_source,
    fallbackSource,
  );
  const supplierDefault = rowSource === PURCHASE_ORDER_ITEM_ROW_SOURCE_SUPPLIER;
  return {
    rowSource,
    poItemSource: supplierDefault ? 'supplier_default' : 'manual_added',
    poItemLocked: supplierDefault,
  };
};

const getLastPurchaseMeta = (item = {}) => {
  const rate = Number(item?.last_purchase_rate || 0) || 0;
  const distributorName = String(item?.last_purchase_distributor_name || '').trim();
  const createdAt = String(item?.last_purchase_created_at || '').trim();
  const poNumber = String(item?.last_purchase_po_number || '').trim();
  const fallbackHint = String(item?.last_purchase_hint || '').trim();
  const dateLabel = toDateLabel(createdAt);
  const ageLabel = getRelativeAgeLabel(createdAt);

  return {
    hasValue: rate > 0 || Boolean(distributorName) || Boolean(createdAt) || Boolean(poNumber) || Boolean(fallbackHint),
    rate,
    distributorName,
    createdAt,
    poNumber,
    dateLabel,
    ageLabel,
    fallbackHint,
  };
};

const buildLastPurchaseHint = ({
  rate = 0,
  distributorName = '',
  createdAt = '',
}) => {
  const summaryParts = [];
  if (Number(rate || 0) > 0) {
    summaryParts.push(`Last ${formatDraftCurrency(rate)}`);
  }
  if (String(distributorName || '').trim()) {
    summaryParts.push(String(distributorName).trim());
  }
  const ageLabel = getRelativeAgeLabel(createdAt);
  if (ageLabel) {
    summaryParts.push(ageLabel);
  }
  return summaryParts.join(' | ');
};

const getLastPurchaseSuggestionPreserveFlags = ({
  item = {},
  normalizeGstRateOption,
  toNumber,
}) => {
  const currentRate = normalizeDraftRate(item?.rate ?? item?.unit_price, toNumber);
  const seededRate = normalizeDraftRate(item?.auto_fill_seed_rate ?? currentRate, toNumber);
  const currentGst = normalizeGstRateOption(item?.gst_rate ?? 5);
  const seededGst = normalizeGstRateOption(item?.auto_fill_seed_gst_rate ?? currentGst);
  const currentUom = String(item?.uom || '').trim().toLowerCase();
  const seededUom = String(item?.auto_fill_seed_uom || item?.uom || '').trim().toLowerCase();

  return {
    preserveRate: currentRate !== seededRate,
    preserveGst: currentGst !== seededGst,
    preserveUom: currentUom !== seededUom,
  };
};

const applyPurchaseDraftFieldChange = ({
  item = {},
  field,
  value,
  products = [],
  findProductForItem,
  resolvePurchaseUnitForProduct,
  normalizeGstRateOption,
  toNumber,
}) => {
  if (field === 'discount_warning_acknowledged') {
    return {
      ...item,
      discount_warning_acknowledged: Boolean(value),
    };
  }

  if (field === 'rate_warning_acknowledged') {
    return {
      ...item,
      rate_warning_acknowledged: Boolean(value),
    };
  }

  const nextValue = field === 'gst_rate' ? normalizeGstRateOption(value) : value;
  const nextItem = { ...item, [field]: nextValue };

  if (field === 'quantity') {
    nextItem.quantity = Math.max(0, toNumber(nextValue));
  }

  if (field === 'uom') {
    const selectedProduct = typeof findProductForItem === 'function'
      ? findProductForItem(products, nextItem)
      : null;
    nextItem.uom = resolvePurchaseUnitForProduct(selectedProduct, nextValue);
  }

  if (field === 'rate') {
    const normalizedRate = normalizeDraftRate(value, toNumber);
    nextItem.rate = normalizedRate;
    nextItem.unit_price = normalizedRate;
  }

  if (field === 'unit_price') {
    const normalizedRate = normalizeDraftRate(value, toNumber);
    nextItem.unit_price = normalizedRate;
    nextItem.rate = normalizedRate;
  }

  if (DISCOUNT_ACK_RESET_FIELDS.has(field)) {
    nextItem.discount_warning_acknowledged = false;
  }

  if (RATE_ACK_RESET_FIELDS.has(field)) {
    nextItem.rate_warning_acknowledged = false;
  }

  return nextItem;
};

const applyPurchaseDraftProductSelection = ({
  item = {},
  product = null,
  getProductSearchLabel,
  resolvePurchaseUnitForProduct,
  toNumber,
}) => {
  if (!product) {
    return {
      ...item,
      product_id: '',
      product_query: '',
      product_name: '',
      uom: 'pcs',
      rate_warning_acknowledged: false,
      discount_type: DEFAULT_DISCOUNT_TYPE,
      discount_value: DEFAULT_DISCOUNT_VALUE,
      discount_warning_acknowledged: false,
      reference_rate: 0,
      reference_rate_source: '',
      last_purchase_hint: '',
      last_purchase_rate: 0,
      last_purchase_distributor_name: '',
      last_purchase_created_at: '',
      last_purchase_po_number: '',
      auto_fill_seed_rate: null,
      auto_fill_seed_gst_rate: null,
      auto_fill_seed_uom: '',
    };
  }

  const baseRate = normalizeDraftRate(product.price, toNumber);
  const defaultUom = resolvePurchaseUnitForProduct(
    product,
    product.base_unit || product.uom || 'pcs'
  );

  return {
    ...item,
    product_id: String(product.id),
    product_name: product.name,
    product_query: getProductSearchLabel(product),
    unit_price: baseRate,
    rate: baseRate,
    rate_warning_acknowledged: false,
    reference_rate: baseRate,
    reference_rate_source: baseRate > 0 ? 'product default rate' : '',
    uom: defaultUom,
    discount_type: DEFAULT_DISCOUNT_TYPE,
    discount_value: DEFAULT_DISCOUNT_VALUE,
    discount_warning_acknowledged: false,
    last_purchase_hint: '',
    last_purchase_rate: 0,
    last_purchase_distributor_name: '',
    last_purchase_created_at: '',
    last_purchase_po_number: '',
    auto_fill_seed_rate: baseRate,
    auto_fill_seed_gst_rate: item?.gst_rate ?? 5,
    auto_fill_seed_uom: defaultUom,
  };
};

const clearPurchaseDraftProductSelection = ({
  item = {},
  query = '',
}) => ({
  ...item,
  product_id: '',
  product_query: query,
  product_name: query,
  rate_warning_acknowledged: false,
  discount_type: DEFAULT_DISCOUNT_TYPE,
  discount_value: DEFAULT_DISCOUNT_VALUE,
  discount_warning_acknowledged: false,
  reference_rate: 0,
  reference_rate_source: '',
  last_purchase_hint: '',
  last_purchase_rate: 0,
  last_purchase_distributor_name: '',
  last_purchase_created_at: '',
  last_purchase_po_number: '',
  auto_fill_seed_rate: null,
  auto_fill_seed_gst_rate: null,
  auto_fill_seed_uom: '',
});

const applyPurchaseDraftLastPurchaseSuggestion = ({
  item = {},
  product = null,
  suggestion = null,
  resolvePurchaseUnitForProduct,
  normalizeGstRateOption,
  toNumber,
  suggestedQuantity = null,
  preserveQuantity = true,
  preserveRate = false,
  preserveGst = false,
  preserveUom = false,
}) => {
  if (!suggestion?.found) return item;

  const suggestedRate = normalizeDraftRate(
    suggestion.rate ?? suggestion.unit_price ?? item.rate ?? item.unit_price,
    toNumber
  );
  const suggestedGst = normalizeGstRateOption(suggestion.gst_rate ?? item.gst_rate ?? 5);
  const suggestedDate = toDateLabel(suggestion.created_at);
  const suggestedPo = String(suggestion.po_number || '').trim() || 'last PO';
  const suggestedDistributorName = String(suggestion.distributor_name || '').trim();
  const suggestedUom = resolvePurchaseUnitForProduct(
    product,
    suggestion.uom || item.uom || product?.base_unit || product?.uom || 'pcs'
  );
  const lastPurchaseHint = buildLastPurchaseHint({
    rate: suggestedRate,
    distributorName: suggestedDistributorName,
    createdAt: suggestion.created_at,
  });

  return {
    ...item,
    quantity: preserveQuantity
      ? Math.max(1, toNumber(item?.quantity ?? 1))
      : Math.max(1, toNumber(suggestedQuantity ?? item?.quantity ?? 1)),
    unit_price: preserveRate ? normalizeDraftRate(item?.unit_price ?? item?.rate, toNumber) : suggestedRate,
    rate: preserveRate ? normalizeDraftRate(item?.rate ?? item?.unit_price, toNumber) : suggestedRate,
    rate_warning_acknowledged: false,
    reference_rate: suggestedRate,
    reference_rate_source: `last purchase ${suggestedPo}${suggestedDate ? ` (${suggestedDate})` : ''}`,
    gst_rate: preserveGst ? normalizeGstRateOption(item?.gst_rate ?? 5) : suggestedGst,
    uom: preserveUom
      ? resolvePurchaseUnitForProduct(product, item?.uom || suggestedUom)
      : suggestedUom,
    last_purchase_hint: lastPurchaseHint || `Suggested from ${suggestedPo}${suggestedDate ? ` (${suggestedDate})` : ''}`,
    last_purchase_rate: suggestedRate,
    last_purchase_distributor_name: suggestedDistributorName,
    last_purchase_created_at: String(suggestion.created_at || '').trim(),
    last_purchase_po_number: suggestedPo,
    discount_warning_acknowledged: Boolean(
      item?.discount_warning_acknowledged
      && preserveQuantity
      && preserveRate
      && preserveUom
    ),
    auto_fill_seed_rate: null,
    auto_fill_seed_gst_rate: null,
    auto_fill_seed_uom: '',
  };
};

const toCalculatedPurchaseOrderItem = ({
  item,
  calculateOrderItem,
}) => {
  const line = calculateOrderItem(item);
  const sourceFlags = getPurchaseDraftItemSourceFlags(item);
  return {
    ...(item?.id ? { id: item.id } : {}),
    product_id: item?.product_id ? String(item.product_id).trim() : '',
    product_name: String(item?.product_name || '').trim(),
    quantity: line.quantity,
    uom: line.uom,
    unit_price: line.rate,
    rate: line.rate,
    gst_rate: line.gstRate,
    discount_type: line.discountType,
    discount_value: line.discountValue,
    rate_warning_acknowledged: Boolean(item?.rate_warning_acknowledged),
    discount_warning_acknowledged: Boolean(item?.discount_warning_acknowledged),
    reference_rate: Number(item?.reference_rate || 0) || 0,
    reference_rate_source: String(item?.reference_rate_source || '').trim(),
    row_source: sourceFlags.rowSource,
    taxable_value: line.taxableValue,
    tax_amount: line.taxAmount,
    line_total: line.totalAmount,
    total: line.totalAmount,
  };
};

const projectPurchaseOrderDraft = ({
  items = [],
  products = [],
  findProductForItem,
  calculateOrderItem,
  calculateOrderTotals,
  previousProjection = null,
}) => {
  const normalizedItems = Array.isArray(items) ? items : [];
  const canReuseRows = Boolean(
    previousProjection
    && previousProjection.productsRef === products
    && previousProjection.findProductForItemRef === findProductForItem
    && previousProjection.calculateOrderItemRef === calculateOrderItem
  );
  const previousRows = Array.isArray(previousProjection?.rows) ? previousProjection.rows : [];
  const previousRowByItem = canReuseRows
    ? new Map(previousRows.map((row) => [row?.item, row]))
    : null;
  const rows = normalizedItems.map((item) => {
    const reusableRow = previousRowByItem?.get(item);
    if (reusableRow) return reusableRow;
    return {
      item,
      product: typeof findProductForItem === 'function' ? findProductForItem(products, item) : null,
      line: calculateOrderItem(item),
    };
  });
  const diagnostics = getPurchaseDraftDiagnostics({
    items: normalizedItems,
    products,
    findProductForItem,
    calculateOrderItem,
  });
  const totals = typeof calculateOrderTotals === 'function'
    ? calculateOrderTotals(normalizedItems)
    : rows.reduce((summary, row) => {
        summary.grossAmount += Number(row.line?.grossAmount || 0);
        summary.discountAmount += Number(row.line?.discountAmount || 0);
        summary.taxableValue += Number(row.line?.taxableValue || 0);
        summary.taxAmount += Number(row.line?.taxAmount || 0);
        summary.totalAmount += Number(row.line?.totalAmount || 0);
        return summary;
      }, {
        grossAmount: 0,
        discountAmount: 0,
        taxableValue: 0,
        taxAmount: 0,
        totalAmount: 0,
      });

  return {
    rows,
    diagnostics,
    totals,
    productsRef: products,
    findProductForItemRef: findProductForItem,
    calculateOrderItemRef: calculateOrderItem,
  };
};

const preparePurchaseOrderSubmission = ({
  items = [],
  products = [],
  findProductForItem,
  calculateOrderItem,
  calculateOrderTotals,
}) => {
  const normalizedItems = Array.isArray(items) ? items : [];
  const invalidTypedProducts = normalizedItems.filter((item) => (
    String(item?.product_query || '').trim() && !hasSelectedProduct(item)
  ));
  if (invalidTypedProducts.length > 0) {
    return {
      error: 'Please select valid products from suggestions for all typed product names',
    };
  }

  const validItems = normalizedItems.filter((item) => (
    hasSelectedProduct(item) && Number(item?.quantity || 0) > 0
  ));
  if (!validItems.length) {
    return {
      error: 'Please add at least one item',
    };
  }

  const diagnostics = getPurchaseDraftDiagnostics({
    items: validItems,
    products,
    findProductForItem,
    calculateOrderItem,
  });

  const calculatedItems = validItems.map((item) => toCalculatedPurchaseOrderItem({
    item,
    calculateOrderItem,
  }));
  const totals = calculateOrderTotals(calculatedItems);

  return {
    validItems,
    calculatedItems,
    totals,
    diagnostics,
  };
};

const buildPurchaseOrderSavePayload = ({
  distributorId,
  supplierId,
  plannedOrderDate,
  expectedDelivery,
  strictDueDate,
  strictDueNote,
  notes,
  calculatedItems = [],
  totals,
  createdBy,
  clientRequestId,
}) => ({
  distributor_id: distributorId,
  supplier_id: supplierId || null,
  planned_order_date: plannedOrderDate || null,
  expected_delivery: expectedDelivery,
  strict_due_date: strictDueDate || null,
  strict_due_note: strictDueNote || '',
  notes: notes || '',
  subtotal: totals.taxableValue,
  taxable_value: totals.taxableValue,
  tax_amount: totals.taxAmount,
  total_amount: totals.totalAmount,
  grand_total: totals.totalAmount,
  total: totals.totalAmount,
  items: calculatedItems,
  ...(createdBy !== undefined ? { created_by: createdBy } : {}),
  ...(clientRequestId ? { client_request_id: clientRequestId } : {}),
});

export {
  applyPurchaseDraftFieldChange,
  applyPurchaseDraftLastPurchaseSuggestion,
  applyPurchaseDraftProductSelection,
  buildPurchaseOrderSavePayload,
  clearPurchaseDraftProductSelection,
  getLastPurchaseMeta,
  getLastPurchaseSuggestionPreserveFlags,
  getPurchaseDraftItemSourceFlags,
  normalizePurchaseOrderItemRowSource,
  preparePurchaseOrderSubmission,
  projectPurchaseOrderDraft,
  toCalculatedPurchaseOrderItem,
};
