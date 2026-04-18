const BILL_CREDIT_PREFIX = 'bill credit |';

const toTrimmedLower = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();

export const getCreditEntrySourceType = (entry = {}) => {
  const explicit = toTrimmedLower(entry?.source_type);
  if (explicit) return explicit;

  const description = toTrimmedLower(entry?.description);
  if (description.startsWith(BILL_CREDIT_PREFIX) && String(entry?.reference || '').trim()) {
    return 'bill';
  }
  if (Number(entry?.reversed_entry_id || 0) > 0) {
    return 'reversal';
  }
  return '';
};

export const getCreditEntryDelta = (entry = {}) => {
  const amount = Math.abs(Number(entry?.amount || 0));
  return toTrimmedLower(entry?.type) === 'payment' ? -amount : amount;
};

export const getCreditEntryTypeLabel = (entryOrType = {}) => {
  if (entryOrType && typeof entryOrType === 'object') {
    const sourceType = getCreditEntrySourceType(entryOrType);
    const entryType = toTrimmedLower(entryOrType?.type);

    if (sourceType === 'bill') return 'Bill';
    if (sourceType === 'reversal') return 'Reversal';
    if (sourceType === 'issue_correction') return 'Correction';
    if (entryType === 'payment') return 'Payment';
    if (entryType === 'given') return 'Manual Sale';
    return 'Entry';
  }

  const entryType = toTrimmedLower(entryOrType);
  if (entryType === 'payment') return 'Payment';
  if (entryType === 'given') return 'Manual Sale';
  return String(entryOrType || 'Entry').trim() || 'Entry';
};

export const getCreditEntrySourceLabel = (entry = {}) => {
  const linkedBillNumber = String(entry?.linked_bill_number || entry?.bill_number || '').trim();
  if (linkedBillNumber) return linkedBillNumber;

  const resolvedSourceLabel = String(
    entry?.resolved_source_label || entry?.source_label || ''
  ).trim();
  if (resolvedSourceLabel) return resolvedSourceLabel;

  const reference = String(entry?.reference || '').trim();
  if (reference) return reference;

  const sourceType = getCreditEntrySourceType(entry);
  if (sourceType === 'reversal') {
    const reversedEntryId = Number(entry?.reversed_entry_id || entry?.source_id || 0);
    if (reversedEntryId > 0) return `REV-${reversedEntryId}`;
  }

  return '-';
};

export const getCreditEntryDescription = (entry = {}) => {
  const description = String(entry?.description || '').trim();
  const sourceType = getCreditEntrySourceType(entry);
  const sourceLabel = getCreditEntrySourceLabel(entry);

  if (sourceType === 'bill' && sourceLabel !== '-') {
    return `Created from bill ${sourceLabel}`;
  }

  if (sourceType === 'reversal') {
    const reversedEntryId = Number(entry?.reversed_entry_id || entry?.source_id || 0);
    if (reversedEntryId > 0) return `Reversal of entry #${reversedEntryId}`;
    return description || 'Reversal entry';
  }

  return description || '-';
};

export const getCreditPreviousBalance = (entry = {}) => {
  const currentBalance = Number(entry?.balance || 0);
  return currentBalance - getCreditEntryDelta(entry);
};

export const getCreditBalanceMeta = (rawBalance) => {
  const balance = Number(rawBalance || 0);
  if (balance > 0) {
    return { label: 'Due', tone: 'due' };
  }
  if (balance < 0) {
    return { label: 'Advance', tone: 'advance' };
  }
  return { label: 'Settled', tone: 'settled' };
};

export const canReverseCreditEntry = (entry = {}) => {
  const sourceType = getCreditEntrySourceType(entry);
  if (sourceType === 'reversal') return false;
  if (Number(entry?.has_reversal || 0) > 0) return false;
  return Boolean(Number(entry?.id || 0));
};

export const isBillLinkedCreditEntry = (entry = {}) => {
  if (Number(entry?.linked_bill_id || 0) > 0) return true;
  return getCreditEntrySourceType(entry) === 'bill' && getCreditEntrySourceLabel(entry) !== '-';
};
