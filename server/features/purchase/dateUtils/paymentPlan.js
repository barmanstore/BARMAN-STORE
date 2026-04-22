const createPaymentPlanUtils = ({ normalizeTransactionDate, addDaysToDateKey }) => {
  const normalizeBooleanFlag = (value, fallback = true) => {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const raw = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
    if (['0', 'false', 'no', 'off'].includes(raw)) return false;
    return fallback;
  };

  const normalizeDistributorPaymentCycleType = (value, fallback = 'net') => {
    const raw = String(value || '')
      .trim()
      .toLowerCase();
    if (!raw) return fallback;
    if (raw === 'cod' || raw === 'cash' || raw === 'cash_on_delivery') return 'cod';
    return 'net';
  };

  const inferPaymentDueDaysFromTerms = (paymentTerms, fallback = 30) => {
    const raw = String(paymentTerms || '')
      .trim()
      .toLowerCase();
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
      normalizeDistributorPaymentCycleType(distributor.payment_terms, 'net')
    );
    const dueDaysRaw = Number(overrides.payment_due_days ?? distributor.payment_due_days);
    const paymentDueDays =
      Number.isFinite(dueDaysRaw) && dueDaysRaw >= 0
        ? Math.floor(dueDaysRaw)
        : inferPaymentDueDaysFromTerms(
            distributor.payment_terms,
            paymentCycleType === 'cod' ? 0 : 30
          );
    return {
      paymentCycleType,
      paymentDueDays,
    };
  };

  const computePurchasePaymentDueDate = (
    distributor = {},
    referenceDate = null,
    overrides = {}
  ) => {
    const referenceDateKey =
      normalizeTransactionDate(referenceDate || new Date().toISOString()) ||
      new Date().toISOString().slice(0, 10);
    const plan = getDistributorPaymentPlan(distributor, overrides);
    if (plan.paymentCycleType === 'cod' || plan.paymentDueDays <= 0) return referenceDateKey;
    return addDaysToDateKey(referenceDateKey, plan.paymentDueDays) || referenceDateKey;
  };

  return {
    normalizeBooleanFlag,
    normalizeDistributorPaymentCycleType,
    inferPaymentDueDaysFromTerms,
    getDistributorPaymentPlan,
    computePurchasePaymentDueDate,
  };
};

module.exports = { createPaymentPlanUtils };
