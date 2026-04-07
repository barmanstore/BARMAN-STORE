import { getTodayDate } from '../../../../shared/utils/dateTime';
import { getLedgerEntryTimestamp, getSignedLedgerAmount, toNumber } from '../../../../shared/utils/ledger';
import { calculateOrderBalanceAmount, getPoLifecycleStatus } from './orders';

export const getRecordDate = (entry) => getLedgerEntryTimestamp(entry, ['transaction_date', 'created_at', 'date']);

export const getRecordDateKey = (entry) => {
  if (entry?.transaction_date) return String(entry.transaction_date);
  if (entry?.created_at) return String(entry.created_at);
  if (entry?.date) return String(entry.date);
  return '';
};

export const getNumericValue = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

export const normalizeTextKey = (value) => String(value || '').trim().toLowerCase();

export const getEntryTypeKey = (entry) => String(entry?.type || entry?.transaction_type || '').trim().toLowerCase();

export const isCreditLikeEntry = (entry) => {
  const typeKey = getEntryTypeKey(entry);
  return typeKey === 'credit' || typeKey === 'given';
};

export const getLedgerDistributorKey = (entry) => {
  if (entry?.distributor_id !== undefined && entry?.distributor_id !== null) return String(entry.distributor_id);
  if (entry?.distributor_name) return `name:${String(entry.distributor_name).toLowerCase()}`;
  return 'unknown';
};

export const getPurchaseOrderIdentityKey = (entry) => {
  if (!entry || !isCreditLikeEntry(entry)) return null;
  const distributorKey = getLedgerDistributorKey(entry);
  const sourceKey = normalizeTextKey(entry?.source);
  const sourceId = entry?.source_id ?? entry?.sourceId;
  if (sourceKey === 'purchase_order' && sourceId !== undefined && sourceId !== null && String(sourceId).trim() !== '') {
    return `${distributorKey}|poid:${String(sourceId).trim()}`;
  }

  const referenceKey = normalizeTextKey(entry?.reference || entry?.po_number);
  const descriptionKey = normalizeTextKey(entry?.description);
  if (referenceKey && descriptionKey.includes('purchase order')) {
    return `${distributorKey}|poref:${referenceKey}`;
  }
  return null;
};

export const getLedgerAmountKey = (entry) => toNumber(entry?.amount).toFixed(2);

export const getEntryDisplayBalance = (entry) => {
  const apiBalance = getNumericValue(entry?.balance);
  if (apiBalance !== null) return apiBalance;
  return getNumericValue(entry?.computed_balance);
};

export const getEntrySourceKey = (entry) => {
  const source = entry?.source ? String(entry.source) : '';
  const sourceId = entry?.source_id ?? entry?.sourceId;
  if (!source || sourceId === undefined || sourceId === null || sourceId === '') return null;
  return `${getLedgerDistributorKey(entry)}|${source}|${String(sourceId)}`;
};

export const getEntryDedupKey = (entry) => {
  const poIdentityKey = getPurchaseOrderIdentityKey(entry);
  if (poIdentityKey) return `po:${poIdentityKey}`;

  const sourceKey = getEntrySourceKey(entry);
  if (sourceKey) return `src:${sourceKey}`;

  const distributorKey = getLedgerDistributorKey(entry);
  const type = String(entry?.type || entry?.transaction_type || '').toLowerCase();
  const reference = normalizeTextKey(entry?.reference || entry?.po_number);
  const amount = getLedgerAmountKey(entry);
  const dateKey = getRecordDateKey(entry);
  if (reference || dateKey) return `fallback:${distributorKey}|${type}|${reference}|${amount}|${dateKey}`;
  if (entry?.id !== undefined && entry?.id !== null && String(entry.id) !== '') return `id:${String(entry.id)}`;
  return null;
};

export const getDerivedLedgerFromOrders = (orders, selectedDistributorId) => {
  const validStatuses = new Set(['confirmed', 'received', 'shipped', 'processed', 'part_paid', 'fully_paid', 'closed']);
  const derived = (orders || [])
    .filter((order) => {
      const lifecycle = getPoLifecycleStatus(order);
      if (['confirmed', 'part_paid', 'fully_paid', 'closed'].includes(lifecycle)) return true;
      return validStatuses.has(String(order.status || '').toLowerCase());
    })
    .map(order => ({
    id: `po-${order.id}`,
    distributor_id: order.distributor_id,
    distributor_name: order.distributor_name,
    supplier_id: order.supplier_id || null,
    supplier_name: order.supplier_name || null,
    type: 'credit',
    transaction_type: 'credit',
    amount: calculateOrderBalanceAmount(order),
    payment_mode: 'credit',
    reference: order.po_number,
    bill_number: order.bill_number || order.invoice_number || null,
    description: `Purchase Order ${order.po_number || ''}`.trim(),
    transaction_date: order.created_at || order.order_date || order.expected_delivery || getTodayDate(),
    source: 'purchase_order',
    source_id: order.id,
    mode: 'automatic'
  }));

  if (!selectedDistributorId) return derived;
  return derived.filter(entry => String(entry.distributor_id) === String(selectedDistributorId));
};

