import { toNumber } from '../../../../shared/utils/ledger';

const GST_RATE_OPTIONS = [0, 5, 18, 40];

const normalizeGstRateOption = (value) => {
  const numeric = toNumber(value);
  return GST_RATE_OPTIONS.includes(numeric) ? numeric : 5;
};

const getPurchaseRequestErrorMessage = (err, fallbackMessage) => {
  const conflictType = String(err?.payload?.conflict_type || '')
    .trim()
    .toLowerCase();
  if (Number(err?.status || 0) === 409 && conflictType === 'purchase_order_duplicate') {
    const conflictPo = String(err?.payload?.conflict?.po_number || '').trim();
    return conflictPo
      ? `Duplicate prevented. Matching purchase order already exists: ${conflictPo}. Open or edit that PO instead of creating another one.`
      : 'Duplicate prevented. A matching purchase order already exists for the same distributor, planned date, and item basket.';
  }
  return err?.message || fallbackMessage;
};

const normalizePoLifecycleStatus = (status) => {
  const raw = String(status || '')
    .trim()
    .toLowerCase();
  if (!raw) return 'prepared';
  if (raw === 'prepared' || raw === 'registered' || raw === 'pending' || raw === 'draft')
    return 'prepared';
  if (raw === 'sent') return 'sent';
  if (raw === 'revised' || raw === 'edited') return 'revised';
  if (raw === 'confirmed' || raw === 'processed' || raw === 'received' || raw === 'shipped')
    return 'confirmed';
  if (raw === 'part_paid' || raw === 'partial_paid') return 'part_paid';
  if (raw === 'fully_paid' || raw === 'full_paid' || raw === 'paid') return 'fully_paid';
  if (raw === 'closed') return 'closed';
  if (raw === 'cancelled' || raw === 'canceled') return 'cancelled';
  return 'prepared';
};

const normalizePoPaymentStatus = (status) => {
  const raw = String(status || '')
    .trim()
    .toLowerCase();
  if (!raw) return 'unpaid';
  if (raw === 'paid') return 'paid';
  if (raw === 'part_paid' || raw === 'partpaid' || raw === 'partial') return 'part_paid';
  if (raw === 'pending') return 'unpaid';
  if (raw === 'unpaid') return 'unpaid';
  return 'unpaid';
};

const calculateOrderBalanceAmount = (order) => {
  const explicitTotal = toNumber(order?.total_amount ?? order?.grand_total ?? order?.line_total);
  if (explicitTotal > 0) return explicitTotal;

  const items = Array.isArray(order?.items) ? order.items : [];
  const itemsTotal = items.reduce((sum, item) => {
    const lineTotal = toNumber(item?.line_total ?? item?.total_amount ?? item?.total);
    if (lineTotal > 0) return sum + lineTotal;
    const lineTaxable = toNumber(item?.taxable_value);
    const lineTax = toNumber(item?.tax_amount);
    if (lineTaxable > 0 || lineTax > 0) return sum + lineTaxable + lineTax;
    const qty = toNumber(item?.quantity);
    const rate = toNumber(item?.rate ?? item?.unit_price);
    return sum + qty * rate;
  }, 0);
  if (itemsTotal > 0) return itemsTotal;

  const taxable = toNumber(order?.taxable_value);
  const tax = toNumber(order?.tax_amount);
  if (taxable > 0 || tax > 0) return taxable + tax;

  return toNumber(order?.total);
};

const getOrderDisplayTotal = (order) => {
  return calculateOrderBalanceAmount(order);
};

const getPoLifecycleStatus = (order) =>
  normalizePoLifecycleStatus(order?.po_status || order?.status);
const getPoPaymentStatus = (order) => normalizePoPaymentStatus(order?.payment_status);
const getPoPaidAmount = (order) => Math.max(0, toNumber(order?.paid_amount));
const getPoBalanceDue = (order) => {
  const explicitBalance = toNumber(order?.balance_due);
  if (explicitBalance > 0) return explicitBalance;
  const total = Math.max(0, getOrderDisplayTotal(order));
  const paid = Math.min(total, getPoPaidAmount(order));
  return Math.max(0, total - paid);
};

const isPoEditable = (order) => {
  const lifecycleStatus = getPoLifecycleStatus(order);
  return (
    lifecycleStatus === 'prepared' || lifecycleStatus === 'sent' || lifecycleStatus === 'revised'
  );
};

const canReceivePo = (order) => {
  const lifecycleStatus = getPoLifecycleStatus(order);
  return (
    ['confirmed', 'part_paid', 'fully_paid'].includes(lifecycleStatus) &&
    String(order?.status || '')
      .trim()
      .toLowerCase() !== 'received'
  );
};

const canAddPaymentToPo = (order) =>
  ['confirmed', 'part_paid'].includes(getPoLifecycleStatus(order));
const canClosePo = (order) =>
  getPoLifecycleStatus(order) === 'fully_paid' && getPoBalanceDue(order) <= 0;
const getPoNextAction = (order) => {
  const lifecycleStatus = getPoLifecycleStatus(order);
  const paymentStatus = getPoPaymentStatus(order);
  const hasReceived =
    String(order?.status || '')
      .trim()
      .toLowerCase() === 'received' ||
    (Array.isArray(order?.items) &&
      order.items.length > 0 &&
      order.items.every((item) => toNumber(item?.received_quantity) >= toNumber(item?.quantity)));
  if (lifecycleStatus === 'cancelled') return 'Cancelled';
  if (lifecycleStatus === 'closed') return 'Closed';
  if (lifecycleStatus === 'prepared') return 'Send to distributor';
  if (lifecycleStatus === 'sent' || lifecycleStatus === 'revised') return 'Confirm with bill';
  if (!hasReceived) return 'Receive delivery';
  if (paymentStatus !== 'paid' && getPoBalanceDue(order) > 0) return 'Collect payment';
  if (lifecycleStatus === 'fully_paid') return 'Close PO';
  return order?.next_action || 'Monitor';
};

export {
  GST_RATE_OPTIONS,
  calculateOrderBalanceAmount,
  canAddPaymentToPo,
  canClosePo,
  canReceivePo,
  getOrderDisplayTotal,
  getPoBalanceDue,
  getPoLifecycleStatus,
  getPoNextAction,
  getPoPaidAmount,
  getPoPaymentStatus,
  getPurchaseRequestErrorMessage,
  isPoEditable,
  normalizeGstRateOption,
  normalizePoPaymentStatus,
};
