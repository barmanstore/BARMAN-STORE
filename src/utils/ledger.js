export const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

export const getLedgerTypeKey = (entry) => String(entry?.type || entry?.transaction_type || '').toLowerCase();

export const getSignedLedgerAmount = (entry, debitTypes = ['payment']) => {
  const amount = Math.abs(toNumber(entry?.amount));
  return debitTypes.includes(getLedgerTypeKey(entry)) ? -amount : amount;
};

export const getLedgerTypeLabel = (entry) => {
  const type = getLedgerTypeKey(entry);
  if (type === 'payment') return 'Payment';
  if (type === 'given' || type === 'credit') return 'Credit';
  return type ? type.charAt(0).toUpperCase() + type.slice(1) : '-';
};

export const getLedgerEntryTimestamp = (entry, fields = ['transaction_date', 'created_at', 'date']) => {
  for (const field of fields) {
    const value = entry?.[field];
    if (!value) continue;
    const parsed = new Date(value).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
};