export const mergeLedgerRecords = (apiRecords, localRecords, derivedRecords) => {
  const baseRecords = Array.isArray(apiRecords) ? apiRecords : [];
  const local = Array.isArray(localRecords) ? localRecords : [];
  const derived = Array.isArray(derivedRecords) ? derivedRecords : [];
  const existingSourceKeys = new Set(
    [...baseRecords, ...local]
      .map(entry => getEntrySourceKey(entry))
      .filter(Boolean)
  );
  const missingDerived = derived.filter(entry => {
    const poIdentityKey = getPurchaseOrderIdentityKey(entry);
    if (poIdentityKey) {
      const duplicatePoEntry = [...baseRecords, ...local].some(existingEntry => {
        const existingPoIdentityKey = getPurchaseOrderIdentityKey(existingEntry);
        if (existingPoIdentityKey && existingPoIdentityKey === poIdentityKey) return true;

        if (!isCreditLikeEntry(existingEntry)) return false;
        const sameDistributor = getLedgerDistributorKey(existingEntry) === getLedgerDistributorKey(entry);
        if (!sameDistributor) return false;

        const sameReference = normalizeTextKey(existingEntry?.reference || existingEntry?.po_number) === normalizeTextKey(entry?.reference || entry?.po_number);
        const sameAmount = getLedgerAmountKey(existingEntry) === getLedgerAmountKey(entry);
        return sameReference && sameAmount;
      });
      if (duplicatePoEntry) return false;
    }

    const sourceKey = getEntrySourceKey(entry);
    return sourceKey ? !existingSourceKeys.has(sourceKey) : true;
  });
  const merged = [...baseRecords, ...local, ...missingDerived];

  const deduped = [];
  const seen = new Set();
  for (const entry of merged) {
    const key = getEntryDedupKey(entry);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    deduped.push(entry);
  }

  const runningBalanceByDistributor = {};
  const chronological = [...deduped].sort((a, b) => getRecordDate(a) - getRecordDate(b));
  const withBalances = chronological.map(entry => {
    const distributorKey = getLedgerDistributorKey(entry);
    const explicitBalance = getNumericValue(entry?.balance);
    if (explicitBalance !== null) {
      runningBalanceByDistributor[distributorKey] = explicitBalance;
    } else if (runningBalanceByDistributor[distributorKey] !== undefined) {
      runningBalanceByDistributor[distributorKey] += getSignedLedgerAmount(entry);
    } else if (baseRecords.length === 0) {
      runningBalanceByDistributor[distributorKey] = getSignedLedgerAmount(entry);
    }

    const nextBalance = runningBalanceByDistributor[distributorKey];
    return {
      ...entry,
      computed_balance: nextBalance === undefined ? null : nextBalance
    };
  });

  return withBalances.sort((a, b) => getRecordDate(b) - getRecordDate(a));
};

export const getLedgerBalanceSummary = (records, selectedDistributorId) => {
  const balancesByDistributor = {};
  for (const entry of records || []) {
    const key = getLedgerDistributorKey(entry);
    if (balancesByDistributor[key] === undefined) {
      const displayBalance = getEntryDisplayBalance(entry);
      if (displayBalance !== null) {
        balancesByDistributor[key] = displayBalance;
      }
    }
  }

  if (selectedDistributorId) {
    const selectedKey = String(selectedDistributorId);
    let selectedBalance = 0;
    for (const [key, balance] of Object.entries(balancesByDistributor)) {
      if (key === selectedKey) {
        selectedBalance = balance;
        break;
      }
    }
    return {
      label: 'Distributor Balance',
      value: selectedBalance
    };
  }

  const totalBalance = Object.values(balancesByDistributor).reduce((sum, value) => sum + toNumber(value), 0);
  return {
    label: 'Total Balance (All Distributors)',
    value: totalBalance
  };
};

