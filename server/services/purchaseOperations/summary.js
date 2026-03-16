const createPurchaseOperationsSummary = (deps) => {
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

  const handlePurchaseOperationsSummary = async (req, res, { persistSnapshots = true } = {}) => {
    try {
      const todayKey = normalizeTransactionDate(req.query?.date || new Date().toISOString()) || new Date().toISOString().slice(0, 10);
      const tomorrowKey = addDaysToDateKey(todayKey, 1) || todayKey;
      const distributorIdFilter = Number(req.query?.distributor_id || 0) || null;
      const rollupRange = resolveRollupRange({
        startDate: req.query?.rollup_start_date || null,
        endDate: req.query?.rollup_end_date || null,
        days: req.query?.rollup_days || 30,
      });
      const distributorWhereSql = distributorIdFilter ? ` WHERE id = ?` : '';
      const orderWhereSql = distributorIdFilter ? ` WHERE po.distributor_id = ?` : '';
      const distributors = await dbAllAsync(
        `SELECT * FROM distributors${distributorWhereSql} ORDER BY name ASC`,
        distributorIdFilter ? [distributorIdFilter] : []
      );
      const orders = await dbAllAsync(
        `SELECT po.*, d.name AS distributor_name, d.order_day, d.delivery_day, d.visit_day, d.payment_terms, d.payment_cycle_type, d.payment_due_days, d.auto_reminders_enabled
         FROM purchase_orders po
         LEFT JOIN distributors d ON d.id = po.distributor_id
         ${orderWhereSql}
         ORDER BY po.created_at DESC`,
        distributorIdFilter ? [distributorIdFilter] : []
      );
      const payments = await dbAllAsync(
        `SELECT pop.*, po.po_number, po.payment_due_date, po.bill_number, po.invoice_number, d.name AS distributor_name
         FROM purchase_order_payments pop
         LEFT JOIN purchase_orders po ON po.id = pop.purchase_order_id
         LEFT JOIN distributors d ON d.id = pop.distributor_id
         ${distributorIdFilter ? `WHERE pop.distributor_id = ?` : ''}
         ORDER BY COALESCE(pop.transaction_date, pop.created_at) DESC, pop.id DESC`,
        distributorIdFilter ? [distributorIdFilter] : []
      );
      const items = await dbAllAsync(
        `SELECT poi.order_id, poi.product_id, poi.product_name, poi.quantity, poi.uom, poi.rate, poi.unit_price, poi.gst_rate, poi.discount_type, poi.discount_value
         FROM purchase_order_items poi
         INNER JOIN purchase_orders po ON po.id = poi.order_id
         ${distributorIdFilter ? `WHERE po.distributor_id = ?` : ''}`,
        distributorIdFilter ? [distributorIdFilter] : []
      );
      const ledgerBalances = await dbAllAsync(
        `SELECT distributor_id, balance, transaction_date, created_at, id
         FROM distributor_ledger
         ${distributorIdFilter ? `WHERE distributor_id = ?` : ''}
         ORDER BY distributor_id ASC, COALESCE(transaction_date, created_at) DESC, id DESC`,
        distributorIdFilter ? [distributorIdFilter] : []
      );

      const itemsByOrderId = new Map();
      for (const item of items) {
        const key = Number(item.order_id || 0);
        const list = itemsByOrderId.get(key) || [];
        list.push(item);
        itemsByOrderId.set(key, list);
      }
      const paymentsByOrderId = new Map();
      for (const payment of payments) {
        const key = Number(payment.purchase_order_id || 0);
        const list = paymentsByOrderId.get(key) || [];
        list.push(payment);
        paymentsByOrderId.set(key, list);
      }
      const ledgerBalanceByDistributor = new Map();
      for (const entry of ledgerBalances) {
        const key = Number(entry.distributor_id || 0);
        if (!key || ledgerBalanceByDistributor.has(key)) continue;
        ledgerBalanceByDistributor.set(key, Number(entry.balance || 0));
      }

      const enrichedOrders = orders.map((order) => ({
        ...order,
        items: itemsByOrderId.get(Number(order.id || 0)) || [],
        payments: paymentsByOrderId.get(Number(order.id || 0)) || [],
        po_status: getPurchaseOrderLifecycleStatus(order),
        payment_status: normalizePoPaymentStatus(order.payment_status, PO_PAYMENT_UNPAID),
        balance_due: Math.max(0, Number(order.balance_due || 0)),
        next_action: derivePurchaseNextAction({ ...order, items: itemsByOrderId.get(Number(order.id || 0)) || [] }),
      }));
      const orderById = new Map(enrichedOrders.map((order) => [Number(order.id || 0), order]));

      const isOpenOrder = (order) => {
        const lifecycleStatus = getPurchaseOrderLifecycleStatus(order);
        return lifecycleStatus !== PO_LIFECYCLE_CANCELLED && lifecycleStatus !== PO_LIFECYCLE_CLOSED;
      };
      const isDeliveryPending = (order) => {
        if (!isOpenOrder(order)) return false;
        if (hasOrderBeenReceived(order)) return false;
        if (!order.expected_delivery) return false;
        const expectedDate = normalizeTransactionDate(order.expected_delivery);
        return Boolean(expectedDate) && expectedDate <= todayKey;
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

      const payablesByDistributor = new Map();
      for (const payable of payables) {
        const key = Number(payable.distributor_id || 0);
        const list = payablesByDistributor.get(key) || [];
        list.push(payable);
        payablesByDistributor.set(key, list);
      }

      const paidTodayAmount = payments.reduce((sum, payment) => {
        const paymentDate = normalizeTransactionDate(payment.transaction_date || payment.created_at);
        if (paymentDate !== todayKey) return sum;
        return sum + Number(payment.amount || 0);
      }, 0);

      const ordersByDistributor = new Map();
      for (const order of enrichedOrders) {
        const key = Number(order.distributor_id || 0);
        const list = ordersByDistributor.get(key) || [];
        list.push(order);
        ordersByDistributor.set(key, list);
      }

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

      const buildScheduledDistributorEntry = (distributor, scheduleDate) => {
        const distributorId = Number(distributor.id || 0);
        const insight = distributorInsightById.get(distributorId) || null;
        const distributorOrders = ordersByDistributor.get(distributorId) || [];
        const activePayables = payablesWithInsights.filter((entry) => Number(entry.distributor_id || 0) === distributorId);
        const dueTodayAmount = activePayables
          .filter((entry) => entry.payment_due_date === todayKey)
          .reduce((sum, entry) => sum + Number(entry.balance_due || 0), 0);
        const overdueAmountForDistributor = activePayables
          .filter((entry) => entry.payment_due_date < todayKey)
          .reduce((sum, entry) => sum + Number(entry.balance_due || 0), 0);
        const strictDeadlineOrder = distributorOrders
          .map((order) => normalizeTransactionDate(order.strict_due_date || null))
          .filter(Boolean)
          .sort()[0] || null;
        return {
          distributor_id: distributorId,
          distributor_name: distributor.name,
          schedule_date: scheduleDate,
          schedule_day: getDistributorOrderScheduleDay(distributor),
          order_cutoff_time: distributor.order_cutoff_time || null,
          preferred_whatsapp_time: distributor.preferred_whatsapp_time || null,
          payment_terms: distributor.payment_terms || null,
          configured_payment_due_days: insight?.configured_payment_due_days ?? null,
          inferred_payment_due_days: insight?.inferred_payment_due_days ?? null,
          po_balance_due: Number(insight?.po_balance_due || 0),
          ledger_balance: Number(insight?.ledger_balance || 0),
          due_today_amount: dueTodayAmount,
          overdue_amount: overdueAmountForDistributor,
          likely_items: insight?.likely_items || [],
          suggested_items: insight?.suggested_items || [],
          products_supplied_all: insight?.products_supplied_all || parseDistributorProductsSupplied(distributor.products_supplied || ''),
          next_payment_due_date: insight?.next_payment_due_date || null,
          inferred_due_date: insight?.inferred_due_date || null,
          strict_due_date: strictDeadlineOrder,
          has_open_draft: distributorOrders.some((order) => isPoEditableLifecycle(getPurchaseOrderLifecycleStatus(order))),
        };
      };

      const activeDistributors = distributors.filter((distributor) => String(distributor.status || 'active').trim().toLowerCase() === 'active');
      const todayWeekday = getWeekdayFromDateKey(todayKey);
      const tomorrowWeekday = getWeekdayFromDateKey(tomorrowKey);
      const todayDistributors = activeDistributors
        .filter((distributor) => getDistributorOrderScheduleDay(distributor) === todayWeekday)
        .map((distributor) => buildScheduledDistributorEntry(distributor, todayKey))
        .sort((a, b) => Number(b.overdue_amount || 0) - Number(a.overdue_amount || 0) || Number(b.due_today_amount || 0) - Number(a.due_today_amount || 0) || String(a.distributor_name || '').localeCompare(String(b.distributor_name || '')));
      const tomorrowDistributors = activeDistributors
        .filter((distributor) => getDistributorOrderScheduleDay(distributor) === tomorrowWeekday)
        .map((distributor) => buildScheduledDistributorEntry(distributor, tomorrowKey))
        .sort((a, b) => Number(b.po_balance_due || 0) - Number(a.po_balance_due || 0) || String(a.distributor_name || '').localeCompare(String(b.distributor_name || '')));
      const weeklyDistributors = activeDistributors
        .map((distributor) => {
          const scheduleDay = getDistributorOrderScheduleDay(distributor);
          if (!scheduleDay) return null;
          const targetIndex = PURCHASE_WEEKDAYS.findIndex((day) => day === scheduleDay);
          const sourceIndex = PURCHASE_WEEKDAYS.findIndex((day) => day === todayWeekday);
          if (targetIndex < 0 || sourceIndex < 0) return null;
          const offset = (targetIndex - sourceIndex + 7) % 7;
          const scheduleDate = addDaysToDateKey(todayKey, offset);
          if (!scheduleDate) return null;
          return buildScheduledDistributorEntry(distributor, scheduleDate);
        })
        .filter(Boolean)
        .sort((a, b) => String(a.schedule_date || '').localeCompare(String(b.schedule_date || '')) || String(a.distributor_name || '').localeCompare(String(b.distributor_name || '')));

      const predictedPaymentsToday = payablesWithInsights
        .filter((entry) => entry.inferred_due_date === todayKey || entry.payment_due_date === todayKey || entry.payment_due_date < todayKey)
        .map((entry) => ({
          ...entry,
          prediction_reason: entry.payment_due_date < todayKey
            ? 'overdue'
            : (entry.inferred_due_date === todayKey && entry.payment_due_date !== todayKey ? 'history_inferred_today' : 'due_today'),
        }))
        .sort((a, b) => Number(b.balance_due || 0) - Number(a.balance_due || 0) || String(a.distributor_name || '').localeCompare(String(b.distributor_name || '')));

      const predictedPaymentsNext = distributorInsights
        .filter((entry) => entry.next_payment_due_date)
        .map((entry) => ({
          distributor_id: entry.distributor_id,
          distributor_name: entry.distributor_name,
          next_payment_due_date: entry.next_payment_due_date,
          next_payment_due_source: entry.next_payment_due_source,
          predicted_payment_amount: Number(entry.predicted_payment_amount || 0),
          outstanding_amount: Number(entry.outstanding_amount || 0),
        }))
        .sort((a, b) => String(a.next_payment_due_date || '').localeCompare(String(b.next_payment_due_date || ''))
          || Number(b.predicted_payment_amount || 0) - Number(a.predicted_payment_amount || 0));

      const predictedDeliveriesNext = distributorInsights
        .filter((entry) => entry.next_delivery_date)
        .map((entry) => ({
          distributor_id: entry.distributor_id,
          distributor_name: entry.distributor_name,
          next_delivery_date: entry.next_delivery_date,
          next_delivery_source: entry.next_delivery_source,
          predicted_delivery_count: Number(entry.predicted_delivery_count || 0),
          active_open_orders: Number(entry.active_open_orders || 0),
        }))
        .sort((a, b) => String(a.next_delivery_date || '').localeCompare(String(b.next_delivery_date || ''))
          || Number(b.predicted_delivery_count || 0) - Number(a.predicted_delivery_count || 0));

      const nextPaymentDate = predictedPaymentsNext[0]?.next_payment_due_date || null;
      const nextDeliveryDate = predictedDeliveriesNext[0]?.next_delivery_date || null;

      const reminders = distributors
        .filter((distributor) => String(distributor.status || 'active').trim().toLowerCase() === 'active')
        .filter((distributor) => normalizeBooleanFlag(distributor.auto_reminders_enabled, true))
        .map((distributor) => {
          const scheduleDay = getDistributorOrderScheduleDay(distributor);
          if (!scheduleDay || scheduleDay !== getWeekdayFromDateKey(tomorrowKey)) return null;
          const distributorOrders = ordersByDistributor.get(Number(distributor.id || 0)) || [];
          const hasEditableOrder = distributorOrders.some((order) => {
            const lifecycleStatus = getPurchaseOrderLifecycleStatus(order);
            return isPoEditableLifecycle(lifecycleStatus);
          });
          const insight = distributorInsightById.get(Number(distributor.id || 0)) || null;
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

      const workflow = openOrders
        .map((order) => {
          const lifecycleStatus = getPurchaseOrderLifecycleStatus(order);
          const paymentDueDate = getEffectivePurchaseDueDateKey(order, todayKey);
          const urgencyScore =
            (paymentDueDate < todayKey ? 100 : 0)
            + (order.next_action === 'Confirm with bill' ? 80 : 0)
            + (order.next_action === 'Collect payment' ? 70 : 0)
            + (order.next_action === 'Receive delivery' ? 60 : 0)
            + (order.next_action === 'Close PO' ? 50 : 0)
            + (lifecycleStatus === PO_LIFECYCLE_PREPARED ? 40 : 0);
          return {
            order_id: Number(order.id || 0),
            po_number: order.po_number,
            distributor_id: Number(order.distributor_id || 0),
            distributor_name: order.distributor_name,
            po_status: lifecycleStatus,
            payment_status: order.payment_status,
            balance_due: Number(order.balance_due || 0),
            payment_due_date: paymentDueDate,
            expected_delivery: normalizeTransactionDate(order.expected_delivery),
            next_action: order.next_action,
            urgency_score: urgencyScore,
            bill_number: order.bill_number || order.invoice_number || null,
          };
        })
        .filter((entry) => entry.next_action !== 'Monitor')
        .sort((a, b) => b.urgency_score - a.urgency_score || Number(b.balance_due || 0) - Number(a.balance_due || 0))
        .slice(0, 20);

      const waitingBillCount = openOrders.filter((order) => {
        const lifecycleStatus = getPurchaseOrderLifecycleStatus(order);
        return (lifecycleStatus === PO_LIFECYCLE_SENT || lifecycleStatus === PO_LIFECYCLE_REVISED || lifecycleStatus === PO_LIFECYCLE_PREPARED)
          && !String(order.bill_number || order.invoice_number || '').trim();
      }).length;
      const waitingDeliveryCount = openOrders.filter(isDeliveryPending).length;
      const closeReadyCount = openOrders.filter((order) => getPurchaseOrderLifecycleStatus(order) === PO_LIFECYCLE_FULLY_PAID).length;
      const payableTodayAmount = payablesWithInsights
        .filter((entry) => entry.payment_due_date === todayKey)
        .reduce((sum, entry) => sum + Number(entry.balance_due || 0), 0);
      const overdueAmount = payablesWithInsights
        .filter((entry) => entry.payment_due_date < todayKey)
        .reduce((sum, entry) => sum + Number(entry.balance_due || 0), 0);
      const predictedPaymentTodayAmount = predictedPaymentsToday
        .filter((entry) => entry.prediction_reason !== 'overdue')
        .reduce((sum, entry) => sum + Number(entry.balance_due || 0), 0);
      const outstandingPoAmount = orders.reduce((sum, order) => {
        const lifecycleStatus = getPurchaseOrderLifecycleStatus(order);
        if (lifecycleStatus === PO_LIFECYCLE_CANCELLED) return sum;
        return sum + Math.max(0, Number(order.balance_due || 0));
      }, 0);
      const unpostedOutstandingAmount = openOrders.reduce((sum, order) => {
        const lifecycleStatus = getPurchaseOrderLifecycleStatus(order);
        if (
          lifecycleStatus === PO_LIFECYCLE_PREPARED
          || lifecycleStatus === PO_LIFECYCLE_SENT
          || lifecycleStatus === PO_LIFECYCLE_REVISED
        ) {
          return sum + Math.max(0, Number(order.balance_due || 0));
        }
        return sum;
      }, 0);
      const ledgerOutstandingAmount = [...ledgerBalanceByDistributor.values()].reduce(
        (sum, balance) => {
          const numeric = Number(balance || 0);
          return sum + (numeric > 0 ? numeric : 0);
        },
        0
      );
      const outstandingAmount = ledgerOutstandingAmount + unpostedOutstandingAmount;

      const cards = {
        outstanding_amount: outstandingAmount,
        ledger_outstanding_amount: ledgerOutstandingAmount,
        po_outstanding_amount: outstandingPoAmount,
        payable_today_amount: payableTodayAmount,
        overdue_amount: overdueAmount,
        predicted_payment_today_amount: predictedPaymentTodayAmount,
        predicted_payment_next_count: predictedPaymentsNext.length,
        predicted_delivery_next_count: predictedDeliveriesNext.length,
        next_payment_due_date: nextPaymentDate,
        next_delivery_date: nextDeliveryDate,
        paid_today_amount: paidTodayAmount,
        reminder_count: reminders.length,
        waiting_bill_count: waitingBillCount,
        waiting_delivery_count: waitingDeliveryCount,
        close_ready_count: closeReadyCount,
        today_distributor_count: todayDistributors.length,
        tomorrow_distributor_count: tomorrowDistributors.length,
        weekly_distributor_count: weeklyDistributors.length,
      };

      if (persistSnapshots) {
        try {
          await persistPurchaseAnalyticsSnapshotsAsync({
            snapshotDate: todayKey,
            cards,
            predictedPaymentsToday,
            predictedPaymentsNext,
            predictedDeliveriesNext,
            distributorInsights,
          });
        } catch (error) {
          console.warn('[PURCHASE_OPS] Failed to persist analytics snapshots:', error?.message || error);
        }
      }

      const actionRollups = await buildPurchaseActionRollupsAsync({
        startDate: rollupRange.startDate,
        endDate: rollupRange.endDate,
        distributorId: distributorIdFilter,
      });

      return res.json({
        today: todayKey,
        tomorrow: tomorrowKey,
        automation: {
          notifications: PURCHASE_OPERATIONS_NOTIFICATIONS_ENABLED ? 'automatic' : 'disabled',
          whatsapp: 'manual',
          po_preparation: 'manual',
        },
        cards,
        today_distributors: todayDistributors,
        tomorrow_distributors: tomorrowDistributors,
        weekly_distributors: weeklyDistributors,
        predicted_payments_today: predictedPaymentsToday,
        predicted_payments_next: predictedPaymentsNext,
        predicted_deliveries_next: predictedDeliveriesNext,
        reminders,
        payables: payablesWithInsights.slice(0, 20),
        workflow,
        distributor_insights: distributorInsights.slice(0, 20),
        action_rollups: actionRollups,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to load purchase operations summary' });
    }
  };
  const collectPurchaseAnalyticsSnapshotsAsync = async ({ date = null, distributorId = null } = {}) => {
    if (typeof handlePurchaseOperationsSummary !== 'function') return null;
    const req = { query: {} };
    if (date) req.query.date = date;
    if (distributorId) req.query.distributor_id = distributorId;
    const res = {
      statusCode: 200,
      payload: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.payload = payload;
        return payload;
      },
    };
    await handlePurchaseOperationsSummary(req, res, { persistSnapshots: true });
    if (res.statusCode >= 400) {
      throw new Error(res.payload?.error || 'Failed to collect purchase analytics snapshots');
    }
    return res.payload;
  };


  return {
    handlePurchaseOperationsSummary,
    collectPurchaseAnalyticsSnapshotsAsync,
  };
};

module.exports = { createPurchaseOperationsSummary };
