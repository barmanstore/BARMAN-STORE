const { buildDistributorCadence } = require('./distributor/cadence');
const { collectDistributorOrderStats } = require('./distributor/orderStats');
const {
  buildLikelyItems,
  buildSuggestedItems,
  mergeSuggestedProductKnowledge,
} = require('./distributor/itemSuggestions');
const { buildPaymentDeliveryForecast } = require('./distributor/paymentDelivery');
const { attachInsightsToPayables } = require('./distributor/payables');

const RECENT_HABIT_WINDOW_DAYS = 120;

const normalizeNoveltyKey = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const buildCatalogProductIndex = (products = []) => {
  const productIds = new Set();
  const productByNameKey = new Map();

  for (const product of Array.isArray(products) ? products : []) {
    const productId = Number(product?.id || 0);
    const productName = String(product?.name || '').trim();
    const nameKey = normalizeNoveltyKey(productName);

    if (productId) {
      productIds.add(productId);
    }
    if (!nameKey || productByNameKey.has(nameKey)) {
      continue;
    }

    productByNameKey.set(nameKey, {
      id: productId || null,
      name: productName || null,
      category: String(product?.category || '').trim() || null,
      brand: String(product?.brand || '').trim() || null,
      uom: String(product?.uom || '').trim() || null,
      is_active: Number(product?.is_active ?? 1) === 1,
    });
  }

  return {
    productIds,
    productByNameKey,
  };
};

const buildRecentHabitIndex = ({
  orders = [],
  todayKey,
  addDaysToDateKey,
  getPurchaseOrderAnchorDateKey,
  getPurchaseOrderLifecycleStatus,
  PO_LIFECYCLE_CANCELLED,
} = {}) => {
  const startDateKey = addDaysToDateKey(todayKey, -(RECENT_HABIT_WINDOW_DAYS - 1)) || todayKey;
  const productIds = new Set();
  const productNameKeys = new Set();

  for (const order of Array.isArray(orders) ? orders : []) {
    if (getPurchaseOrderLifecycleStatus(order) === PO_LIFECYCLE_CANCELLED) continue;
    const anchorDateKey = getPurchaseOrderAnchorDateKey(order);
    if (!anchorDateKey || anchorDateKey < startDateKey || anchorDateKey > todayKey) continue;

    for (const item of Array.isArray(order?.items) ? order.items : []) {
      const productId = Number(item?.product_id || 0);
      const productNameKey = normalizeNoveltyKey(item?.product_name || '');
      if (productId) {
        productIds.add(productId);
      }
      if (productNameKey) {
        productNameKeys.add(productNameKey);
      }
    }
  }

  return {
    startDateKey,
    windowDays: RECENT_HABIT_WINDOW_DAYS,
    productIds,
    productNameKeys,
  };
};

