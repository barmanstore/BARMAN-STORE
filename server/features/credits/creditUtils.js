const createCreditUtils = (deps = {}) => {
  const {
    dbGetAsync,
    dbAllAsync,
    dbRunAsync,
    dbTxAsync,
    normalizeTransactionDate,
    toTimestampMs,
  } = deps;

  const normalizeCreditType = (type) => {
    const raw = String(type || '').trim().toLowerCase();
    return raw === 'payment' ? 'payment' : 'given';
  };
  const normalizeCreditIssueStatus = (value, { fallback = 'open' } = {}) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return fallback;
    if (normalized === 'reviewed') return 'in_review';
    if (normalized === 'resolved') return 'corrected';
    if (normalized === 'open' || normalized === 'in_review' || normalized === 'corrected' || normalized === 'rejected') {
      return normalized;
    }
    return fallback;
  };

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

  const getLatestCreditEntryAsync = (userId) => dbGetAsync(
    `SELECT *
     FROM credit_history
     WHERE user_id = ?
     ORDER BY COALESCE(transaction_ts, transaction_date::timestamp, created_at) DESC, created_at DESC, id DESC
     LIMIT 1`,
    [userId]
  );

  const recalculateCreditBalancesForUser = async (userId) => dbTxAsync(async () => {
    const rows = await dbAllAsync(
      `SELECT id, type, amount
       FROM credit_history
       WHERE user_id = ?
       ORDER BY COALESCE(transaction_ts, transaction_date::timestamp, created_at) ASC, created_at ASC, id ASC`,
      [userId]
    );

    let runningBalance = 0;
    for (const row of rows) {
      const normalizedType = normalizeCreditType(row.type);
      const amount = Math.abs(Number(row.amount || 0));
      runningBalance = normalizedType === 'payment'
        ? (runningBalance - amount)
        : (runningBalance + amount);
      await dbRunAsync(`UPDATE credit_history SET balance = ? WHERE id = ?`, [runningBalance, row.id]);
    }

    return runningBalance;
  });

  const PAYMENT_BADGE_SETTINGS = {
    recentDays: 7,
    silverWindowDays: 60,
    silverMinimumPayments: 2,
    bronzeWindowDays: 90,
    streakMinimumMonths: 6,
    maxStreakMonths: 12,
  };
  const PAYMENT_DAY_MS = 24 * 60 * 60 * 1000;

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

  const getUtcMonthKey = (timestampMs) => {
    const date = new Date(timestampMs);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };

  const formatPaymentBadgeDate = (timestampMs) => {
    if (!Number.isFinite(timestampMs) || timestampMs <= 0) return '';
    return new Date(timestampMs).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const buildPaymentActivityBadges = (payments, { balance = 0, nowMs = Date.now() } = {}) => {
    const paymentRows = Array.isArray(payments) ? payments : [];
    const timeline = paymentRows
      .map((entry) => {
        const timestampMs = resolveCreditEntryTimestampMs(entry);
        if (!Number.isFinite(timestampMs) || timestampMs <= 0) return null;
        return {
          timestampMs,
          amount: Math.abs(Number(entry?.amount || 0)),
        };
      })
      .filter(Boolean);

    const totalPayments = timeline.length;
    const totalPaidAmount = timeline.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
    const lastPaymentTs = timeline.reduce((latest, entry) => (
      entry.timestampMs > latest ? entry.timestampMs : latest
    ), 0);
    const lastPaymentLabel = formatPaymentBadgeDate(lastPaymentTs);
    const lastPaymentAgeDays = lastPaymentTs ? Math.floor((nowMs - lastPaymentTs) / PAYMENT_DAY_MS) : null;

    const paymentsLast30 = timeline.filter((entry) => nowMs - entry.timestampMs <= 30 * PAYMENT_DAY_MS).length;
    const paymentsLast60 = timeline.filter((entry) => nowMs - entry.timestampMs <= PAYMENT_BADGE_SETTINGS.silverWindowDays * PAYMENT_DAY_MS).length;
    const paymentsLast90 = timeline.filter((entry) => nowMs - entry.timestampMs <= PAYMENT_BADGE_SETTINGS.bronzeWindowDays * PAYMENT_DAY_MS).length;

    const monthKeys = new Set(timeline.map((entry) => getUtcMonthKey(entry.timestampMs)).filter(Boolean));
    let streakMonths = 0;
    if (monthKeys.size > 0) {
      const cursor = new Date(nowMs);
      for (let i = 0; i < PAYMENT_BADGE_SETTINGS.maxStreakMonths; i += 1) {
        const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
        if (!monthKeys.has(key)) break;
        streakMonths += 1;
        cursor.setUTCMonth(cursor.getUTCMonth() - 1);
      }
    }

    const badges = [];
    if (Number(balance || 0) <= 0 && Number.isFinite(lastPaymentAgeDays) && lastPaymentAgeDays <= PAYMENT_BADGE_SETTINGS.recentDays) {
      badges.push({
        id: 'gold_score',
        label: 'Gold Score',
        tone: 'gold',
        description: `Balance cleared and paid within ${PAYMENT_BADGE_SETTINGS.recentDays} days.`,
      });
    }
    if (paymentsLast60 >= PAYMENT_BADGE_SETTINGS.silverMinimumPayments) {
      badges.push({
        id: 'silver_score',
        label: 'Silver Score',
        tone: 'silver',
        description: `${paymentsLast60} payments in ${PAYMENT_BADGE_SETTINGS.silverWindowDays} days.`,
      });
    }
    if (paymentsLast90 >= 1) {
      badges.push({
        id: 'bronze_score',
        label: 'Bronze Score',
        tone: 'bronze',
        description: `At least 1 payment in ${PAYMENT_BADGE_SETTINGS.bronzeWindowDays} days.`,
      });
    }
    if (streakMonths >= PAYMENT_BADGE_SETTINGS.streakMinimumMonths) {
      badges.push({
        id: 'streak_star',
        label: `Streak Star`,
        tone: 'streak',
        description: `Paid every month for ${streakMonths} months.`,
      });
    }

    const summaryParts = [];
    if (lastPaymentLabel) summaryParts.push(`Last paid ${lastPaymentLabel}`);
    if (paymentsLast60 > 0) summaryParts.push(`${paymentsLast60} in 60d`);
    if (streakMonths >= 2) summaryParts.push(`Streak ${streakMonths}m`);

    return {
      badges,
      summary: {
        total_payments: totalPayments,
        total_paid_amount: totalPaidAmount,
        balance: Number(balance || 0),
        last_payment_at: lastPaymentTs ? new Date(lastPaymentTs).toISOString() : null,
        last_payment_label: lastPaymentLabel || null,
        last_payment_days: Number.isFinite(lastPaymentAgeDays) ? lastPaymentAgeDays : null,
        payments_30d: paymentsLast30,
        payments_60d: paymentsLast60,
        payments_90d: paymentsLast90,
        streak_months: streakMonths,
        summary_line: summaryParts.join(' · '),
      },
    };
  };

  return {
    normalizeCreditType,
    normalizeCreditIssueStatus,
    buildCreditTransactionTimestamp,
    getLatestCreditEntryAsync,
    recalculateCreditBalancesForUser,
    resolveCreditEntryTimestampMs,
    buildPaymentActivityBadges,
  };
};

module.exports = { createCreditUtils };
