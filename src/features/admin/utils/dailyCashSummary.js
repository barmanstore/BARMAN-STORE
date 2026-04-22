import { asNumber } from './adminHelpers';

export const createEmptyCashSummary = () => ({
  totalBilled: 0,
  cashCollected: 0,
  creditIssued: 0,
  paidBills: 0,
  pendingBills: 0,
  txCount: 0,
  avgTicket: 0,
  expectedDrawerCash: 0,
  effectiveCashPicture: 0,
  cashVariance: 0,
  hasManualCashTally: false,
  manualCashTally: 0,
  cashTallyUpdatedAt: '',
  cashTallyUpdatedByName: '',
});

export const buildCashSummary = ({
  totalBilled = 0,
  cashCollected = 0,
  creditIssued = 0,
  paidBills = 0,
  pendingBills = 0,
  txCount = 0,
  hasManualCashTally = false,
  manualCashTally = 0,
  cashTallyUpdatedAt = '',
  cashTallyUpdatedByName = '',
} = {}) => {
  const normalizedTotalBilled = asNumber(totalBilled, 0);
  const normalizedCashCollected = asNumber(cashCollected, 0);
  const normalizedCreditIssued = asNumber(creditIssued, 0);
  const normalizedPaidBills = Math.max(0, asNumber(paidBills, 0));
  const normalizedPendingBills = Math.max(0, asNumber(pendingBills, 0));
  const normalizedTxCount = Math.max(0, asNumber(txCount, 0));
  const manualTallyEnabled = Boolean(hasManualCashTally);
  const resolvedManualCashTally = manualTallyEnabled ? asNumber(manualCashTally, 0) : 0;
  const effectiveCashPicture = manualTallyEnabled
    ? resolvedManualCashTally
    : normalizedCashCollected;

  return {
    totalBilled: normalizedTotalBilled,
    cashCollected: normalizedCashCollected,
    creditIssued: normalizedCreditIssued,
    paidBills: normalizedPaidBills,
    pendingBills: normalizedPendingBills,
    txCount: normalizedTxCount,
    avgTicket: normalizedTxCount > 0 ? normalizedTotalBilled / normalizedTxCount : 0,
    expectedDrawerCash: normalizedCashCollected,
    effectiveCashPicture,
    cashVariance: effectiveCashPicture - normalizedCashCollected,
    hasManualCashTally: manualTallyEnabled,
    manualCashTally: resolvedManualCashTally,
    cashTallyUpdatedAt: String(cashTallyUpdatedAt || '').trim(),
    cashTallyUpdatedByName: String(cashTallyUpdatedByName || '').trim(),
  };
};

export const normalizeCashSummary = (payload) => {
  const source = payload && typeof payload === 'object' ? payload : {};
  const hasManualCashTally = Boolean(source.has_manual_cash_tally ?? source.hasManualCashTally);

  return buildCashSummary({
    totalBilled: source.total_billed ?? source.totalBilled,
    cashCollected: source.cash_collected ?? source.cashCollected,
    creditIssued: source.credit_issued ?? source.creditIssued,
    paidBills: source.paid_bills ?? source.paidBills,
    pendingBills: source.pending_bills ?? source.pendingBills,
    txCount: source.tx_count ?? source.txCount,
    hasManualCashTally,
    manualCashTally: hasManualCashTally ? (source.manual_cash_tally ?? source.manualCashTally) : 0,
    cashTallyUpdatedAt: source.cash_tally_updated_at ?? source.cashTallyUpdatedAt,
    cashTallyUpdatedByName: source.cash_tally_updated_by_name ?? source.cashTallyUpdatedByName,
  });
};

export const normalizeDailyCashTallyEntry = (payload, fallbackDateKey = '') => {
  const source = payload?.entry && typeof payload.entry === 'object' ? payload.entry : payload;
  if (!source || typeof source !== 'object') return null;

  const date = String(
    source.date || source.tally_date || payload?.date || fallbackDateKey || ''
  ).trim();
  const countedCashTotal = Number(source.counted_cash_total ?? source.countedCashTotal);
  if (!date || !Number.isFinite(countedCashTotal)) return null;

  return {
    date,
    countedCashTotal,
    note: String(source.note || '').trim(),
    createdAt: String(source.created_at || source.createdAt || '').trim(),
    updatedAt: String(source.updated_at || source.updatedAt || '').trim(),
    createdBy: Number(source.created_by || source.createdBy || 0) || null,
    updatedBy: Number(source.updated_by || source.updatedBy || 0) || null,
    updatedByName: String(source.updated_by_name || source.updatedByName || '').trim(),
  };
};
