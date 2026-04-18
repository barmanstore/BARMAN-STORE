const {
  SCORE_BANDS,
  DEFAULT_GRACE_DAYS,
  DEFAULT_NEW_STATUS_DAYS,
  NEW_CUSTOMER_STATUS,
  getBandIndex,
  getBandScoreForElapsedDays,
  getCycleBandForElapsedDays,
  getFirstEstablishedBand,
  getNextBetterBand,
} = require('./creditStatusPolicy');

const CREDIT_BADGE_SETTINGS = {
  paymentWindow30Days: 30,
  paymentWindow60Days: 60,
  paymentWindow90Days: 90,
  defaultGraceDays: DEFAULT_GRACE_DAYS,
  minEstablishedPeriods: 1,
};

const PAYMENT_DAY_MS = 24 * 60 * 60 * 1000;
const EPSILON = 0.000001;
const LEGACY_GRACE_DAYS = 60;

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
  return getUtcDateKey(baseMs + Math.max(0, Math.floor(toFiniteNumber(days, 0))) * PAYMENT_DAY_MS);
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

const normalizeGraceDays = (value) => {
  const parsed = Math.max(0, Math.floor(toFiniteNumber(value, DEFAULT_GRACE_DAYS)));
  if (parsed === LEGACY_GRACE_DAYS) return DEFAULT_GRACE_DAYS;
  return parsed || DEFAULT_GRACE_DAYS;
};

const buildStatusHelper = ({
  isNewCustomer,
  displayStatus,
  nextBetterBand,
  activeCycleStartDateKey,
  activeCycleDueDateKey,
  graceDays,
  nowDateKey,
  outstandingAmount,
} = {}) => {
  if (isNewCustomer) {
    return {
      mode: 'unlock',
      text: `Complete your first ${DEFAULT_NEW_STATUS_DAYS}-day cycle to unlock your payment status.`,
    };
  }

  if (!displayStatus) {
    return {
      mode: 'neutral',
      text: 'No payment status available yet.',
    };
  }

  if (
    !Number.isFinite(outstandingAmount) ||
    outstandingAmount <= EPSILON ||
    !activeCycleDueDateKey
  ) {
    return {
      mode: 'clear',
      text: 'No unpaid due right now. Keep clearing entries on time.',
    };
  }

  const dueDateKey = String(activeCycleDueDateKey || '').trim();
  const dueDateLabel = formatPaymentBadgeDate(dateKeyToUtcMs(dueDateKey));
  const graceEndDateKey = addDaysToDateKey(dueDateKey, graceDays);
  const graceEndLabel = formatPaymentBadgeDate(dateKeyToUtcMs(graceEndDateKey));
  const cycleStartLabel = formatPaymentBadgeDate(dateKeyToUtcMs(activeCycleStartDateKey));

  if (graceEndDateKey && nowDateKey > graceEndDateKey) {
    return {
      mode: 'missed',
      text: `This cycle started on ${cycleStartLabel || dueDateLabel}. Grace ended on ${graceEndLabel || dueDateLabel}; pay now to avoid another downgrade.`,
    };
  }

  if (dueDateKey && nowDateKey > dueDateKey) {
    return {
      mode: 'overdue',
      text: `Current due date passed. Pay by ${graceEndLabel || dueDateLabel} to avoid another downgrade.`,
    };
  }

  if (
    String(displayStatus.key || '')
      .trim()
      .toLowerCase() === 'excellent'
  ) {
    return {
      mode: 'maintain',
      text: `Pay by ${dueDateLabel} to keep Excellent.`,
    };
  }

  return {
    mode: 'improve',
    text: `Current cycle is ${displayStatus.label}. Pay by ${dueDateLabel} to avoid another downgrade and work back toward ${nextBetterBand?.label || 'a better status'}.`,
  };
};

