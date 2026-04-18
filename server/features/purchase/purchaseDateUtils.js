const { createDateKeyUtils } = require('./dateUtils/dateKeys');
const { createScheduleUtils } = require('./dateUtils/scheduleUtils');
const { createRangeUtils } = require('./dateUtils/ranges');
const { createPaymentPlanUtils } = require('./dateUtils/paymentPlan');
const { createOrderAnchorUtils } = require('./dateUtils/orderAnchors');

const createPurchaseDateUtils = (deps = {}) => {
  const { PURCHASE_WEEKDAYS = [] } = deps;

  const dateKeyUtils = createDateKeyUtils({ PURCHASE_WEEKDAYS });
  const scheduleUtils = createScheduleUtils({
    normalizeWeekdayLabel: dateKeyUtils.normalizeWeekdayLabel,
  });
  const rangeUtils = createRangeUtils({
    normalizeTransactionDate: dateKeyUtils.normalizeTransactionDate,
    addDaysToDateKey: dateKeyUtils.addDaysToDateKey,
  });
  const paymentPlanUtils = createPaymentPlanUtils({
    normalizeTransactionDate: dateKeyUtils.normalizeTransactionDate,
    addDaysToDateKey: dateKeyUtils.addDaysToDateKey,
  });
  const orderAnchorUtils = createOrderAnchorUtils({
    normalizeTransactionDate: dateKeyUtils.normalizeTransactionDate,
  });

  return {
    ...paymentPlanUtils,
    ...dateKeyUtils,
    ...rangeUtils,
    ...scheduleUtils,
    ...orderAnchorUtils,
  };
};

module.exports = { createPurchaseDateUtils };