const buildNoveltyInsights = ({
  mergedProductKnowledge,
  suggestedItems,
  catalogProductIndex,
  recentHabitIndex,
} = {}) => {
  const manualKeys = new Set(
    (Array.isArray(mergedProductKnowledge?.manual_items) ? mergedProductKnowledge.manual_items : [])
      .map((value) => normalizeNoveltyKey(value))
      .filter(Boolean)
  );
  const historicalKeys = new Set(
    (Array.isArray(mergedProductKnowledge?.historical_items)
      ? mergedProductKnowledge.historical_items
      : []
    )
      .map((value) => normalizeNoveltyKey(value))
      .filter(Boolean)
  );
  const suggestedItemByNameKey = new Map();

  for (const entry of Array.isArray(suggestedItems) ? suggestedItems : []) {
    const nameKey = normalizeNoveltyKey(entry?.product_name || '');
    if (!nameKey || suggestedItemByNameKey.has(nameKey)) continue;
    suggestedItemByNameKey.set(nameKey, entry);
  }

  const alerts = (
    Array.isArray(mergedProductKnowledge?.merged_items) ? mergedProductKnowledge.merged_items : []
  )
    .map((itemName) => {
      const normalizedName = String(itemName || '').trim();
      const nameKey = normalizeNoveltyKey(normalizedName);
      if (!nameKey) return null;

      const suggestedMatch = suggestedItemByNameKey.get(nameKey) || null;
      const suggestedProductId = Number(suggestedMatch?.product_id || 0);
      const catalogByName = catalogProductIndex?.productByNameKey?.get(nameKey) || null;
      const catalogById =
        suggestedProductId && catalogProductIndex?.productIds?.has(suggestedProductId)
          ? catalogByName || {
              id: suggestedProductId,
              name: String(suggestedMatch?.product_name || normalizedName).trim() || null,
              category: null,
              brand: null,
              uom: String(suggestedMatch?.uom || '').trim() || null,
              is_active: true,
            }
          : null;
      const catalogMatch = catalogById || catalogByName || null;
      const inCatalog = Boolean(catalogMatch);
      const inRecentHabit = Boolean(
        (suggestedProductId && recentHabitIndex?.productIds?.has(suggestedProductId)) ||
        recentHabitIndex?.productNameKeys?.has(nameKey)
      );
      if (inCatalog && inRecentHabit) {
        return null;
      }

      const reasons = [];
      if (!inCatalog) reasons.push('missing_catalog');
      if (!inRecentHabit) reasons.push('outside_recent_habit');

      const source =
        manualKeys.has(nameKey) && historicalKeys.has(nameKey)
          ? 'supplier_profile_and_history'
          : manualKeys.has(nameKey)
            ? 'supplier_profile'
            : 'purchase_history';

      return {
        item_name:
          catalogMatch?.name ||
          String(suggestedMatch?.product_name || normalizedName).trim() ||
          'Unknown',
        product_id: suggestedProductId || catalogMatch?.id || null,
        source,
        reasons,
        label:
          reasons.length === 2
            ? 'Missing from catalog and recent habit'
            : reasons.includes('missing_catalog')
              ? 'Missing from catalog'
              : 'Outside recent habit',
        in_catalog: inCatalog,
        in_recent_habit: inRecentHabit,
        category: catalogMatch?.category || null,
        brand: catalogMatch?.brand || null,
        uom: String(suggestedMatch?.uom || catalogMatch?.uom || '').trim() || null,
        suggested_quantity:
          Number(suggestedMatch?.quantity || 0) > 0 ? Number(suggestedMatch.quantity) : null,
        is_active_catalog_product: catalogMatch ? catalogMatch.is_active !== false : null,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftPriority =
        (left.reasons.length === 2 ? 3 : left.reasons.includes('missing_catalog') ? 2 : 1) +
        (left.source === 'supplier_profile' ? 0.5 : 0) +
        (left.source === 'supplier_profile_and_history' ? 0.25 : 0);
      const rightPriority =
        (right.reasons.length === 2 ? 3 : right.reasons.includes('missing_catalog') ? 2 : 1) +
        (right.source === 'supplier_profile' ? 0.5 : 0) +
        (right.source === 'supplier_profile_and_history' ? 0.25 : 0);
      if (rightPriority !== leftPriority) return rightPriority - leftPriority;
      return String(left.item_name || '').localeCompare(String(right.item_name || ''));
    });

  return {
    noveltyAlerts: alerts.slice(0, 3),
    noveltySummary: {
      total_count: alerts.length,
      missing_catalog_count: alerts.filter((entry) => entry.reasons.includes('missing_catalog'))
        .length,
      outside_recent_habit_count: alerts.filter((entry) =>
        entry.reasons.includes('outside_recent_habit')
      ).length,
      supplier_profile_count: alerts.filter((entry) => entry.source === 'supplier_profile').length,
      recent_habit_window_days: Number(recentHabitIndex?.windowDays || RECENT_HABIT_WINDOW_DAYS),
      recent_habit_start_date: recentHabitIndex?.startDateKey || null,
    },
  };
};

const createPurchaseOperationsDistributorInsights = (deps) => {
  const {
    normalizeTransactionDate,
    addDaysToDateKey,
    getWeekdayFromDateKey,
    computeAverageDays,
    getDistributorOrderScheduleDay,
    mergeDistributorProductKnowledge,
    getDistributorPaymentPlan,
    getPurchaseOrderLifecycleStatus,
    getPurchaseOrderPaymentAnchorDateKey,
    getPurchaseOrderAnchorDateKey,
    getPurchaseOrderDeliveryDateKey,
    getDaysBetweenDateKeys,
    pickLatestDateKey,
    pickEarliestDateKey,
    PO_LIFECYCLE_CANCELLED,
    PURCHASE_WEEKDAYS,
  } = deps;

  const buildDistributorInsights = ({ baseData, metrics }) => {
    const { todayKey, distributors, suppliers, products } = baseData;
    const {
      paymentsByOrderId,
      ledgerBalanceByDistributor,
      orderById,
      payables,
      payablesByDistributor,
      ordersByDistributor,
      enrichedOrders,
      isOpenOrder,
    } = metrics;
    const catalogProductIndex = buildCatalogProductIndex(products);
    const recentHabitIndex = buildRecentHabitIndex({
      orders: enrichedOrders,
      todayKey,
      addDaysToDateKey,
      getPurchaseOrderAnchorDateKey,
      getPurchaseOrderLifecycleStatus,
      PO_LIFECYCLE_CANCELLED,
    });
    const supplierProductGroupsByDistributor = new Map();
    for (const supplier of Array.isArray(suppliers) ? suppliers : []) {
      const distributorId = Number(supplier?.distributor_id || 0);
      const productsSupplied = String(supplier?.products_supplied || '').trim();
      if (!distributorId || !productsSupplied) continue;
      const existing = supplierProductGroupsByDistributor.get(distributorId) || [];
      existing.push(productsSupplied);
      supplierProductGroupsByDistributor.set(distributorId, existing);
    }

    const inferDistributorInsight = (distributor) => {
      const distributorId = Number(distributor.id || 0);
      const distributorOrders = [...(ordersByDistributor.get(distributorId) || [])].sort(
        (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );
      const completedOrders = distributorOrders.filter(
        (order) => getPurchaseOrderLifecycleStatus(order) !== PO_LIFECYCLE_CANCELLED
      );
      const openDistributorOrders = distributorOrders.filter(isOpenOrder);
      const cadenceData = buildDistributorCadence({
        todayKey,
        completedOrders,
        distributor,
        computeAverageDays,
        getDistributorOrderScheduleDay,
        getPurchaseOrderAnchorDateKey,
        getDaysBetweenDateKeys,
        getWeekdayFromDateKey,
        PURCHASE_WEEKDAYS,
        addDaysToDateKey,
      });

      const orderStats = collectDistributorOrderStats({
        completedOrders,
        paymentsByOrderId,
        normalizeTransactionDate,
        getPurchaseOrderPaymentAnchorDateKey,
        getPurchaseOrderDeliveryDateKey,
        getPurchaseOrderAnchorDateKey,
        getDaysBetweenDateKeys,
        pickLatestDateKey,
      });

      const likelyItems = buildLikelyItems(orderStats.productCounts, { limit: 3 });
      const suggestedItems = buildSuggestedItems(orderStats.suggestionMap, { limit: 5 });
      const manualProductsSupplied =
        (supplierProductGroupsByDistributor.get(distributorId) || []).join(', ') ||
        String(distributor?.products_supplied || '').trim();
      const mergedProductKnowledge = mergeSuggestedProductKnowledge({
        manualProductsSupplied,
        mergeDistributorProductKnowledge,
        likelyItems,
        suggestedItems,
      });
      const noveltyInsights = buildNoveltyInsights({
        mergedProductKnowledge,
        suggestedItems,
        catalogProductIndex,
        recentHabitIndex,
      });

      const paymentDelivery = buildPaymentDeliveryForecast({
        completedOrders,
        openDistributorOrders,
        payablesByDistributor,
        distributorId,
        distributor,
        ledgerBalanceByDistributor,
        computeAverageDays,
        getDistributorPaymentPlan,
        getPurchaseOrderPaymentAnchorDateKey,
        getPurchaseOrderAnchorDateKey,
        normalizeTransactionDate,
        addDaysToDateKey,
        pickEarliestDateKey,
        pickLatestDateKey,
        paymentLagDays: orderStats.paymentLagDays,
        deliveryLagDays: orderStats.deliveryLagDays,
        paymentDateKeys: orderStats.paymentDateKeys,
        deliveryDateKeys: orderStats.deliveryDateKeys,
        lastOrderDateKey: cadenceData.lastOrderDateKey,
      });

      return {
        distributor_id: distributorId,
        distributor_name: distributor.name,
        cadence_days: cadenceData.cadenceDays,
        next_order_date: cadenceData.nextOrderDate,
        schedule_day: cadenceData.scheduleDay || null,
        po_balance_due: paymentDelivery.outstandingAmount,
        ledger_balance: paymentDelivery.ledgerBalance,
        outstanding_amount: paymentDelivery.outstandingAmount,
        likely_items: mergedProductKnowledge.historical_items.slice(0, 3),
        suggested_items: suggestedItems,
        products_supplied_manual: mergedProductKnowledge.manual_items,
        products_supplied_all: mergedProductKnowledge.merged_items,
        products_supplied_text: mergedProductKnowledge.merged_text,
        active_open_orders: openDistributorOrders.length,
        last_order_date: cadenceData.lastOrderDateKey,
        last_delivery_date: paymentDelivery.lastDeliveryDate,
        last_payment_date: paymentDelivery.lastPaymentDate,
        next_payment_due_date: paymentDelivery.nextPaymentDueDate,
        next_payment_due_source: paymentDelivery.nextPaymentDueSource,
        predicted_payment_amount: paymentDelivery.predictedPaymentAmount,
        next_delivery_date: paymentDelivery.nextDeliveryDate,
        next_delivery_source: paymentDelivery.nextDeliverySource,
        predicted_delivery_count: paymentDelivery.predictedDeliveryCount,
        configured_payment_due_days: paymentDelivery.configuredPaymentDueDays,
        inferred_payment_due_days: paymentDelivery.inferredPaymentDueDays,
        avg_delivery_days: paymentDelivery.avgDeliveryDays,
        inferred_due_date: paymentDelivery.inferredDueDate || null,
        strict_deadline_count: completedOrders.filter((order) =>
          Boolean(normalizeTransactionDate(order.strict_due_date))
        ).length,
        novelty_alerts: noveltyInsights.noveltyAlerts,
        novelty_summary: noveltyInsights.noveltySummary,
        has_novelty_alerts: Number(noveltyInsights.noveltySummary?.total_count || 0) > 0,
      };
    };

    const distributorInsights = distributors
      .filter(
        (distributor) =>
          String(distributor.status || 'active')
            .trim()
            .toLowerCase() === 'active'
      )
      .map(inferDistributorInsight)
      .sort((a, b) => Number(b.outstanding_amount || 0) - Number(a.outstanding_amount || 0));
    const distributorInsightById = new Map(
      distributorInsights.map((entry) => [Number(entry.distributor_id || 0), entry])
    );
    const payablesWithInsights = attachInsightsToPayables({
      payables,
      distributorInsightById,
      orderById,
      normalizeTransactionDate,
    });

    return {
      distributorInsights,
      distributorInsightById,
      payablesWithInsights,
    };
  };

  return { buildDistributorInsights };
};

module.exports = { createPurchaseOperationsDistributorInsights };
