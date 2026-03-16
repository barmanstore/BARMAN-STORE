const createPurchaseDateUtils = (deps = {}) => {
  const { PURCHASE_WEEKDAYS = [] } = deps;

  const normalizeWeekdayLabel = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    const exactMatch = PURCHASE_WEEKDAYS.find((day) => day.toLowerCase() === raw);
    if (exactMatch) return exactMatch;
    const prefixMatch = PURCHASE_WEEKDAYS.find((day) => day.toLowerCase().startsWith(raw.slice(0, 3)));
    return prefixMatch || '';
  };

  const addDaysToDateKey = (dateValue, days = 0) => {
    const baseDate = new Date(`${String(dateValue || '').slice(0, 10)}T00:00:00`);
    if (Number.isNaN(baseDate.getTime())) return null;
    baseDate.setDate(baseDate.getDate() + Number(days || 0));
    return baseDate.toISOString().slice(0, 10);
  };

  const getWeekdayFromDateKey = (dateValue) => {
    const baseDate = new Date(`${String(dateValue || '').slice(0, 10)}T00:00:00`);
    if (Number.isNaN(baseDate.getTime())) return '';
    return PURCHASE_WEEKDAYS[baseDate.getDay()] || '';
  };

  const getDaysBetweenDateKeys = (fromDate, toDate) => {
    const from = new Date(`${String(fromDate || '').slice(0, 10)}T00:00:00`);
    const to = new Date(`${String(toDate || '').slice(0, 10)}T00:00:00`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
    return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
  };

  const buildDateSeries = (startDate, endDate) => {
    const series = [];
    if (!startDate || !endDate) return series;
    let cursor = startDate;
    let guard = 0;
    while (cursor && cursor <= endDate && guard < 4000) {
      series.push(cursor);
      cursor = addDaysToDateKey(cursor, 1);
      guard += 1;
    }
    return series;
  };

  const normalizeTransactionDate = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    if (/^\d{4}-\d{2}-\d{2}[t\s]/i.test(raw)) return raw.slice(0, 10);

    let normalizedInput = raw;
    if (/^[a-z]{3}\s+[a-z]{3}\s+\d{1,2}$/i.test(raw)) {
      normalizedInput = `${raw} ${new Date().getFullYear()}`;
    }

    const parsedAt = Date.parse(normalizedInput);
    if (!Number.isFinite(parsedAt)) return null;
    const parsedDate = new Date(parsedAt);
    const year = parsedDate.getFullYear();
    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const day = String(parsedDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const resolveRollupRange = ({
    startDate,
    endDate,
    days = 30,
  } = {}) => {
    const normalizedEnd = normalizeTransactionDate(endDate || new Date().toISOString())
      || new Date().toISOString().slice(0, 10);
    let normalizedStart = normalizeTransactionDate(startDate || null);
    const normalizedDays = Math.max(1, Number(days || 30));
    if (!normalizedStart) {
      normalizedStart = addDaysToDateKey(normalizedEnd, -(normalizedDays - 1)) || normalizedEnd;
    }
    if (normalizedStart > normalizedEnd) {
      return { startDate: normalizedEnd, endDate: normalizedStart };
    }
    return { startDate: normalizedStart, endDate: normalizedEnd };
  };

  const resolveInsightDateRange = ({ startDate, endDate } = {}) => {
    const normalizedStart = normalizeTransactionDate(startDate || null);
    const normalizedEnd = normalizeTransactionDate(endDate || null);
    const endExclusive = normalizedEnd ? addDaysToDateKey(normalizedEnd, 1) : null;
    return {
      startDate: normalizedStart,
      endDate: normalizedEnd,
      endExclusive,
    };
  };

  const normalizeBooleanFlag = (value, fallback = true) => {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const raw = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
    if (['0', 'false', 'no', 'off'].includes(raw)) return false;
    return fallback;
  };

  const normalizeDistributorPaymentCycleType = (value, fallback = 'net') => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return fallback;
    if (raw === 'cod' || raw === 'cash' || raw === 'cash_on_delivery') return 'cod';
    return 'net';
  };

  const inferPaymentDueDaysFromTerms = (paymentTerms, fallback = 30) => {
    const raw = String(paymentTerms || '').trim().toLowerCase();
    if (!raw) return fallback;
    if (raw.includes('cash')) return 0;
    const numericMatch = raw.match(/(\d{1,3})/);
    if (numericMatch) {
      const days = Number(numericMatch[1] || fallback);
      return Number.isFinite(days) && days >= 0 ? days : fallback;
    }
    return fallback;
  };

  const getDistributorPaymentPlan = (distributor = {}, overrides = {}) => {
    const paymentCycleType = normalizeDistributorPaymentCycleType(
      overrides.payment_cycle_type ?? distributor.payment_cycle_type,
      normalizeDistributorPaymentCycleType(
        distributor.payment_terms,
        'net'
      )
    );
    const dueDaysRaw = Number(overrides.payment_due_days ?? distributor.payment_due_days);
    const paymentDueDays = Number.isFinite(dueDaysRaw) && dueDaysRaw >= 0
      ? Math.floor(dueDaysRaw)
      : inferPaymentDueDaysFromTerms(distributor.payment_terms, paymentCycleType === 'cod' ? 0 : 30);
    return {
      paymentCycleType,
      paymentDueDays,
    };
  };

  const computePurchasePaymentDueDate = (distributor = {}, referenceDate = null, overrides = {}) => {
    const referenceDateKey = normalizeTransactionDate(referenceDate || new Date().toISOString()) || new Date().toISOString().slice(0, 10);
    const plan = getDistributorPaymentPlan(distributor, overrides);
    if (plan.paymentCycleType === 'cod' || plan.paymentDueDays <= 0) return referenceDateKey;
    return addDaysToDateKey(referenceDateKey, plan.paymentDueDays) || referenceDateKey;
  };

  const getDistributorOrderScheduleDay = (distributor = {}) => (
    normalizeWeekdayLabel(distributor.order_day || distributor.visit_day || distributor.delivery_day)
  );

  const getEffectivePurchaseDueDateKey = (order = {}, fallbackDate = null) => (
    normalizeTransactionDate(
      order.strict_due_date
      || order.payment_due_date
      || order.expected_delivery
      || order.received_at
      || order.confirmed_at
      || order.created_at
      || fallbackDate
    ) || normalizeTransactionDate(fallbackDate || new Date().toISOString()) || new Date().toISOString().slice(0, 10)
  );

  const getPurchaseOrderAnchorDateKey = (order = {}) => (
    normalizeTransactionDate(
      order.planned_order_date
      || order.created_at
      || order.expected_delivery
      || order.received_at
      || order.confirmed_at
    )
  );

  const getPurchaseOrderDeliveryDateKey = (order = {}) => (
    normalizeTransactionDate(order.received_at || order.expected_delivery || null)
  );

  const getPurchaseOrderPaymentAnchorDateKey = (order = {}) => (
    normalizeTransactionDate(
      order.received_at
      || order.confirmed_at
      || order.planned_order_date
      || order.expected_delivery
      || order.created_at
    )
  );

  return {
    normalizeBooleanFlag,
    normalizeWeekdayLabel,
    addDaysToDateKey,
    getWeekdayFromDateKey,
    getDaysBetweenDateKeys,
    buildDateSeries,
    resolveRollupRange,
    normalizeTransactionDate,
    resolveInsightDateRange,
    normalizeDistributorPaymentCycleType,
    inferPaymentDueDaysFromTerms,
    getDistributorPaymentPlan,
    computePurchasePaymentDueDate,
    getDistributorOrderScheduleDay,
    getEffectivePurchaseDueDateKey,
    getPurchaseOrderAnchorDateKey,
    getPurchaseOrderDeliveryDateKey,
    getPurchaseOrderPaymentAnchorDateKey,
  };
};

module.exports = { createPurchaseDateUtils };
