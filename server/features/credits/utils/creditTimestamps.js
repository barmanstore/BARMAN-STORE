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
    const base =
      referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
        ? referenceDate
        : new Date();
    if (normalizedDate) {
      const [year, month, day] = normalizedDate.split('-').map((v) => Number(v));
      const ts = new Date(
        Date.UTC(
          year,
          month - 1,
          day,
          base.getUTCHours(),
          base.getUTCMinutes(),
          base.getUTCSeconds(),
          base.getUTCMilliseconds()
        )
      );
      if (!Number.isNaN(ts.getTime())) return ts.toISOString();
    }
    return base.toISOString();
  };

  const resolveCreditEntryTimestampMs = (entry) => {
    const tsMs = toTimestampMs(entry?.transaction_ts || entry?.transactionTs);
    return tsMs || null;
  };

  return {
    buildCreditTransactionTimestamp,
    resolveCreditEntryTimestampMs,
  };
};

module.exports = { createCreditTimestampUtils };
