const SCORE_BANDS = require('../../../../shared/creditScoreBands.json');

const CREDIT_BADGE_SETTINGS = {
  paymentWindow30Days: 30,
  paymentWindow60Days: 60,
  paymentWindow90Days: 90,
  defaultGraceDays: 60,
  minEstablishedPeriods: 2,
};

const PAYMENT_DAY_MS = 24 * 60 * 60 * 1000;
const EPSILON = 0.000001;

const NEW_CUSTOMER_STATUS = Object.freeze({
  key: 'new',
  label: 'New',
  tone: 'new',
  description: 'Not enough payment history yet to classify this customer reliably.',
});

const DEFAULTER_TAG = Object.freeze({
  key: 'defaulter',
  label: 'Defaulter',
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundMoney = (value) => {
  const numeric = toFiniteNumber(value, 0);
  return Math.round(numeric * 100) / 100;
};

const roundRatio = (value) => {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1000) / 1000;
};

const getUtcMonthKey = (timestampMs) => {
  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const getUtcDateKey = (timestampMs) => {
  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const formatPaymentBadgeDate = (timestampMs) => {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) return '';
  return new Date(timestampMs).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const toAgeDays = (endMs, startMs) => {
  if (!Number.isFinite(endMs) || !Number.isFinite(startMs) || endMs <= 0 || startMs <= 0) return 0;
  return Math.max(0, Math.floor((endMs - startMs) / PAYMENT_DAY_MS));
};

const getScoreBand = (score) => {
  const numericScore = clamp(Math.round(toFiniteNumber(score, 0)), 0, 100);
  return SCORE_BANDS.find((band) => numericScore >= band.min) || SCORE_BANDS[SCORE_BANDS.length - 1];
};

const getOutstandingTone = (days) => {
  const ageDays = Math.max(0, Math.round(toFiniteNumber(days, 0)));
  if (ageDays <= 7) return 'very-good';
  if (ageDays <= 30) return 'good';
  if (ageDays <= 60) return 'attention';
  return 'problem';
};

const dateKeyToUtcMs = (dateKey) => {
  const normalized = String(dateKey || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return 0;
  return Date.parse(`${normalized}T00:00:00.000Z`);
};

const addDaysToDateKey = (dateKey, days) => {
  const baseMs = dateKeyToUtcMs(dateKey);
  if (!baseMs) return '';
  return getUtcDateKey(baseMs + (Math.max(0, Math.floor(toFiniteNumber(days, 0))) * PAYMENT_DAY_MS));
};

const diffDateKeysInDays = (laterDateKey, earlierDateKey) => {
  const laterMs = dateKeyToUtcMs(laterDateKey);
  const earlierMs = dateKeyToUtcMs(earlierDateKey);
  if (!laterMs || !earlierMs) return 0;
  return Math.round((laterMs - earlierMs) / PAYMENT_DAY_MS);
};

const toIsoOrNull = (timestampMs) => {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) return null;
  return new Date(timestampMs).toISOString();
};

const getPaymentWeight = ({ delayDays = 0, status = 'pending' } = {}) => {
  if (status === 'missed') return 0;
  const normalizedDelay = Math.max(0, Math.round(toFiniteNumber(delayDays, 0)));
  if (normalizedDelay <= 0) return 1;
  if (normalizedDelay <= 7) return 0.8;
  if (normalizedDelay <= 30) return 0.5;
  if (normalizedDelay <= 60) return 0.25;
  return 0;
};

const createCreditBadgeUtils = ({ resolveCreditEntryTimestampMs } = {}) => {
  const buildCreditDisciplineProfile = (entries, {
    balance = 0,
    creditLimit = 0,
    nowMs = Date.now(),
    isActive = true,
    graceDays = CREDIT_BADGE_SETTINGS.defaultGraceDays,
  } = {}) => {
    const normalizedGraceDays = Math.max(0, Math.floor(toFiniteNumber(graceDays, CREDIT_BADGE_SETTINGS.defaultGraceDays)));
    const normalizedIsActive = Boolean(isActive);
    const nowDateKey = getUtcDateKey(nowMs);
    const nowDateMs = dateKeyToUtcMs(nowDateKey);

    const normalizedRows = (Array.isArray(entries) ? entries : [])
      .map((entry, index) => {
        const timestampMs = resolveCreditEntryTimestampMs(entry);
        const createdAtMs = Date.parse(String(entry?.created_at || '').trim() || 0);
        const amount = Math.abs(toFiniteNumber(entry?.amount, 0));
        const type = String(entry?.type || '').trim().toLowerCase();
        if (!Number.isFinite(timestampMs) || timestampMs <= 0) return null;
        if (amount <= 0) return null;
        if (type !== 'given' && type !== 'payment') return null;
        const rawDueDate = String(entry?.due_date || entry?.dueDate || '').trim();
        const dueDateKey = /^\d{4}-\d{2}-\d{2}$/.test(rawDueDate)
          ? rawDueDate
          : getUtcDateKey(timestampMs);
        const rawTransactionDate = String(entry?.transaction_date || '').trim();
        const transactionDateKey = /^\d{4}-\d{2}-\d{2}$/.test(rawTransactionDate)
          ? rawTransactionDate
          : getUtcDateKey(timestampMs);
        return {
          id: Number(entry?.id || 0) || null,
          index,
          type,
          amount,
          timestampMs,
          createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : 0,
          createdAt: entry?.created_at || null,
          transactionDateKey,
          dueDateKey,
          sourceType: String(entry?.source_type || '').trim().toLowerCase(),
          sourceId: String(entry?.source_id || '').trim(),
          sourceLabel: String(entry?.source_label || entry?.reference || '').trim(),
          reference: String(entry?.reference || '').trim(),
        };
      })
      .filter(Boolean)
      .sort((a, b) => (
        (a.timestampMs - b.timestampMs)
        || (a.createdAtMs - b.createdAtMs)
        || ((a.id || 0) - (b.id || 0))
        || (a.index - b.index)
      ));

    const paymentTimeline = [];
    const periods = [];

    for (const row of normalizedRows) {
      if (row.type === 'payment') {
        paymentTimeline.push({
          id: row.id,
          amount: row.amount,
          timestampMs: row.timestampMs,
          transactionDateKey: row.transactionDateKey,
        });
        continue;
      }

      periods.push({
        period_key: row.id ? `credit:${row.id}` : `credit:${row.index}:${row.timestampMs}`,
        source_credit_entry_id: row.id,
        period_start: toIsoOrNull(row.timestampMs),
        period_start_ms: row.timestampMs,
        due_date: row.dueDateKey || row.transactionDateKey || getUtcDateKey(row.timestampMs),
        grace_days: normalizedGraceDays,
        expected_amount: roundMoney(row.amount),
        allocated_amount: 0,
        remaining_amount: roundMoney(row.amount),
        is_fully_settled: false,
        settled_at: null,
        source_type: row.sourceType || null,
        source_id: row.sourceId || (row.id ? String(row.id) : null),
        source_label: row.sourceLabel || row.reference || null,
      });
    }

    let unappliedPaymentAmount = 0;
    for (const payment of paymentTimeline) {
      let paymentRemaining = roundMoney(payment.amount);
      for (const period of periods) {
        if (paymentRemaining <= EPSILON) break;
        if (period.remaining_amount <= EPSILON) continue;
        const appliedAmount = Math.min(paymentRemaining, period.remaining_amount);
        period.allocated_amount = roundMoney(period.allocated_amount + appliedAmount);
        period.remaining_amount = roundMoney(period.remaining_amount - appliedAmount);
        if (period.remaining_amount <= EPSILON) {
          period.remaining_amount = 0;
          period.is_fully_settled = true;
          period.settled_at = toIsoOrNull(payment.timestampMs);
        }
        paymentRemaining = roundMoney(paymentRemaining - appliedAmount);
      }
      if (paymentRemaining > EPSILON) {
        unappliedPaymentAmount = roundMoney(unappliedPaymentAmount + paymentRemaining);
      }
    }

    const derivedPeriods = periods.map((period) => {
      const dueDateMs = dateKeyToUtcMs(period.due_date);
      const graceCutoffDateKey = addDaysToDateKey(period.due_date, period.grace_days);
      const graceCutoffMs = dateKeyToUtcMs(graceCutoffDateKey);
      const settledDateKey = period.settled_at
        ? getUtcDateKey(Date.parse(period.settled_at))
        : '';
      const rawDelayDays = period.is_fully_settled
        ? diffDateKeysInDays(settledDateKey, period.due_date)
        : diffDateKeysInDays(nowDateKey, period.due_date);
      const delayDays = Math.max(0, rawDelayDays);
      const ageDays = toAgeDays(nowMs, period.period_start_ms);
      let status = 'paid';
      if (!period.is_fully_settled) {
        if (nowDateMs <= dueDateMs) {
          status = 'pending';
        } else if (nowDateMs <= graceCutoffMs) {
          status = 'late';
        } else {
          status = 'missed';
        }
      }
      return {
        ...period,
        status,
        delay_days: delayDays,
        age_days: ageDays,
      };
    });

    const openPeriods = derivedPeriods.filter((period) => period.remaining_amount > EPSILON);
    const totalPeriods = derivedPeriods.length;
    const onTimePeriods = derivedPeriods.filter((period) => period.is_fully_settled && period.delay_days <= 0).length;
    const within7Days = derivedPeriods.filter((period) => period.is_fully_settled && period.delay_days > 0 && period.delay_days <= 7).length;
    const within30Days = derivedPeriods.filter((period) => period.is_fully_settled && period.delay_days > 7 && period.delay_days <= 30).length;
    const within60Days = derivedPeriods.filter((period) => period.is_fully_settled && period.delay_days > 30 && period.delay_days <= 60).length;
    const latePeriods = derivedPeriods.filter((period) => period.is_fully_settled && period.delay_days > 0).length;
    const missedPeriods = derivedPeriods.filter((period) => period.status === 'missed').length;
    const totalDelayDays = derivedPeriods.reduce((sum, period) => sum + Math.max(0, toFiniteNumber(period.delay_days, 0)), 0);
    const averageDelayDays = totalPeriods > 0 ? totalDelayDays / totalPeriods : 0;
    const settledPeriods = derivedPeriods.filter((period) => period.is_fully_settled);
    const averageSettlementDays = settledPeriods.length > 0
      ? settledPeriods.reduce((sum, period) => sum + Math.max(0, toFiniteNumber(period.delay_days, 0)), 0) / settledPeriods.length
      : null;
    const outstandingAmount = roundMoney(openPeriods.reduce((sum, period) => sum + toFiniteNumber(period.remaining_amount, 0), 0));
    const oldestOpenDays = openPeriods.reduce((maxAge, period) => (
      period.age_days > maxAge ? period.age_days : maxAge
    ), 0);
    const oldestOverdueDays = openPeriods.reduce((maxAge, period) => {
      if (period.status !== 'late' && period.status !== 'missed') return maxAge;
      return period.delay_days > maxAge ? period.delay_days : maxAge;
    }, 0);
    const aging0To30 = roundMoney(openPeriods.reduce((sum, period) => sum + (period.age_days <= 30 ? toFiniteNumber(period.remaining_amount, 0) : 0), 0));
    const aging31To60 = roundMoney(openPeriods.reduce((sum, period) => sum + (period.age_days > 30 && period.age_days <= 60 ? toFiniteNumber(period.remaining_amount, 0) : 0), 0));
    const aging61To90 = roundMoney(openPeriods.reduce((sum, period) => sum + (period.age_days > 60 && period.age_days <= 90 ? toFiniteNumber(period.remaining_amount, 0) : 0), 0));
    const agingOver90 = roundMoney(openPeriods.reduce((sum, period) => sum + (period.age_days > 90 ? toFiniteNumber(period.remaining_amount, 0) : 0), 0));
    const averageWeight = totalPeriods > 0
      ? derivedPeriods.reduce((sum, period) => sum + getPaymentWeight(period), 0) / totalPeriods
      : 0;

    const totalPayments = paymentTimeline.length;
    const totalPaidAmount = roundMoney(paymentTimeline.reduce((sum, entry) => sum + entry.amount, 0));
    const lastPaymentTs = paymentTimeline.reduce((latest, entry) => (
      entry.timestampMs > latest ? entry.timestampMs : latest
    ), 0);
    const lastPaymentLabel = formatPaymentBadgeDate(lastPaymentTs);
    const lastPaymentAgeDays = lastPaymentTs ? toAgeDays(nowMs, lastPaymentTs) : null;
    const paymentsLast30 = paymentTimeline.filter((entry) => nowMs - entry.timestampMs <= CREDIT_BADGE_SETTINGS.paymentWindow30Days * PAYMENT_DAY_MS).length;
    const paymentsLast60 = paymentTimeline.filter((entry) => nowMs - entry.timestampMs <= CREDIT_BADGE_SETTINGS.paymentWindow60Days * PAYMENT_DAY_MS).length;
    const paymentsLast90 = paymentTimeline.filter((entry) => nowMs - entry.timestampMs <= CREDIT_BADGE_SETTINGS.paymentWindow90Days * PAYMENT_DAY_MS).length;

    const monthKeys = new Set(paymentTimeline.map((entry) => getUtcMonthKey(entry.timestampMs)).filter(Boolean));
    let streakMonths = 0;
    if (monthKeys.size > 0) {
      const cursor = new Date(nowMs);
      for (let index = 0; index < 12; index += 1) {
        const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
        if (!monthKeys.has(key)) break;
        streakMonths += 1;
        cursor.setUTCMonth(cursor.getUTCMonth() - 1);
      }
    }

    const normalizedBalance = Math.max(0, toFiniteNumber(balance, outstandingAmount));
    const normalizedCreditLimit = Math.max(0, toFiniteNumber(creditLimit, 0));
    const creditLimitActive = normalizedCreditLimit > 0;
    const creditLimitUtilization = creditLimitActive
      ? roundRatio((normalizedBalance / normalizedCreditLimit) * 100)
      : null;
    const limitStatusKey = creditLimitActive
      ? (normalizedBalance > normalizedCreditLimit ? 'over_limit' : 'within_limit')
      : 'not_set';
    const limitStatusLabel = limitStatusKey === 'over_limit'
      ? 'Over Limit'
      : (limitStatusKey === 'within_limit' ? 'Within Limit' : 'Limit Not Set');

    const isNewCustomer = totalPeriods < CREDIT_BADGE_SETTINGS.minEstablishedPeriods;
    const customerTag = isNewCustomer ? 'insufficient_history' : null;
    const activePoints = normalizedIsActive ? 30 : 0;
    const disciplinePoints = averageWeight * 40;
    const missedPenalty = totalPeriods > 0 ? Math.min(30, (missedPeriods / totalPeriods) * 30) : 0;
    const delayPenalty = averageDelayDays <= 0
      ? 0
      : (averageDelayDays <= 7
        ? 5
        : (averageDelayDays <= 30
          ? 10
          : (averageDelayDays <= 60 ? 15 : 20)));

    let paymentScore = null;
    let rawScore70 = 0;
    if (isNewCustomer) {
      paymentScore = 50;
      rawScore70 = 35;
    } else if (totalPeriods > 0) {
      rawScore70 = clamp(activePoints + disciplinePoints - missedPenalty - delayPenalty, 0, 70);
      paymentScore = Math.round((rawScore70 / 70) * 100);
      if (missedPeriods >= 2) {
        paymentScore = Math.min(paymentScore, 19);
      } else if (missedPeriods === 1) {
        paymentScore = Math.min(paymentScore, 39);
      }
      if (!normalizedIsActive) {
        paymentScore = Math.min(paymentScore, 59);
      }
    }

    const band = paymentScore === null ? null : getScoreBand(paymentScore);
    const displayStatus = isNewCustomer ? NEW_CUSTOMER_STATUS : band;
    const isDefaulter = missedPeriods >= 2 || oldestOverdueDays > 60;
    const statusTag = isDefaulter ? DEFAULTER_TAG.label : null;

    const badges = [];
    if (isNewCustomer) {
      badges.push({
        id: 'payment_new_customer',
        label: NEW_CUSTOMER_STATUS.label,
        shortLabel: NEW_CUSTOMER_STATUS.label,
        tone: NEW_CUSTOMER_STATUS.tone,
        description: NEW_CUSTOMER_STATUS.description,
      });
    } else if (displayStatus && paymentScore !== null) {
      badges.push({
        id: 'payment_score',
        label: `Score ${paymentScore}/100`,
        shortLabel: String(paymentScore),
        tone: displayStatus.tone,
        description: `${displayStatus.label}. Payment score ${paymentScore}/100. ${displayStatus.description}`,
      });
    }
    if (displayStatus) {
      badges.push({
        id: 'payment_status',
        label: displayStatus.label,
        shortLabel: displayStatus.label,
        tone: displayStatus.tone,
        description: displayStatus.description,
      });
    }
    if (creditLimitActive) {
      badges.push({
        id: 'credit_limit_status',
        label: limitStatusLabel,
        shortLabel: limitStatusKey === 'over_limit' ? 'Over Limit' : 'Limit OK',
        tone: limitStatusKey === 'over_limit' ? 'problem' : 'stable',
        description: limitStatusKey === 'over_limit'
          ? `Current balance Rs ${normalizedBalance.toFixed(2)} is above the manual credit limit of Rs ${normalizedCreditLimit.toFixed(2)}.`
          : `Current balance Rs ${normalizedBalance.toFixed(2)} is within the manual credit limit of Rs ${normalizedCreditLimit.toFixed(2)}.`,
      });
    }
    if (missedPeriods > 0) {
      badges.push({
        id: 'missed_periods',
        label: `Missed ${missedPeriods}`,
        shortLabel: `Missed ${missedPeriods}`,
        tone: 'problem',
        description: `${missedPeriods} payment period${missedPeriods === 1 ? '' : 's'} are now beyond the grace threshold.`,
      });
    }
    if (isDefaulter) {
      badges.push({
        id: 'payment_status_tag',
        label: DEFAULTER_TAG.label,
        shortLabel: DEFAULTER_TAG.label,
        tone: 'problem',
        description: 'Chronic non-payment detected from repeated missed periods or severe overdue age.',
      });
    }
    if (outstandingAmount > EPSILON) {
      badges.push({
        id: 'oldest_due',
        label: `Oldest due ${oldestOpenDays}d`,
        shortLabel: `${Math.round(oldestOpenDays)}d Due`,
        tone: getOutstandingTone(oldestOpenDays),
        description: `Oldest unpaid credit period is ${Math.round(oldestOpenDays)} days old.`,
      });
    }

    const summaryParts = [];
    if (isNewCustomer) summaryParts.push(NEW_CUSTOMER_STATUS.label);
    if (!isNewCustomer && displayStatus?.label) summaryParts.push(displayStatus.label);
    if (statusTag) summaryParts.push(statusTag);
    if (missedPeriods > 0) summaryParts.push(`Missed ${missedPeriods}`);
    if (totalPeriods > 0) summaryParts.push(`Avg delay ${roundRatio(averageDelayDays)}d`);
    if (lastPaymentLabel) summaryParts.push(`Last paid ${lastPaymentLabel}`);
    if (outstandingAmount > EPSILON) summaryParts.push(`Due Rs ${normalizedBalance.toFixed(2)}`);
    if (creditLimitActive && limitStatusKey === 'over_limit') summaryParts.push('Over limit');

    return {
      periods: derivedPeriods,
      metrics: {
        is_active: normalizedIsActive,
        active_points: roundRatio(activePoints),
        discipline_points: roundRatio(disciplinePoints),
        missed_penalty: roundRatio(missedPenalty),
        delay_penalty: roundRatio(delayPenalty),
        average_weight: roundRatio(averageWeight),
        raw_score_70: roundRatio(rawScore70),
        customer_tag: customerTag,
        total_periods: totalPeriods,
        on_time_periods: onTimePeriods,
        within_7d_periods: within7Days,
        within_30d_periods: within30Days,
        within_60d_periods: within60Days,
        late_periods: latePeriods,
        missed_periods: missedPeriods,
        average_delay_days: roundRatio(averageDelayDays),
        oldest_overdue_days: Math.round(oldestOverdueDays),
        unapplied_payment_amount: roundMoney(unappliedPaymentAmount),
      },
      badges,
      summary: {
        payment_score: paymentScore,
        payment_status: displayStatus?.key || null,
        payment_status_label: displayStatus?.label || null,
        payment_status_tone: displayStatus?.tone || null,
        payment_status_description: displayStatus?.description || null,
        payment_status_tag: statusTag,
        is_defaulter: isDefaulter,
        customer_tag: customerTag,
        is_active: normalizedIsActive,
        active_points: roundRatio(activePoints),
        discipline_points: roundRatio(disciplinePoints),
        missed_penalty: roundRatio(missedPenalty),
        delay_penalty: roundRatio(delayPenalty),
        average_weight: roundRatio(averageWeight),
        raw_score_70: roundRatio(rawScore70),
        score_basis_days: totalPeriods > 0 ? roundRatio(averageDelayDays) : null,
        same_day_ratio: totalPeriods > 0 ? roundRatio(onTimePeriods / totalPeriods) : null,
        within_7d_ratio: totalPeriods > 0 ? roundRatio((onTimePeriods + within7Days) / totalPeriods) : null,
        within_30d_ratio: totalPeriods > 0 ? roundRatio((onTimePeriods + within7Days + within30Days) / totalPeriods) : null,
        within_60d_ratio: totalPeriods > 0 ? roundRatio((onTimePeriods + within7Days + within30Days + within60Days) / totalPeriods) : null,
        average_delay_days: totalPeriods > 0 ? roundRatio(averageDelayDays) : null,
        average_settlement_days: Number.isFinite(averageSettlementDays) ? roundRatio(averageSettlementDays) : null,
        current_balance: normalizedBalance,
        balance: normalizedBalance,
        outstanding_amount: outstandingAmount,
        oldest_open_days: outstandingAmount > EPSILON ? Math.round(oldestOpenDays) : 0,
        oldest_overdue_days: Math.round(oldestOverdueDays),
        open_entry_count: openPeriods.length,
        days_0_30: aging0To30,
        days_31_60: aging31To60,
        days_61_90: aging61To90,
        days_over_90: agingOver90,
        credit_limit: creditLimitActive ? normalizedCreditLimit : 0,
        credit_limit_active: creditLimitActive,
        credit_limit_utilization: creditLimitUtilization,
        limit_status: limitStatusKey,
        limit_status_label: limitStatusLabel,
        total_payments: totalPayments,
        total_paid_amount: totalPaidAmount,
        last_payment_at: lastPaymentTs ? new Date(lastPaymentTs).toISOString() : null,
        last_payment_label: lastPaymentLabel || null,
        last_payment_days: Number.isFinite(lastPaymentAgeDays) ? lastPaymentAgeDays : null,
        payments_30d: paymentsLast30,
        payments_60d: paymentsLast60,
        payments_90d: paymentsLast90,
        streak_months: streakMonths,
        total_periods: totalPeriods,
        on_time_periods: onTimePeriods,
        within_7d_periods: within7Days,
        within_30d_periods: within30Days,
        within_60d_periods: within60Days,
        late_periods: latePeriods,
        missed_periods: missedPeriods,
        grace_days: normalizedGraceDays,
        unapplied_payment_amount: roundMoney(unappliedPaymentAmount),
        summary_line: summaryParts.join(' · '),
      },
    };
  };

  const buildPaymentActivityBadges = (entries, options = {}) => {
    const profile = buildCreditDisciplineProfile(entries, options);
    return {
      badges: Array.isArray(profile?.badges) ? profile.badges : [],
      summary: profile?.summary || null,
      metrics: profile?.metrics || null,
    };
  };

  return {
    buildCreditDisciplineProfile,
    buildPaymentActivityBadges,
  };
};

module.exports = {
  CREDIT_BADGE_SETTINGS,
  SCORE_BANDS,
  createCreditBadgeUtils,
};
