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
    const {
      todayKey,
      distributors,
      orders,
    } = baseData;
    const {
      paymentsByOrderId,
      ledgerBalanceByDistributor,
      orderById,
      payables,
      payablesByDistributor,
      ordersByDistributor,
      isOpenOrder,
    } = metrics;

    const inferDistributorInsight = (distributor) => {
      const distributorId = Number(distributor.id || 0);
      const distributorOrders = [...(ordersByDistributor.get(distributorId) || [])]
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      const completedOrders = distributorOrders.filter((order) => getPurchaseOrderLifecycleStatus(order) !== PO_LIFECYCLE_CANCELLED);
      const openDistributorOrders = distributorOrders.filter(isOpenOrder);
      const cadenceSource = completedOrders;
      const cadenceIntervals = [];
      for (let index = 0; index < cadenceSource.length - 1; index += 1) {
        const currentDate = getPurchaseOrderAnchorDateKey(cadenceSource[index]);
        const nextDate = getPurchaseOrderAnchorDateKey(cadenceSource[index + 1]);
        const diff = currentDate && nextDate ? Math.abs(getDaysBetweenDateKeys(nextDate, currentDate) || 0) : null;
        if (diff && diff > 0) cadenceIntervals.push(diff);
      }
      const cadenceDays = computeAverageDays(cadenceIntervals);
      const lastOrder = completedOrders[0] || null;
      const lastOrderDateKey = lastOrder ? getPurchaseOrderAnchorDateKey(lastOrder) : null;
      const scheduleDay = getDistributorOrderScheduleDay(distributor);
      let nextOrderDate = null;
      if (scheduleDay) {
        const todayWeekday = getWeekdayFromDateKey(todayKey);
        const todayIndex = PURCHASE_WEEKDAYS.findIndex((day) => day === todayWeekday);
        const targetIndex = PURCHASE_WEEKDAYS.findIndex((day) => day === scheduleDay);
        const offset = todayIndex >= 0 && targetIndex >= 0
          ? ((targetIndex - todayIndex + 7) % 7 || 7)
          : 0;
        nextOrderDate = addDaysToDateKey(todayKey, offset);
      } else if (cadenceDays && lastOrderDateKey) {
        nextOrderDate = addDaysToDateKey(lastOrderDateKey, cadenceDays);
      }

      const productCounts = new Map();
      const suggestionMap = new Map();
      const paymentLagDays = [];
      const deliveryLagDays = [];
      const paymentDateKeys = [];
      const deliveryDateKeys = [];
      completedOrders.forEach((order) => {
        const orderPayments = paymentsByOrderId.get(Number(order.id || 0)) || [];
        const orderPaymentDates = orderPayments
          .map((payment) => normalizeTransactionDate(payment.transaction_date || payment.created_at))
          .filter(Boolean);
        if (orderPaymentDates.length > 0) {
          paymentDateKeys.push(...orderPaymentDates);
          const anchorDate = getPurchaseOrderPaymentAnchorDateKey(order);
          const lastPaymentDate = pickLatestDateKey(orderPaymentDates);
          const lagDays = anchorDate && lastPaymentDate ? getDaysBetweenDateKeys(anchorDate, lastPaymentDate) : null;
          if (Number.isFinite(lagDays) && lagDays >= 0) {
            paymentLagDays.push(lagDays);
          }
        }
        const deliveryDate = getPurchaseOrderDeliveryDateKey(order);
        if (deliveryDate) {
          deliveryDateKeys.push(deliveryDate);
          const anchorDate = getPurchaseOrderAnchorDateKey(order);
          const leadDays = anchorDate && deliveryDate ? getDaysBetweenDateKeys(anchorDate, deliveryDate) : null;
          if (Number.isFinite(leadDays) && leadDays >= 0) {
            deliveryLagDays.push(leadDays);
          }
        }
        (order.items || []).forEach((item) => {
          const key = String(item.product_name || item.product_id || '').trim();
          if (!key) return;
          productCounts.set(key, (productCounts.get(key) || 0) + 1);
          const suggestionKey = String(item.product_id || item.product_name || '').trim().toLowerCase();
          const existing = suggestionMap.get(suggestionKey) || {
            product_id: item.product_id ? Number(item.product_id) : null,
            product_name: item.product_name || 'Unknown',
            quantity_total: 0,
            quantity_count: 0,
            latest_created_at: '',
            uom: item.uom || 'pcs',
            rate: Number(item.rate ?? item.unit_price ?? 0),
            gst_rate: Number(item.gst_rate || 0),
            discount_type: item.discount_type || 'percent',
            discount_value: Number(item.discount_value || 0),
          };
          const orderCreatedAt = String(order.created_at || order.planned_order_date || order.expected_delivery || '');
          const currentQuantity = Math.max(0, Number(item.quantity || 0));
          const nextRecord = {
            ...existing,
            quantity_total: Number(existing.quantity_total || 0) + currentQuantity,
            quantity_count: Number(existing.quantity_count || 0) + 1,
          };
          if (!existing.latest_created_at || orderCreatedAt > existing.latest_created_at) {
            nextRecord.latest_created_at = orderCreatedAt;
            nextRecord.uom = item.uom || existing.uom || 'pcs';
            nextRecord.rate = Number(item.rate ?? item.unit_price ?? existing.rate ?? 0);
            nextRecord.gst_rate = Number(item.gst_rate ?? existing.gst_rate ?? 0);
            nextRecord.discount_type = item.discount_type || existing.discount_type || 'percent';
            nextRecord.discount_value = Number(item.discount_value ?? existing.discount_value ?? 0);
          }
          suggestionMap.set(suggestionKey, nextRecord);
        });
      });

      const likelyItems = [...productCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name);
      const suggestedItems = [...suggestionMap.values()]
        .sort((a, b) => {
          const countDiff = Number(b.quantity_count || 0) - Number(a.quantity_count || 0);
          if (countDiff !== 0) return countDiff;
          return String(b.latest_created_at || '').localeCompare(String(a.latest_created_at || ''));
        })
        .slice(0, 5)
        .map((entry) => ({
          product_id: entry.product_id,
          product_name: entry.product_name,
          quantity: Number(entry.quantity_count || 0) > 0
            ? Math.max(1, Number((Number(entry.quantity_total || 0) / Number(entry.quantity_count || 1)).toFixed(2)))
            : 1,
          uom: entry.uom || 'pcs',
          rate: Number(entry.rate || 0),
          unit_price: Number(entry.rate || 0),
          gst_rate: Number(entry.gst_rate || 0),
          discount_type: entry.discount_type || 'percent',
          discount_value: Number(entry.discount_value || 0),
        }));

      const openPayables = payablesByDistributor.get(distributorId) || [];
      const outstandingAmount = openDistributorOrders.reduce((sum, order) => sum + Math.max(0, Number(order.balance_due || 0)), 0);
      const configuredPaymentPlan = getDistributorPaymentPlan(distributor);
      const avgPaymentLagDays = computeAverageDays(paymentLagDays);
      const avgDeliveryDays = computeAverageDays(deliveryLagDays);
      const paymentReferenceOrder = completedOrders.find((order) => Number(order.balance_due || 0) > 0) || completedOrders[0] || null;
      const paymentAnchorDate = paymentReferenceOrder
        ? getPurchaseOrderPaymentAnchorDateKey(paymentReferenceOrder)
        : null;
      const inferredDueDate = paymentAnchorDate
        ? addDaysToDateKey(paymentAnchorDate, avgPaymentLagDays ?? configuredPaymentPlan.paymentDueDays)
        : null;
      const nextPaymentDueDate = pickEarliestDateKey(openPayables.map((entry) => entry.payment_due_date))
        || inferredDueDate
        || null;
      const nextPaymentDueSource = openPayables.length
        ? 'open_payable'
        : (inferredDueDate ? 'history_inferred' : 'unknown');
      const predictedPaymentAmount = nextPaymentDueDate
        ? openPayables
          .filter((entry) => entry.payment_due_date === nextPaymentDueDate)
          .reduce((sum, entry) => sum + Number(entry.balance_due || 0), 0)
        : 0;
      const openDeliveryDates = openDistributorOrders
        .map((order) => normalizeTransactionDate(order.expected_delivery || null))
        .filter(Boolean);
      const inferredDeliveryDate = avgDeliveryDays && lastOrderDateKey
        ? addDaysToDateKey(lastOrderDateKey, avgDeliveryDays)
        : null;
      const nextDeliveryDate = pickEarliestDateKey(openDeliveryDates) || inferredDeliveryDate || null;
      const nextDeliverySource = openDeliveryDates.length
        ? 'open_order'
        : (inferredDeliveryDate ? 'history_inferred' : 'unknown');
      const predictedDeliveryCount = nextDeliveryDate
        ? openDistributorOrders.filter((order) => normalizeTransactionDate(order.expected_delivery || null) === nextDeliveryDate).length
        : 0;
      const mergedProductKnowledge = mergeDistributorProductKnowledge({
        manualProductsSupplied: distributor.products_supplied || '',
        likelyItems,
        suggestedItems,
      });

      return {
        distributor_id: distributorId,
        distributor_name: distributor.name,
        cadence_days: cadenceDays,
        next_order_date: nextOrderDate,
        schedule_day: scheduleDay || null,
        po_balance_due: outstandingAmount,
        ledger_balance: Number(ledgerBalanceByDistributor.get(distributorId) || 0),
        outstanding_amount: outstandingAmount,
        likely_items: mergedProductKnowledge.historical_items.slice(0, 3),
        suggested_items: suggestedItems,
        products_supplied_manual: mergedProductKnowledge.manual_items,
        products_supplied_all: mergedProductKnowledge.merged_items,
        products_supplied_text: mergedProductKnowledge.merged_text,
        active_open_orders: openDistributorOrders.length,
        last_order_date: lastOrderDateKey,
        last_delivery_date: pickLatestDateKey(deliveryDateKeys),
        last_payment_date: pickLatestDateKey(paymentDateKeys),
        next_payment_due_date: nextPaymentDueDate,
        next_payment_due_source: nextPaymentDueSource,
        predicted_payment_amount: predictedPaymentAmount,
        next_delivery_date: nextDeliveryDate,
        next_delivery_source: nextDeliverySource,
        predicted_delivery_count: predictedDeliveryCount,
        configured_payment_due_days: configuredPaymentPlan.paymentDueDays,
        inferred_payment_due_days: avgPaymentLagDays,
        avg_delivery_days: avgDeliveryDays,
        inferred_due_date: inferredDueDate || null,
        strict_deadline_count: completedOrders.filter((order) => Boolean(normalizeTransactionDate(order.strict_due_date))).length,
      };
    };

    const distributorInsights = distributors
      .filter((distributor) => String(distributor.status || 'active').trim().toLowerCase() === 'active')
      .map(inferDistributorInsight)
      .sort((a, b) => Number(b.outstanding_amount || 0) - Number(a.outstanding_amount || 0));
    const distributorInsightById = new Map(
      distributorInsights.map((entry) => [Number(entry.distributor_id || 0), entry])
    );
    const payablesWithInsights = payables.map((entry) => {
      const insight = distributorInsightById.get(Number(entry.distributor_id || 0)) || null;
      const order = orderById.get(Number(entry.order_id || 0)) || null;
      return {
        ...entry,
        configured_due_date: normalizeTransactionDate(order?.payment_due_date || null) || null,
        strict_due_date: normalizeTransactionDate(order?.strict_due_date || null) || null,
        inferred_due_date: insight?.inferred_due_date || null,
        next_payment_due_date: insight?.next_payment_due_date || null,
        next_delivery_date: insight?.next_delivery_date || null,
        predicted_payment_amount: Number(insight?.predicted_payment_amount || 0),
        po_balance_due: Number(entry.balance_due || 0),
        ledger_balance: Number(insight?.ledger_balance || 0),
      };
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