const buildCycleState = (startDateKey, referenceDateKey, graceDays = DEFAULT_GRACE_DAYS) => {
  const normalizedStartDateKey = String(startDateKey || '').trim();
  const normalizedReferenceDateKey = String(referenceDateKey || '').trim();
  if (!normalizedStartDateKey || !normalizedReferenceDateKey) {
    return {
      band: null,
      elapsedDays: 0,
      dueDateKey: '',
      graceEndDateKey: '',
      overdueDays: 0,
      earlyDays: 0,
      isPastDue: false,
      isAfterGrace: false,
      score: null,
    };
  }

  const elapsedDays = Math.max(
    0,
    diffDateKeysInDays(normalizedReferenceDateKey, normalizedStartDateKey)
  );
  const band = getCycleBandForElapsedDays(elapsedDays, { graceDays }) || getFirstEstablishedBand();
  const dueDateKey = band
    ? addDaysToDateKey(normalizedStartDateKey, Number(band.target_days || 0))
    : '';
  const graceEndDateKey = dueDateKey ? addDaysToDateKey(dueDateKey, graceDays) : '';
  const overdueDays = dueDateKey
    ? Math.max(0, diffDateKeysInDays(normalizedReferenceDateKey, dueDateKey))
    : 0;
  const earlyDays = dueDateKey
    ? Math.max(0, diffDateKeysInDays(dueDateKey, normalizedReferenceDateKey))
    : 0;
  const isPastDue = Boolean(dueDateKey) && normalizedReferenceDateKey > dueDateKey;
  const isAfterGrace = Boolean(graceEndDateKey) && normalizedReferenceDateKey > graceEndDateKey;
  const score = band ? getBandScoreForElapsedDays(band.key, elapsedDays, { graceDays }) : null;

  return {
    band,
    elapsedDays,
    dueDateKey,
    graceEndDateKey,
    overdueDays,
    earlyDays,
    isPastDue,
    isAfterGrace,
    score,
  };
};

const classifySettledCycle = ({ earlyDays = 0, overdueDays = 0, isAfterGrace = false } = {}) => {
  if (isAfterGrace) {
    return {
      bucket: 'late_after_grace',
      delta: -15,
      label: 'Paid after grace period',
    };
  }

  if (earlyDays >= 7) {
    return {
      bucket: 'early_7_plus',
      delta: 5,
      label: 'Paid 7+ days early',
    };
  }

  if (earlyDays >= 3) {
    return {
      bucket: 'early_3_to_6',
      delta: 3,
      label: 'Paid 3-6 days early',
    };
  }

  if (earlyDays >= 1) {
    return {
      bucket: 'early_1_to_2',
      delta: 1,
      label: 'Paid 1-2 days early',
    };
  }

  if (overdueDays > 0) {
    return {
      bucket: 'late_within_grace',
      delta: -3,
      label: 'Paid after due date',
    };
  }

  return {
    bucket: 'on_due_date',
    delta: 0,
    label: 'Paid on due date',
  };
};

