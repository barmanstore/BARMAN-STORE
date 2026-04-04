const SCORE_BANDS = require('../../../../shared/creditScoreBands.json');

const DEFAULT_NEW_STATUS_DAYS = 7;
const DEFAULT_GRACE_DAYS = 3;
const PAYMENT_INTELLIGENCE_MODEL_VERSION = 2;
const SCORE_BASELINE = 80;
const MISSED_PERIOD_PENALTY = 15;

const NEW_CUSTOMER_STATUS = Object.freeze({
  key: 'new',
  label: 'New',
  tone: 'new',
  target_days: DEFAULT_NEW_STATUS_DAYS,
  description: 'Complete your first payment cycle to unlock a payment status.',
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const SORTED_SCORE_BANDS = (Array.isArray(SCORE_BANDS) ? SCORE_BANDS : [])
  .map((band) => ({
    ...band,
    min: Number(band?.min || 0),
    max: Number(band?.max || 0),
    target_days: Math.max(0, Math.floor(Number(band?.target_days || 0))),
  }))
  .sort((a, b) => b.min - a.min);

const getScoreBand = (score) => {
  const numericScore = clamp(Math.round(toFiniteNumber(score, 0)), 0, 100);
  return SORTED_SCORE_BANDS.find((band) => numericScore >= band.min) || SORTED_SCORE_BANDS[SORTED_SCORE_BANDS.length - 1] || null;
};

const getBandByKey = (key) => {
  const normalizedKey = String(key || '').trim().toLowerCase();
  return SORTED_SCORE_BANDS.find((band) => String(band?.key || '').trim().toLowerCase() === normalizedKey) || null;
};

const getBandIndex = (key) => {
  const normalizedKey = String(key || '').trim().toLowerCase();
  return SORTED_SCORE_BANDS.findIndex((band) => String(band?.key || '').trim().toLowerCase() === normalizedKey);
};

const getNextBetterBand = (key) => {
  const normalizedKey = String(key || '').trim().toLowerCase();
  if (!normalizedKey) return null;
  const currentIndex = getBandIndex(normalizedKey);
  if (currentIndex <= 0) return null;
  return SORTED_SCORE_BANDS[currentIndex - 1] || null;
};

const getFirstEstablishedBand = () => SORTED_SCORE_BANDS[0] || null;

const getCycleBandForElapsedDays = (elapsedDays = 0, {
  graceDays = DEFAULT_GRACE_DAYS,
} = {}) => {
  const normalizedElapsedDays = Math.max(0, Math.floor(toFiniteNumber(elapsedDays, 0)));
  const normalizedGraceDays = Math.max(0, Math.floor(toFiniteNumber(graceDays, DEFAULT_GRACE_DAYS)));
  for (const band of SORTED_SCORE_BANDS) {
    if (normalizedElapsedDays <= (Number(band?.target_days || 0) + normalizedGraceDays)) {
      return band;
    }
  }
  return SORTED_SCORE_BANDS[SORTED_SCORE_BANDS.length - 1] || null;
};

const getCycleBandWindow = (key, {
  graceDays = DEFAULT_GRACE_DAYS,
} = {}) => {
  const band = getBandByKey(key);
  if (!band) {
    return {
      band: null,
      lower: 0,
      upper: 0,
    };
  }

  const normalizedGraceDays = Math.max(0, Math.floor(toFiniteNumber(graceDays, DEFAULT_GRACE_DAYS)));
  const currentIndex = getBandIndex(band.key);
  const lower = currentIndex <= 0
    ? 0
    : (Math.max(0, Math.floor(Number(SORTED_SCORE_BANDS[currentIndex - 1]?.target_days || 0))) + normalizedGraceDays + 1);
  const upper = Math.max(lower, Math.floor(Number(band?.target_days || 0)) + normalizedGraceDays);

  return {
    band,
    lower,
    upper,
  };
};

const getBandScoreForElapsedDays = (key, elapsedDays = 0, {
  graceDays = DEFAULT_GRACE_DAYS,
} = {}) => {
  const { band, lower, upper } = getCycleBandWindow(key, { graceDays });
  if (!band) return null;

  const normalizedElapsedDays = Math.max(0, Math.floor(toFiniteNumber(elapsedDays, 0)));
  const scoreMin = Math.max(0, Math.floor(toFiniteNumber(band.min, 0)));
  const scoreMax = Math.max(scoreMin, Math.floor(toFiniteNumber(band.max, scoreMin)));
  if (upper <= lower) return clamp(Math.round((scoreMin + scoreMax) / 2), 0, 100);

  const clampedElapsed = clamp(normalizedElapsedDays, lower, upper);
  const progress = (clampedElapsed - lower) / Math.max(1, upper - lower);
  const rawScore = scoreMax - (progress * (scoreMax - scoreMin));
  return clamp(Math.round(rawScore), 0, 100);
};

const isNewCustomerSummary = (summary = {}) => {
  const customerTag = String(summary?.customer_tag || '').trim().toLowerCase();
  const paymentStatus = String(summary?.payment_status || summary?.payment_status_key || '').trim().toLowerCase();
  const paymentStatusLabel = String(summary?.payment_status_label || summary?.label || '').trim().toLowerCase();
  return customerTag === 'insufficient_history'
    || paymentStatus === 'new'
    || paymentStatusLabel === 'new';
};

const resolveTargetBand = (summary = {}) => {
  if (isNewCustomerSummary(summary)) return NEW_CUSTOMER_STATUS;
  return getBandByKey(summary?.payment_status || summary?.payment_status_key || summary?.badge_key || '') || NEW_CUSTOMER_STATUS;
};

const resolveCreditTermsDays = ({
  creditTermsDays,
  paymentSummary,
} = {}) => {
  const manualDays = Math.max(0, Math.floor(toFiniteNumber(creditTermsDays, 0)));
  if (manualDays > 0) return manualDays;
  const band = resolveTargetBand(paymentSummary);
  return Math.max(0, Math.floor(Number(band?.target_days || DEFAULT_NEW_STATUS_DAYS)));
};

const getSettlementAdjustment = ({
  earlyDays = 0,
  lateDays = 0,
  graceDays = DEFAULT_GRACE_DAYS,
  isFullySettled = false,
  isMissed = false,
} = {}) => {
  const normalizedEarlyDays = Math.max(0, Math.floor(toFiniteNumber(earlyDays, 0)));
  const normalizedLateDays = Math.max(0, Math.floor(toFiniteNumber(lateDays, 0)));
  const normalizedGraceDays = Math.max(0, Math.floor(toFiniteNumber(graceDays, DEFAULT_GRACE_DAYS)));

  if (isMissed) {
    return {
      bucket: 'missed',
      delta: -MISSED_PERIOD_PENALTY,
      judged: true,
      label: 'Missed beyond grace',
    };
  }

  if (!isFullySettled) {
    return {
      bucket: 'open',
      delta: 0,
      judged: false,
      label: 'Open',
    };
  }

  if (normalizedEarlyDays >= 7) {
    return {
      bucket: 'early_7_plus',
      delta: 5,
      judged: true,
      label: 'Paid 7+ days early',
    };
  }
  if (normalizedEarlyDays >= 3) {
    return {
      bucket: 'early_3_to_6',
      delta: 3,
      judged: true,
      label: 'Paid 3-6 days early',
    };
  }
  if (normalizedEarlyDays >= 1) {
    return {
      bucket: 'early_1_to_2',
      delta: 1,
      judged: true,
      label: 'Paid 1-2 days early',
    };
  }
  if (normalizedLateDays <= 0) {
    return {
      bucket: 'on_due_date',
      delta: 0,
      judged: true,
      label: 'Paid on due date',
    };
  }
  if (normalizedLateDays <= normalizedGraceDays) {
    return {
      bucket: 'late_within_grace',
      delta: -3,
      judged: true,
      label: 'Paid after due date',
    };
  }
  return {
    bucket: 'late_after_grace',
    delta: -MISSED_PERIOD_PENALTY,
    judged: true,
    label: 'Paid after grace period',
  };
};

module.exports = {
  SCORE_BANDS: SORTED_SCORE_BANDS,
  DEFAULT_GRACE_DAYS,
  DEFAULT_NEW_STATUS_DAYS,
  PAYMENT_INTELLIGENCE_MODEL_VERSION,
  SCORE_BASELINE,
  MISSED_PERIOD_PENALTY,
  NEW_CUSTOMER_STATUS,
  getScoreBand,
  getBandByKey,
  getBandIndex,
  getNextBetterBand,
  getFirstEstablishedBand,
  getCycleBandForElapsedDays,
  getCycleBandWindow,
  getBandScoreForElapsedDays,
  isNewCustomerSummary,
  resolveTargetBand,
  resolveCreditTermsDays,
  getSettlementAdjustment,
};
