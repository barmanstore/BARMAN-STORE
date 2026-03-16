const createPurchaseOperationsReminderBuilders = (deps) => {
  const {
    normalizeTransactionDate,
    addDaysToDateKey,
    normalizeBooleanFlag,
    getDistributorOrderScheduleDay,
    getPurchaseOrderLifecycleStatus,
    isPoEditableLifecycle,
    getWeekdayFromDateKey,
    getDaysBetweenDateKeys,
    normalizePoPaymentStatus,
    getEffectivePurchaseDueDateKey,
    derivePurchaseNextAction,
    PURCHASE_WEEKDAYS,
    PO_LIFECYCLE_CANCELLED,
    PO_LIFECYCLE_CLOSED,
    PO_PAYMENT_UNPAID,
  } = deps;

  const buildPurchaseOperationAlerts = ({
    todayKey,
    tomorrowKey,
    distributors,
    orders,
    items,
  }) => {
    const itemsByOrderId = new Map();
    for (const item of items || []) {
      const key = Number(item.order_id || 0);
      const list = itemsByOrderId.get(key) || [];
      list.push(item);
      itemsByOrderId.set(key, list);
    }

    const enrichedOrders = (orders || []).map((order) => ({
      ...order,
      items: itemsByOrderId.get(Number(order.id || 0)) || [],
      po_status: getPurchaseOrderLifecycleStatus(order),
      payment_status: normalizePoPaymentStatus(order.payment_status, PO_PAYMENT_UNPAID),
      balance_due: Math.max(0, Number(order.balance_due || 0)),
      next_action: derivePurchaseNextAction({ ...order, items: itemsByOrderId.get(Number(order.id || 0)) || [] }),
    }));

    const isOpenOrder = (order) => {
      const lifecycleStatus = getPurchaseOrderLifecycleStatus(order);
      return lifecycleStatus !== PO_LIFECYCLE_CANCELLED && lifecycleStatus !== PO_LIFECYCLE_CLOSED;
    };

    const openOrders = enrichedOrders.filter(isOpenOrder);
    const payables = openOrders
      .filter((order) => Number(order.balance_due || 0) > 0)
      .map((order) => {
        const paymentDueDate = getEffectivePurchaseDueDateKey(order, todayKey);
        const daysUntilDue = getDaysBetweenDateKeys(todayKey, paymentDueDate);
        const overdueDays = paymentDueDate < todayKey ? Math.abs(getDaysBetweenDateKeys(paymentDueDate, todayKey) || 0) : 0;
        return {
          order_id: Number(order.id || 0),
          po_number: order.po_number,
          distributor_id: Number(order.distributor_id || 0),
          distributor_name: order.distributor_name || '-',
          balance_due: Number(order.balance_due || 0),
          payment_due_date: paymentDueDate,
          overdue_days: overdueDays,
          due_today: paymentDueDate === todayKey,
          days_until_due: daysUntilDue,
          payment_status: order.payment_status,
          po_status: order.po_status,
          next_action: order.next_action,
        };
      })
      .sort((a, b) => (b.overdue_days - a.overdue_days) || (a.days_until_due - b.days_until_due) || (b.balance_due - a.balance_due));

    const ordersByDistributor = new Map();
    for (const order of enrichedOrders) {
      const key = Number(order.distributor_id || 0);
      const list = ordersByDistributor.get(key) || [];
      list.push(order);
      ordersByDistributor.set(key, list);
    }

    const distributorInsights = (distributors || [])
      .filter((distributor) => String(distributor.status || 'active').trim().toLowerCase() === 'active')
      .map((distributor) => {
        const distributorIdKey = Number(distributor.id || 0);
        const distributorOrders = [...(ordersByDistributor.get(distributorIdKey) || [])]
          .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        const completedOrders = distributorOrders.filter((order) => getPurchaseOrderLifecycleStatus(order) !== PO_LIFECYCLE_CANCELLED);
        const cadenceSource = completedOrders;
        const cadenceIntervals = [];
        for (let index = 0; index < cadenceSource.length - 1; index += 1) {
          const currentDate = normalizeTransactionDate(cadenceSource[index].created_at || cadenceSource[index].planned_order_date || cadenceSource[index].expected_delivery);
          const nextDate = normalizeTransactionDate(cadenceSource[index + 1].created_at || cadenceSource[index + 1].planned_order_date || cadenceSource[index + 1].expected_delivery);
          const diff = currentDate && nextDate ? Math.abs(getDaysBetweenDateKeys(nextDate, currentDate) || 0) : null;
          if (diff && diff > 0) cadenceIntervals.push(diff);
        }
        const cadenceDays = cadenceIntervals.length
          ? Math.max(1, Math.round(cadenceIntervals.reduce((sum, value) => sum + value, 0) / cadenceIntervals.length))
          : null;
        const lastOrder = completedOrders[0] || null;
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
        } else if (cadenceDays && lastOrder) {
          nextOrderDate = addDaysToDateKey(
            normalizeTransactionDate(lastOrder.planned_order_date || lastOrder.created_at || lastOrder.expected_delivery),
            cadenceDays
          );
        }
        const productCounts = new Map();
        const suggestionMap = new Map();
        completedOrders.forEach((order) => {
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
        return {
          distributor_id: distributorIdKey,
          next_order_date: nextOrderDate,
          likely_items: [...productCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([name]) => name),
          suggested_items: [...suggestionMap.values()]
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
            })),
          outstanding_amount: completedOrders.reduce((sum, order) => sum + Math.max(0, Number(order.balance_due || 0)), 0),
        };
      });

    const reminders = (distributors || [])
      .filter((distributor) => String(distributor.status || 'active').trim().toLowerCase() === 'active')
      .filter((distributor) => normalizeBooleanFlag(distributor.auto_reminders_enabled, true))
      .map((distributor) => {
        const scheduleDay = getDistributorOrderScheduleDay(distributor);
        if (!scheduleDay || scheduleDay !== getWeekdayFromDateKey(tomorrowKey)) return null;
        const distributorOrders = ordersByDistributor.get(Number(distributor.id || 0)) || [];
        const hasEditableOrder = distributorOrders.some((order) => isPoEditableLifecycle(getPurchaseOrderLifecycleStatus(order)));
        const insight = distributorInsights.find((entry) => entry.distributor_id === Number(distributor.id || 0)) || null;
        return {
          distributor_id: Number(distributor.id || 0),
          distributor_name: distributor.name,
          reminder_for: tomorrowKey,
          schedule_day: scheduleDay,
          order_cutoff_time: distributor.order_cutoff_time || null,
          preferred_whatsapp_time: distributor.preferred_whatsapp_time || null,
          has_open_draft: hasEditableOrder,
          suggested_next_order_date: insight?.next_order_date || tomorrowKey,
          likely_items: insight?.likely_items || [],
          suggested_items: insight?.suggested_items || [],
          outstanding_amount: insight?.outstanding_amount || 0,
          message: hasEditableOrder
            ? 'Order reminder due tomorrow, but there is already an open draft/sent PO'
            : 'Order reminder due tomorrow',
        };
      })
      .filter(Boolean)
      .sort((a, b) => Number(b.outstanding_amount || 0) - Number(a.outstanding_amount || 0));

    return {
      todayKey,
      tomorrowKey,
      reminders,
      payables,
    };
  };

  return { buildPurchaseOperationAlerts };
};

module.exports = { createPurchaseOperationsReminderBuilders };
