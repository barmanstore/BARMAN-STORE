const buildSupplierVisitKey = (supplierId, dateKey) => (
  `${Number(supplierId || 0)}@@${String(dateKey || '').trim()}`
);

const buildSupplierVisitStates = ({
  baseData,
  metrics,
  weeklyDistributors,
  addDaysToDateKey,
  getSupplierScheduleConfig,
  getWeekdayFromDateKey,
  getPurchaseOrderLifecycleStatus,
  normalizeTransactionDate,
  PO_LIFECYCLE_CONFIRMED,
  PO_LIFECYCLE_PART_PAID,
  PO_LIFECYCLE_FULLY_PAID,
  PO_LIFECYCLE_CLOSED,
} = {}) => {
  const {
    todayKey,
    boardEndKey,
    distributors,
    suppliers,
    payments,
    supplierVisits,
  } = baseData || {};
  const { enrichedOrders } = metrics || {};

  const doneLifecycleStatuses = new Set([
    PO_LIFECYCLE_CONFIRMED,
    PO_LIFECYCLE_PART_PAID,
    PO_LIFECYCLE_FULLY_PAID,
    PO_LIFECYCLE_CLOSED,
  ].filter(Boolean));
  const supplierById = new Map(
    (Array.isArray(suppliers) ? suppliers : []).map((entry) => [Number(entry?.id || 0), entry])
  );
  const distributorById = new Map(
    (Array.isArray(distributors) ? distributors : []).map((entry) => [Number(entry?.id || 0), entry])
  );
  const supplierVisitMap = new Map();

  const registerSupplierVisit = (supplierIdValue, dateValue, extra = {}) => {
    const supplierId = Number(supplierIdValue || 0);
    const dateKey = normalizeTransactionDate(dateValue || null);
    if (!supplierId || !dateKey) return;
    if (todayKey && dateKey < todayKey) return;
    if (boardEndKey && dateKey > boardEndKey) return;
    const supplier = supplierById.get(supplierId) || null;
    const distributorId = Number(extra?.distributor_id || supplier?.distributor_id || 0) || null;
    const distributor = distributorId ? distributorById.get(distributorId) || null : null;
    const key = buildSupplierVisitKey(supplierId, dateKey);
    if (supplierVisitMap.has(key)) return;
    supplierVisitMap.set(key, {
      supplier_id: supplierId,
      distributor_id: distributorId,
      supplier_name: extra?.supplier_name || supplier?.name || null,
      distributor_name: extra?.distributor_name || distributor?.name || null,
      date: dateKey,
    });
  };

  const activeSuppliers = (Array.isArray(suppliers) ? suppliers : [])
    .filter((supplier) => Number(supplier?.id || 0) > 0)
    .filter((supplier) => Boolean(supplier?.is_active ?? true))
    .filter((supplier) => {
      const distributor = distributorById.get(Number(supplier?.distributor_id || 0));
      return distributor && String(distributor?.status || 'active').trim().toLowerCase() === 'active';
    });

  activeSuppliers.forEach((supplier) => {
    const distributor = distributorById.get(Number(supplier?.distributor_id || 0));
    const schedule = typeof getSupplierScheduleConfig === 'function'
      ? getSupplierScheduleConfig(supplier, distributor)
      : { scheduleType: 'irregular', scheduleDay: null };
    if (schedule?.scheduleType === 'daily') {
      for (let offset = 0; offset <= 6; offset += 1) {
        registerSupplierVisit(supplier.id, addDaysToDateKey(todayKey, offset), {
          distributor_id: supplier.distributor_id,
        });
      }
    }
  });

  (Array.isArray(weeklyDistributors) ? weeklyDistributors : []).forEach((entry) => {
    registerSupplierVisit(entry?.supplier_id, entry?.schedule_date, {
      distributor_id: entry?.distributor_id,
      supplier_name: entry?.supplier_name,
      distributor_name: entry?.distributor_name,
    });
  });

  (Array.isArray(enrichedOrders) ? enrichedOrders : []).forEach((order) => {
    registerSupplierVisit(order?.supplier_id, order?.planned_order_date, {
      distributor_id: order?.distributor_id,
      supplier_name: order?.supplier_name,
      distributor_name: order?.distributor_name,
    });
  });

  (Array.isArray(payments) ? payments : []).forEach((payment) => {
    registerSupplierVisit(payment?.supplier_id, payment?.transaction_date || payment?.created_at, {
      distributor_id: payment?.distributor_id,
      supplier_name: payment?.supplier_name,
      distributor_name: payment?.distributor_name,
    });
  });

  (Array.isArray(supplierVisits) ? supplierVisits : []).forEach((visit) => {
    registerSupplierVisit(visit?.supplier_id, visit?.visit_date, {
      distributor_id: visit?.distributor_id,
      supplier_name: visit?.supplier_name,
      distributor_name: visit?.distributor_name,
    });
  });

  const poDoneKeys = new Set();
  (Array.isArray(enrichedOrders) ? enrichedOrders : []).forEach((order) => {
    const lifecycleStatus = getPurchaseOrderLifecycleStatus(order);
    if (!doneLifecycleStatuses.has(lifecycleStatus)) return;
    const supplierId = Number(order?.supplier_id || 0);
    const dateKey = normalizeTransactionDate(order?.planned_order_date || null);
    if (!supplierId || !dateKey) return;
    poDoneKeys.add(buildSupplierVisitKey(supplierId, dateKey));
  });

  const paymentDoneKeys = new Set();
  (Array.isArray(payments) ? payments : []).forEach((payment) => {
    const supplierId = Number(payment?.supplier_id || 0);
    const dateKey = normalizeTransactionDate(payment?.transaction_date || payment?.created_at || null);
    if (!supplierId || !dateKey) return;
    if (Number(payment?.amount || 0) <= 0) return;
    paymentDoneKeys.add(buildSupplierVisitKey(supplierId, dateKey));
  });

  const closedVisitKeys = new Set();
  (Array.isArray(supplierVisits) ? supplierVisits : []).forEach((visit) => {
    const supplierId = Number(visit?.supplier_id || 0);
    const dateKey = normalizeTransactionDate(visit?.visit_date || null);
    if (!supplierId || !dateKey) return;
    if (!visit?.visit_closed) return;
    closedVisitKeys.add(buildSupplierVisitKey(supplierId, dateKey));
  });

  return Array.from(supplierVisitMap.values())
    .map((entry) => {
      const key = buildSupplierVisitKey(entry.supplier_id, entry.date);
      const poDone = poDoneKeys.has(key);
      const paymentDone = paymentDoneKeys.has(key);
      const visitClosed = closedVisitKeys.has(key);
      return {
        ...entry,
        poDone,
        paymentDone,
        visitClosed,
        isHandled: poDone || visitClosed,
      };
    })
    .sort((left, right) => (
      String(left.date || '').localeCompare(String(right.date || ''))
      || String(left.distributor_name || '').localeCompare(String(right.distributor_name || ''))
      || String(left.supplier_name || '').localeCompare(String(right.supplier_name || ''))
    ));
};

module.exports = { buildSupplierVisitStates };
