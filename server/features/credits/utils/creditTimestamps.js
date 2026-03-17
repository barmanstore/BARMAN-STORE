const createCreditTimestampUtils = ({ normalizeTransactionDate, toTimestampMs } = {}) => {
  const buildCreditTransactionTimestamp = (transactionDate, referenceDate = null) => {
    const raw = String(transactionDate || '').trim();
    if (raw) {
      if (/^\d{4}-\d{2}-\d{2}[t\s]\d{2}:\d{2}/i.test(raw)) {
        const parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
      }
    }

    const normalizedDate = normalizeTransactionDate(raw);
    const base = referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
      ? referenceDate
      : new Date();
    if (normalizedDate) {
      const [year, month, day] = normalizedDate.split('-').map((v) => Number(v));
      const ts = new Date(Date.UTC(
        year,
        month - 1,
        day,
        base.getUTCHours(),
        base.getUTCMinutes(),
        base.getUTCSeconds(),
        base.getUTCMilliseconds()
      ));
      if (!Number.isNaN(ts.getTime())) return ts.toISOString();
    }
    return base.toISOString();
  };

  const resolveCreditEntryTimestampMs = (entry) => {
    const tsMs = toTimestampMs(entry?.transaction_ts || entry?.transactionTs);
    if (tsMs) return tsMs;
    const normalizedDate = normalizeTransactionDate(entry?.transaction_date || entry?.transactionDate || '');
    if (normalizedDate) {
      const [year, month, day] = normalizedDate.split('-').map((v) => Number(v));
      const createdMs = toTimestampMs(entry?.created_at);
      const created = Number.isFinite(createdMs) ? new Date(createdMs) : new Date();
      const ts = new Date(Date.UTC(
        year,
        month - 1,
        day,
        created.getUTCHours(),
        created.getUTCMinutes(),
        created.getUTCSeconds(),
        created.getUTCMilliseconds()
      ));
      if (!Number.isNaN(ts.getTime())) return ts.getTime();
    }
    const fallback = toTimestampMs(entry?.created_at);
    return fallback || null;
  };

  return {
    buildCreditTransactionTimestamp,
    resolveCreditEntryTimestampMs,
  };
};

module.exports = { createCreditTimestampUtils };
