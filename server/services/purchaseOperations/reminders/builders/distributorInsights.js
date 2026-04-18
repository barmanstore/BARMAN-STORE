const buildDistributorInsights = ({
  todayKey,
  distributors,
  ordersByDistributor,
  normalizeTransactionDate,
  addDaysToDateKey,
  getDistributorOrderScheduleDay,
  getPurchaseOrderLifecycleStatus,
  getWeekdayFromDateKey,
  getDaysBetweenDateKeys,
  PURCHASE_WEEKDAYS,
  PO_LIFECYCLE_CANCELLED,
} = {}) =>
  (distributors || [])
    .filter(
      (distributor) =>
        String(distributor.status || 'active')
          .trim()
          .toLowerCase() === 'active'
    )
    .map((distributor) => {
      const distributorIdKey = Number(distributor.id || 0);
      const distributorOrders = [...(ordersByDistributor.get(distributorIdKey) || [])].sort(
        (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );
      const completedOrders = distributorOrders.filter(
        (order) => getPurchaseOrderLifecycleStatus(order) !== PO_LIFECYCLE_CANCELLED
      );
      const cadenceSource = completedOrders;
      const cadenceIntervals = [];
      for (let index = 0; index < cadenceSource.length - 1; index += 1) {
        const currentDate = normalizeTransactionDate(
          cadenceSource[index].created_at ||
            cadenceSource[index].planned_order_date ||
            cadenceSource[index].expected_delivery
        );
        const nextDate = normalizeTransactionDate(
          cadenceSource[index + 1].created_at ||
            cadenceSource[index + 1].planned_order_date ||
            cadenceSource[index + 1].expected_delivery
        );
        const diff =
          currentDate && nextDate
            ? Math.abs(getDaysBetweenDateKeys(nextDate, currentDate) || 0)
            : null;
        if (diff && diff > 0) cadenceIntervals.push(diff);
      }
      const cadenceDays = cadenceIntervals.length
        ? Math.max(
            1,
            Math.round(
              cadenceIntervals.reduce((sum, value) => sum + value, 0) / cadenceIntervals.length
            )
          )
        : null;
      const lastOrder = completedOrders[0] || null;
      const scheduleDay = getDistributorOrderScheduleDay(distributor);
      let nextOrderDate = null;
      if (scheduleDay) {
        const todayWeekday = getWeekdayFromDateKey(todayKey);
        const todayIndex = PURCHASE_WEEKDAYS.findIndex((day) => day === todayWeekday);
        const targetIndex = PURCHASE_WEEKDAYS.findIndex((day) => day === scheduleDay);
        const offset =
          todayIndex >= 0 && targetIndex >= 0 ? (targetIndex - todayIndex + 7) % 7 || 7 : 0;
        nextOrderDate = addDaysToDateKey(todayKey, offset);
      } else if (cadenceDays && lastOrder) {
        nextOrderDate = addDaysToDateKey(
          normalizeTransactionDate(
            lastOrder.planned_order_date || lastOrder.created_at || lastOrder.expected_delivery
          ),
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
          const suggestionKey = String(item.product_id || item.product_name || '')
            .trim()
            .toLowerCase();
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
          const orderCreatedAt = String(
            order.created_at || order.planned_order_date || order.expected_delivery || ''
          );
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
            return String(b.latest_created_at || '').localeCompare(
              String(a.latest_created_at || '')
            );
          })
          .slice(0, 5)
          .map((entry) => ({
            product_id: entry.product_id,
            product_name: entry.product_name,
            quantity:
              Number(entry.quantity_count || 0) > 0
                ? Math.max(
                    1,
                    Number(
                      (
                        Number(entry.quantity_total || 0) / Number(entry.quantity_count || 1)
                      ).toFixed(2)
                    )
                  )
                : 1,
            uom: entry.uom || 'pcs',
            rate: Number(entry.rate || 0),
            unit_price: Number(entry.rate || 0),
            gst_rate: Number(entry.gst_rate || 0),
            discount_type: entry.discount_type || 'percent',
            discount_value: Number(entry.discount_value || 0),
          })),
        outstanding_amount: completedOrders.reduce(
          (sum, order) => sum + Math.max(0, Number(order.balance_due || 0)),
          0
        ),
      };
    });

module.exports = { buildDistributorInsights };
