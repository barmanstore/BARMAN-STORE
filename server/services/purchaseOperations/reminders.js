const createPurchaseOperationsReminders = (deps) => {
  const {
    dbAllAsync,
    dbGetAsync,
    dbRunAsync,
    normalizeTransactionDate,
    addDaysToDateKey,
    normalizeBooleanFlag,
    getDistributorOrderScheduleDay,
    getPurchaseOrderLifecycleStatus,
    isPoEditableLifecycle,
    getWeekdayFromDateKey,
    parseDistributorProductsSupplied,
    mergeDistributorProductKnowledge,
    getDistributorPaymentPlan,
    computeAverageDays,
    computeAverageGapDays,
    computeStdDev,
    deriveStockoutRisk,
    getPurchaseOrderPaymentAnchorDateKey,
    getPurchaseOrderAnchorDateKey,
    getPurchaseOrderDeliveryDateKey,
    getDaysBetweenDateKeys,
    pickLatestDateKey,
    pickEarliestDateKey,
    normalizePoPaymentStatus,
    getEffectivePurchaseDueDateKey,
    resolveRollupRange,
    buildDateSeries,
    normalizePoLifecycleStatus,
    resolveInsightDateRange,
    notifyAdmins,
    PURCHASE_ACTION_ROLLUP_FIELDS,
    PURCHASE_ACTION_STATUS_MAP,
    PURCHASE_WEEKDAYS,
    PO_LIFECYCLE_PREPARED,
    PO_LIFECYCLE_SENT,
    PO_LIFECYCLE_REVISED,
    PO_LIFECYCLE_CANCELLED,
    PO_LIFECYCLE_FULLY_PAID,
    PO_LIFECYCLE_CLOSED,
    PO_PAYMENT_UNPAID,
    derivePurchaseNextAction,
    buildPurchaseActionRollupsAsync,
    persistPurchaseAnalyticsSnapshotsAsync,
    PURCHASE_OPERATIONS_NOTIFICATIONS_ENABLED,
    PURCHASE_OPERATIONS_NOTIFICATION_INTERVAL_MS,
    IS_VERCEL_RUNTIME,
  } = deps;

  const saveDistributorPurchaseReminderAsync = async ({
    distributorId,
    purchaseOrderId = null,
    reminderType,
    scheduledFor,
    status = 'pending',
    title = null,
    message = null,
    whatsappUrl = null,
    createdBy = null,
  } = {}) => {
    if (!distributorId || !reminderType || !scheduledFor) return null;
    const scheduledDate = normalizeTransactionDate(scheduledFor);
    if (!scheduledDate) return null;
    const existing = await dbGetAsync(
      `SELECT * FROM distributor_purchase_reminders
       WHERE distributor_id = ?
         AND COALESCE(purchase_order_id, 0) = COALESCE(?, 0)
         AND reminder_type = ?
         AND scheduled_for = ?`,
      [distributorId, purchaseOrderId || null, reminderType, scheduledDate]
    );
    if (existing) return existing;
    const result = await dbRunAsync(
      `INSERT INTO distributor_purchase_reminders
       (distributor_id, purchase_order_id, reminder_type, scheduled_for, status, title, message, whatsapp_url, created_by, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'prepared' THEN CURRENT_TIMESTAMP ELSE NULL END)`,
      [
        distributorId,
        purchaseOrderId || null,
        reminderType,
        scheduledDate,
        status,
        title || null,
        message || null,
        whatsappUrl || null,
        createdBy || null,
        status,
      ]
    );
    return dbGetAsync(`SELECT * FROM distributor_purchase_reminders WHERE id = ?`, [result.lastInsertRowid]);
  };

  const emitPurchaseOperationNotificationsAsync = async ({
    todayKey,
    reminders = [],
    payables = [],
    createdBy = null,
  } = {}) => {
    const normalizedTodayKey = normalizeTransactionDate(todayKey || new Date().toISOString()) || new Date().toISOString().slice(0, 10);
    let reminderNotifications = 0;
    let paymentNotifications = 0;

    for (const reminder of Array.isArray(reminders) ? reminders : []) {
      await saveDistributorPurchaseReminderAsync({
        distributorId: reminder.distributor_id,
        purchaseOrderId: null,
        reminderType: 'order_day_warning',
        scheduledFor: reminder.reminder_for,
        status: 'pending',
        title: `Order reminder for ${reminder.distributor_name}`,
        message: reminder.message,
        createdBy,
      });
      const createdId = await notifyAdmins({
        title: `Order reminder tomorrow: ${reminder.distributor_name}`,
        message: `${reminder.distributor_name} is scheduled for order/visit on ${reminder.reminder_for}. ${reminder.has_open_draft ? 'Open draft exists.' : 'No open draft yet.'}`,
        level: 'warning',
        entityType: 'purchase_distributor',
        entityId: reminder.distributor_id,
        metadata: reminder,
        createdBy,
        clientRequestIdPrefix: `purchase:order-reminder:${reminder.distributor_id}:${reminder.reminder_for}`,
      });
      reminderNotifications += Number(createdId || 0) > 0 ? 1 : 0;
    }

    for (const payable of (Array.isArray(payables) ? payables : []).filter((entry) => entry.payment_due_date <= normalizedTodayKey)) {
      const reminderType = payable.payment_due_date < normalizedTodayKey ? 'payment_overdue' : 'payment_due_today';
      await saveDistributorPurchaseReminderAsync({
        distributorId: payable.distributor_id,
        purchaseOrderId: payable.order_id,
        reminderType,
        scheduledFor: normalizedTodayKey,
        status: 'pending',
        title: `${payable.distributor_name} payment ${payable.payment_due_date < normalizedTodayKey ? 'overdue' : 'due today'}`,
        message: `${payable.po_number} has ${payable.balance_due} pending against ${payable.distributor_name}`,
        createdBy,
      });
      const createdId = await notifyAdmins({
        title: payable.payment_due_date < normalizedTodayKey
          ? `Overdue distributor payment: ${payable.distributor_name}`
          : `Distributor payment due today: ${payable.distributor_name}`,
        message: `${payable.po_number} has ${payable.balance_due} pending. Due date: ${payable.payment_due_date}.`,
        level: payable.payment_due_date < normalizedTodayKey ? 'error' : 'warning',
        entityType: 'purchase_order',
        entityId: payable.order_id,
        metadata: payable,
        createdBy,
        clientRequestIdPrefix: payable.payment_due_date < normalizedTodayKey
          ? `purchase:payment-overdue:${payable.order_id}:${normalizedTodayKey}`
          : `purchase:payment-due:${payable.order_id}:${normalizedTodayKey}`,
      });
      paymentNotifications += Number(createdId || 0) > 0 ? 1 : 0;
    }

    return {
      reminder_notifications: reminderNotifications,
      payment_notifications: paymentNotifications,
    };
  };

  const loadPurchaseOperationAlertsAsync = async ({
    date = null,
    distributorId = null,
  } = {}) => {
    const todayKey = normalizeTransactionDate(date || new Date().toISOString()) || new Date().toISOString().slice(0, 10);
    const tomorrowKey = addDaysToDateKey(todayKey, 1) || todayKey;
    const normalizedDistributorId = Number(distributorId || 0) || null;
    const distributorWhereSql = normalizedDistributorId ? ` WHERE id = ?` : '';
    const orderWhereSql = normalizedDistributorId ? ` WHERE po.distributor_id = ?` : '';
    const distributorParams = normalizedDistributorId ? [normalizedDistributorId] : [];
    const orderParams = normalizedDistributorId ? [normalizedDistributorId] : [];
    const distributors = await dbAllAsync(
      `SELECT *
       FROM distributors${distributorWhereSql}
       ORDER BY name ASC`,
      distributorParams
    );
    const orders = await dbAllAsync(
      `SELECT po.*, d.name AS distributor_name, d.order_day, d.delivery_day, d.visit_day, d.payment_terms, d.payment_cycle_type, d.payment_due_days, d.auto_reminders_enabled
       FROM purchase_orders po
       LEFT JOIN distributors d ON d.id = po.distributor_id
       ${orderWhereSql}
       ORDER BY po.created_at DESC`,
      orderParams
    );
    const items = await dbAllAsync(
      `SELECT poi.order_id, poi.product_id, poi.product_name, poi.quantity, poi.uom, poi.rate, poi.unit_price, poi.gst_rate, poi.discount_type, poi.discount_value
       FROM purchase_order_items poi
       INNER JOIN purchase_orders po ON po.id = poi.order_id
       ${normalizedDistributorId ? `WHERE po.distributor_id = ?` : ''}`,
      orderParams
    );

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

  const runPurchaseOperationNotificationsAsync = async ({
    date = null,
    distributorId = null,
    createdBy = null,
  } = {}) => {
    const alertState = await loadPurchaseOperationAlertsAsync({
      date,
      distributorId,
    });
    const emitted = await emitPurchaseOperationNotificationsAsync({
      todayKey: alertState.todayKey,
      reminders: alertState.reminders,
      payables: alertState.payables,
      createdBy,
    });
    return {
      today: alertState.todayKey,
      tomorrow: alertState.tomorrowKey,
      reminders_scanned: Number(alertState.reminders?.length || 0),
      payables_scanned: Number(alertState.payables?.filter((entry) => entry.payment_due_date <= alertState.todayKey).length || 0),
      ...emitted,
    };
  };


  return {
    saveDistributorPurchaseReminderAsync,
    emitPurchaseOperationNotificationsAsync,
    loadPurchaseOperationAlertsAsync,
    runPurchaseOperationNotificationsAsync,
  };
};

module.exports = { createPurchaseOperationsReminders };