const createCreditBadgeUtils = ({ resolveCreditEntryTimestampMs } = {}) => {
  const buildCreditDisciplineProfile = (
    entries,
    {
      balance = 0,
      creditLimit = 0,
      nowMs = Date.now(),
      isActive = true,
      graceDays = CREDIT_BADGE_SETTINGS.defaultGraceDays,
    } = {}
  ) => {
    const normalizedGraceDays = normalizeGraceDays(graceDays);
    const normalizedIsActive = Boolean(isActive);
    const nowDateKey = getUtcDateKey(nowMs);
    const nowDateMs = dateKeyToUtcMs(nowDateKey);

    const normalizedRows = (Array.isArray(entries) ? entries : [])
      .map((entry, index) => {
        const timestampMs = resolveCreditEntryTimestampMs(entry);
        const createdAtMs = Date.parse(String(entry?.created_at || '').trim() || 0);
        const amount = Math.abs(toFiniteNumber(entry?.amount, 0));
        const type = String(entry?.type || '')
          .trim()
          .toLowerCase();
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
          sourceType: String(entry?.source_type || '')
            .trim()
            .toLowerCase(),
          sourceId: String(entry?.source_id || '').trim(),
          sourceLabel: String(entry?.source_label || entry?.reference || '').trim(),
          reference: String(entry?.reference || '').trim(),
        };
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          a.timestampMs - b.timestampMs ||
          a.createdAtMs - b.createdAtMs ||
          (a.id || 0) - (b.id || 0) ||
          a.index - b.index
      );

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
        period_start_date_key: row.transactionDateKey || getUtcDateKey(row.timestampMs),
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

    const scoredPeriods = periods.map((period) => {
      const settledAtMs = period.settled_at ? Date.parse(period.settled_at) : 0;
      const settledDateKey = settledAtMs ? getUtcDateKey(settledAtMs) : '';
      const referenceDateKey = period.is_fully_settled ? settledDateKey : nowDateKey;
      const cycleState = buildCycleState(
        period.period_start_date_key,
        referenceDateKey,
        normalizedGraceDays
      );
      const ageDays = toAgeDays(nowMs, period.period_start_ms);

      let status = 'paid';
      let scoreBucket = 'open';
      let scoreDelta = 0;
      let scoreBucketLabel = period.is_fully_settled ? 'Paid' : 'Open';
      let judged = false;

      if (period.is_fully_settled) {
        const settledCycle = classifySettledCycle({
          earlyDays: cycleState.earlyDays,
          overdueDays: cycleState.overdueDays,
          isAfterGrace: cycleState.isAfterGrace,
        });
        status = 'paid';
        scoreBucket = settledCycle.bucket;
        scoreDelta = settledCycle.delta;
        scoreBucketLabel = settledCycle.label;
        judged = true;
      } else if (cycleState.isAfterGrace) {
        status = 'missed';
        scoreBucket = 'missed';
        scoreDelta = -15;
        scoreBucketLabel = 'Missed beyond grace';
        judged = true;
      } else if (cycleState.isPastDue) {
        status = 'late';
        scoreBucket = 'late';
        scoreBucketLabel = 'Past due';
      } else {
        status = 'pending';
        scoreBucket = 'open';
        scoreBucketLabel = 'Open';
      }

      return {
        ...period,
        settled_at_ms: settledAtMs || null,
        settled_date_key: settledDateKey || null,
        status,
        delay_days: cycleState.overdueDays,
        early_days: period.is_fully_settled ? cycleState.earlyDays : 0,
        age_days: ageDays,
        elapsed_days: cycleState.elapsedDays,
        grace_end_date: cycleState.graceEndDateKey,
        cycle_due_date: cycleState.dueDateKey,
        cycle_band: cycleState.band || null,
        cycle_band_key: cycleState.band?.key || null,
        cycle_band_label: cycleState.band?.label || null,
        cycle_band_tone: cycleState.band?.tone || null,
        cycle_score: cycleState.score,
        score_bucket: scoreBucket,
        score_delta: scoreDelta,
        score_bucket_label: scoreBucketLabel,
        judged,
        score_before: null,
        score_after: judged ? cycleState.score : null,
      };
    });

    const openPeriods = scoredPeriods.filter((period) => period.remaining_amount > EPSILON);
    const settledPeriods = scoredPeriods.filter((period) => period.is_fully_settled);
    const earliestOpenPeriod = openPeriods[0] || null;
    const lastSettledPeriod = settledPeriods.reduce((latest, period) => {
      if (!latest) return period;
      return Number(period.settled_at_ms || 0) > Number(latest.settled_at_ms || 0)
        ? period
        : latest;
    }, null);

    const firstEstablishedBand = getFirstEstablishedBand() || NEW_CUSTOMER_STATUS;
    const firstPeriodStartDateKey = String(scoredPeriods[0]?.period_start_date_key || '').trim();
    const firstCycleJudgementDateKey = firstPeriodStartDateKey
      ? addDaysToDateKey(
          addDaysToDateKey(
            firstPeriodStartDateKey,
            Number(firstEstablishedBand.target_days || DEFAULT_NEW_STATUS_DAYS)
          ),
          normalizedGraceDays
        )
      : '';

    const totalPeriods = scoredPeriods.length;
    const isNewCustomer =
      totalPeriods === 0 ||
      (!settledPeriods.length &&
        firstCycleJudgementDateKey &&
        nowDateKey <= firstCycleJudgementDateKey);

    let displayStatus = earliestOpenPeriod?.cycle_band || null;
    let paymentScore = earliestOpenPeriod?.cycle_score ?? null;
    let activeCycleStartDateKey = String(earliestOpenPeriod?.period_start_date_key || '').trim();
    let activeCycleDueDateKey = String(earliestOpenPeriod?.cycle_due_date || '').trim();

    if (!earliestOpenPeriod && lastSettledPeriod) {
      displayStatus = lastSettledPeriod.cycle_band || null;
      paymentScore = lastSettledPeriod.cycle_score ?? null;
      activeCycleStartDateKey = String(lastSettledPeriod.period_start_date_key || '').trim();
      activeCycleDueDateKey = '';
    }

    if (!displayStatus) {
      displayStatus = firstEstablishedBand || NEW_CUSTOMER_STATUS;
    }

    const activeCycleMisses =
      !isNewCustomer && earliestOpenPeriod?.cycle_band?.key
        ? Math.max(0, getBandIndex(earliestOpenPeriod.cycle_band.key))
        : 0;
    const judgedPeriods =
      settledPeriods.length + openPeriods.filter((period) => period.status === 'missed').length;
    const onTimePeriods = settledPeriods.filter((period) => period.delay_days <= 0).length;
    const within7Days = settledPeriods.filter(
      (period) => period.delay_days > 0 && period.delay_days <= 7
    ).length;
    const within30Days = settledPeriods.filter(
      (period) => period.delay_days > 7 && period.delay_days <= 30
    ).length;
    const within60Days = settledPeriods.filter(
      (period) => period.delay_days > 30 && period.delay_days <= 60
    ).length;
    const latePeriods =
      settledPeriods.filter((period) => period.delay_days > 0).length +
      (earliestOpenPeriod &&
      (earliestOpenPeriod.status === 'late' || earliestOpenPeriod.status === 'missed')
        ? 1
        : 0);
    const missedPeriods =
      settledPeriods.filter((period) => period.score_bucket === 'late_after_grace').length +
      activeCycleMisses;
    const totalDelayDays =
      settledPeriods.reduce(
        (sum, period) => sum + Math.max(0, toFiniteNumber(period.delay_days, 0)),
        0
      ) +
      openPeriods
        .filter((period) => period.status === 'missed')
        .reduce((sum, period) => sum + Math.max(0, toFiniteNumber(period.delay_days, 0)), 0);
    const averageDelayDays = judgedPeriods > 0 ? totalDelayDays / judgedPeriods : 0;
    const averageSettlementDays =
      settledPeriods.length > 0
        ? settledPeriods.reduce(
            (sum, period) => sum + Math.max(0, toFiniteNumber(period.elapsed_days, 0)),
            0
          ) / settledPeriods.length
        : null;
    const outstandingAmount = roundMoney(
      openPeriods.reduce((sum, period) => sum + toFiniteNumber(period.remaining_amount, 0), 0)
    );
    const oldestOpenDays = openPeriods.reduce(
      (maxAge, period) => (period.age_days > maxAge ? period.age_days : maxAge),
      0
    );
    const oldestOverdueDays =
      earliestOpenPeriod &&
      (earliestOpenPeriod.status === 'late' || earliestOpenPeriod.status === 'missed')
        ? Math.max(0, toFiniteNumber(earliestOpenPeriod.delay_days, 0))
        : 0;
    const aging0To30 = roundMoney(
      openPeriods.reduce(
        (sum, period) =>
          sum + (period.age_days <= 30 ? toFiniteNumber(period.remaining_amount, 0) : 0),
        0
      )
    );
    const aging31To60 = roundMoney(
      openPeriods.reduce(
        (sum, period) =>
          sum +
          (period.age_days > 30 && period.age_days <= 60
            ? toFiniteNumber(period.remaining_amount, 0)
            : 0),
        0
      )
    );
    const aging61To90 = roundMoney(
      openPeriods.reduce(
        (sum, period) =>
          sum +
          (period.age_days > 60 && period.age_days <= 90
            ? toFiniteNumber(period.remaining_amount, 0)
            : 0),
        0
      )
    );
    const agingOver90 = roundMoney(
      openPeriods.reduce(
        (sum, period) =>
          sum + (period.age_days > 90 ? toFiniteNumber(period.remaining_amount, 0) : 0),
        0
      )
    );

    const positivePoints = settledPeriods.reduce(
      (sum, period) => (period.score_delta > 0 ? sum + period.score_delta : sum),
      0
    );
    const latePenaltyPoints = settledPeriods.reduce(
      (sum, period) =>
        period.score_bucket === 'late_within_grace' ? sum + Math.abs(period.score_delta || 0) : sum,
      0
    );
    const missedPenaltyPoints =
      settledPeriods.reduce(
        (sum, period) =>
          period.score_bucket === 'late_after_grace'
            ? sum + Math.abs(period.score_delta || 0)
            : sum,
        0
      ) +
      activeCycleMisses * 3;
    const averageWeight =
      judgedPeriods > 0 ? (onTimePeriods + within7Days * 0.5) / judgedPeriods : 0;

    const totalPayments = paymentTimeline.length;
    const totalPaidAmount = roundMoney(
      paymentTimeline.reduce((sum, entry) => sum + entry.amount, 0)
    );
    const lastPaymentTs = paymentTimeline.reduce(
      (latest, entry) => (entry.timestampMs > latest ? entry.timestampMs : latest),
      0
    );
    const lastPaymentLabel = formatPaymentBadgeDate(lastPaymentTs);
    const lastPaymentAgeDays = lastPaymentTs ? toAgeDays(nowMs, lastPaymentTs) : null;
    const paymentsLast30 = paymentTimeline.filter(
      (entry) =>
        nowMs - entry.timestampMs <= CREDIT_BADGE_SETTINGS.paymentWindow30Days * PAYMENT_DAY_MS
    ).length;
    const paymentsLast60 = paymentTimeline.filter(
      (entry) =>
        nowMs - entry.timestampMs <= CREDIT_BADGE_SETTINGS.paymentWindow60Days * PAYMENT_DAY_MS
    ).length;
    const paymentsLast90 = paymentTimeline.filter(
      (entry) =>
        nowMs - entry.timestampMs <= CREDIT_BADGE_SETTINGS.paymentWindow90Days * PAYMENT_DAY_MS
    ).length;

    const monthKeys = new Set(
      paymentTimeline.map((entry) => getUtcMonthKey(entry.timestampMs)).filter(Boolean)
    );
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

    const currentBalance = toFiniteNumber(balance, outstandingAmount);
    const normalizedBalance = Math.max(0, currentBalance);
    const normalizedCreditLimit = Math.max(0, toFiniteNumber(creditLimit, 0));
    const creditLimitActive = normalizedCreditLimit > 0;
    const creditLimitUtilization = creditLimitActive
      ? roundRatio((normalizedBalance / normalizedCreditLimit) * 100)
      : null;
    const limitStatusKey = creditLimitActive
      ? normalizedBalance > normalizedCreditLimit
        ? 'over_limit'
        : 'within_limit'
      : 'not_set';
    const limitStatusLabel =
      limitStatusKey === 'over_limit'
        ? 'Over Limit'
        : limitStatusKey === 'within_limit'
          ? 'Within Limit'
          : 'Limit Not Set';

    const customerTag = isNewCustomer ? 'insufficient_history' : null;
    paymentScore =
      isNewCustomer || paymentScore === null || paymentScore === undefined
        ? null
        : clamp(Math.round(toFiniteNumber(paymentScore, 0)), 0, 100);
    displayStatus = isNewCustomer ? NEW_CUSTOMER_STATUS : displayStatus;
    const nextBetterBand = getNextBetterBand(displayStatus?.key || '');
    const helper = buildStatusHelper({
      isNewCustomer,
      displayStatus,
      nextBetterBand,
      activeCycleStartDateKey,
      activeCycleDueDateKey,
      graceDays: normalizedGraceDays,
      nowDateKey,
      outstandingAmount,
    });
    const isDefaulter =
      !isNewCustomer &&
      String(displayStatus?.key || '')
        .trim()
        .toLowerCase() === 'defaulter';

    const badges = [];
    if (displayStatus) {
      badges.push({
        id: 'payment_status',
        label: displayStatus.label,
        shortLabel: displayStatus.label,
        tone: displayStatus.tone,
        description: displayStatus.description,
      });
    }
    if (!isNewCustomer && paymentScore !== null) {
      badges.unshift({
        id: 'payment_score',
        label: `Score ${Math.round(paymentScore)}/100`,
        shortLabel: String(Math.round(paymentScore)),
        tone: displayStatus?.tone || 'neutral',
        description:
          `${displayStatus?.label || 'Payment status'}. Payment score ${Math.round(paymentScore)}/100. ${displayStatus?.description || ''}`.trim(),
      });
    }
    if (creditLimitActive) {
      badges.push({
        id: 'credit_limit_status',
        label: limitStatusLabel,
        shortLabel: limitStatusKey === 'over_limit' ? 'Over Limit' : 'Limit OK',
        tone: limitStatusKey === 'over_limit' ? 'problem' : 'stable',
        description:
          limitStatusKey === 'over_limit'
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
        description: `${missedPeriods} payment period${missedPeriods === 1 ? '' : 's'} fell beyond the grace threshold.`,
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
    if (displayStatus?.label) summaryParts.push(displayStatus.label);
    if (paymentScore !== null) summaryParts.push(`Score ${Math.round(paymentScore)}/100`);
    if (activeCycleDueDateKey)
      summaryParts.push(
        `Current due ${formatPaymentBadgeDate(dateKeyToUtcMs(activeCycleDueDateKey))}`
      );
    if (missedPeriods > 0) summaryParts.push(`Missed ${missedPeriods}`);
    if (lastPaymentLabel) summaryParts.push(`Last paid ${lastPaymentLabel}`);
    if (outstandingAmount > EPSILON) summaryParts.push(`Due Rs ${normalizedBalance.toFixed(2)}`);
    if (creditLimitActive && limitStatusKey === 'over_limit') summaryParts.push('Over limit');

    return {
      periods: scoredPeriods,
      metrics: {
        is_active: normalizedIsActive,
        active_points: normalizedIsActive ? 30 : 0,
        discipline_points: roundRatio(positivePoints),
        missed_penalty: roundRatio(missedPenaltyPoints),
        delay_penalty: roundRatio(latePenaltyPoints),
        average_weight: roundRatio(averageWeight),
        raw_score_70: paymentScore === null ? 0 : roundRatio((paymentScore / 100) * 70),
        customer_tag: customerTag,
        total_periods: totalPeriods,
        judged_periods: judgedPeriods,
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
        payment_score: paymentScore === null ? null : Math.round(paymentScore),
        payment_status: displayStatus?.key || null,
        payment_status_label: displayStatus?.label || null,
        payment_status_tone: displayStatus?.tone || null,
        payment_status_description: displayStatus?.description || null,
        payment_status_tag: null,
        is_defaulter: isDefaulter,
        customer_tag: customerTag,
        is_active: normalizedIsActive,
        active_points: normalizedIsActive ? 30 : 0,
        discipline_points: roundRatio(positivePoints),
        missed_penalty: roundRatio(missedPenaltyPoints),
        delay_penalty: roundRatio(latePenaltyPoints),
        average_weight: roundRatio(averageWeight),
        raw_score_70: paymentScore === null ? 0 : roundRatio((paymentScore / 100) * 70),
        score_basis_days: judgedPeriods > 0 ? roundRatio(averageDelayDays) : null,
        same_day_ratio: judgedPeriods > 0 ? roundRatio(onTimePeriods / judgedPeriods) : null,
        within_7d_ratio:
          judgedPeriods > 0 ? roundRatio((onTimePeriods + within7Days) / judgedPeriods) : null,
        within_30d_ratio:
          judgedPeriods > 0
            ? roundRatio((onTimePeriods + within7Days + within30Days) / judgedPeriods)
            : null,
        within_60d_ratio:
          judgedPeriods > 0
            ? roundRatio(
                (onTimePeriods + within7Days + within30Days + within60Days) / judgedPeriods
              )
            : null,
        average_delay_days: judgedPeriods > 0 ? roundRatio(averageDelayDays) : null,
        average_settlement_days: Number.isFinite(averageSettlementDays)
          ? roundRatio(averageSettlementDays)
          : null,
        current_balance: currentBalance,
        balance: currentBalance,
        outstanding_amount: outstandingAmount,
        maintain_score_by_date: activeCycleDueDateKey || null,
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
        judged_periods: judgedPeriods,
        on_time_periods: onTimePeriods,
        within_7d_periods: within7Days,
        within_30d_periods: within30Days,
        within_60d_periods: within60Days,
        late_periods: latePeriods,
        missed_periods: missedPeriods,
        grace_days: normalizedGraceDays,
        unapplied_payment_amount: roundMoney(unappliedPaymentAmount),
        status_target_days: Number(displayStatus?.target_days || DEFAULT_NEW_STATUS_DAYS),
        next_status_label: nextBetterBand?.label || null,
        helper_mode: helper.mode,
        helper_text: helper.text,
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
