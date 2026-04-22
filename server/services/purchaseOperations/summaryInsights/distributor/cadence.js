const buildDistributorCadence = ({
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
} = {}) => {
  const cadenceIntervals = [];
  for (let index = 0; index < completedOrders.length - 1; index += 1) {
    const currentDate = getPurchaseOrderAnchorDateKey(completedOrders[index]);
    const nextDate = getPurchaseOrderAnchorDateKey(completedOrders[index + 1]);
    const diff =
      currentDate && nextDate ? Math.abs(getDaysBetweenDateKeys(nextDate, currentDate) || 0) : null;
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
    const offset =
      todayIndex >= 0 && targetIndex >= 0 ? (targetIndex - todayIndex + 7) % 7 || 7 : 0;
    nextOrderDate = addDaysToDateKey(todayKey, offset);
  } else if (cadenceDays && lastOrderDateKey) {
    nextOrderDate = addDaysToDateKey(lastOrderDateKey, cadenceDays);
  }

  return {
    cadenceDays,
    lastOrderDateKey,
    scheduleDay,
    nextOrderDate,
  };
};

module.exports = { buildDistributorCadence };
