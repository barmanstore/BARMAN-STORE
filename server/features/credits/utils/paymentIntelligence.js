const { CREDIT_BADGE_SETTINGS } = require('./creditBadges');

const DEFAULT_PROFILE = Object.freeze({
  is_active: true,
  grace_days: CREDIT_BADGE_SETTINGS.defaultGraceDays,
  credit_terms_days: 0,
});

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeProfileRow = (row) => ({
  is_active: row?.is_active === undefined || row?.is_active === null
    ? DEFAULT_PROFILE.is_active
    : Boolean(Number(row.is_active)),
  grace_days: Math.max(0, Math.floor(toFiniteNumber(row?.grace_days, DEFAULT_PROFILE.grace_days))),
  credit_terms_days: Math.max(0, Math.floor(toFiniteNumber(row?.credit_terms_days, DEFAULT_PROFILE.credit_terms_days))),
});

const createPaymentIntelligenceUtils = ({
  dbGetAsync,
  dbAllAsync,
  dbRunAsync,
  buildCreditDisciplineProfile,
} = {}) => {
  const ensureCustomerCreditProfileAsync = async (userId) => {
    await dbRunAsync(
      `INSERT INTO customer_credit_profiles (user_id, is_active, grace_days, credit_terms_days)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, DEFAULT_PROFILE.is_active ? 1 : 0, DEFAULT_PROFILE.grace_days, DEFAULT_PROFILE.credit_terms_days]
    );
  };

  const getCustomerCreditProfileAsync = async (userId) => {
    if (!Number(userId)) return { ...DEFAULT_PROFILE };
    const row = await dbGetAsync(
      `SELECT user_id, is_active, grace_days, credit_terms_days
       FROM customer_credit_profiles
       WHERE user_id = ?`,
      [userId]
    );
    return normalizeProfileRow(row);
  };

  const rebuildCustomerPaymentIntelligence = async (userId, {
    creditLimit = null,
    nowMs = Date.now(),
  } = {}) => {
    const normalizedUserId = Number(userId || 0);
    if (!normalizedUserId) return null;

    await ensureCustomerCreditProfileAsync(normalizedUserId);

    const [profileRow, userRow, ledgerRows] = await Promise.all([
      getCustomerCreditProfileAsync(normalizedUserId),
      creditLimit === null || creditLimit === undefined
        ? dbGetAsync(`SELECT COALESCE(credit_limit, 0) AS credit_limit FROM users WHERE id = ?`, [normalizedUserId])
        : Promise.resolve({ credit_limit: creditLimit }),
      dbAllAsync(
        `SELECT
           id,
           user_id,
           type,
           amount,
           balance,
           transaction_ts,
           transaction_date,
           due_date,
           created_at,
           source_type,
           source_id,
           source_label,
           reference
         FROM credit_history
         WHERE user_id = ?
         ORDER BY transaction_ts ASC, created_at ASC, id ASC`,
        [normalizedUserId]
      ),
    ]);

    const latestBalance = Array.isArray(ledgerRows) && ledgerRows.length > 0
      ? Number(ledgerRows[ledgerRows.length - 1]?.balance || 0)
      : 0;

    const profile = buildCreditDisciplineProfile(ledgerRows, {
      balance: latestBalance,
      creditLimit: Number(userRow?.credit_limit || 0),
      nowMs,
      isActive: profileRow.is_active,
      graceDays: profileRow.grace_days,
    });

    const periods = Array.isArray(profile?.periods) ? profile.periods : [];
    const summary = profile?.summary || {};
    const metrics = profile?.metrics || {};

    await dbRunAsync(`DELETE FROM customer_payment_periods WHERE user_id = ?`, [normalizedUserId]);

    for (const period of periods) {
      await dbRunAsync(
        `INSERT INTO customer_payment_periods (
           user_id,
           period_key,
           source_credit_entry_id,
           period_start,
           due_date,
           grace_days,
           expected_amount,
           allocated_amount,
           remaining_amount,
           is_fully_settled,
           settled_at,
           source_type,
           source_id,
           source_label,
           updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          normalizedUserId,
          String(period.period_key || '').trim(),
          Number(period.source_credit_entry_id || 0) || null,
          period.period_start || new Date(nowMs).toISOString(),
          String(period.due_date || '').slice(0, 10),
          Math.max(0, Math.floor(toFiniteNumber(period.grace_days, profileRow.grace_days))),
          toFiniteNumber(period.expected_amount, 0),
          toFiniteNumber(period.allocated_amount, 0),
          toFiniteNumber(period.remaining_amount, 0),
          period.is_fully_settled ? 1 : 0,
          period.settled_at || null,
          period.source_type || null,
          period.source_id || null,
          period.source_label || null,
        ]
      );
    }

    await dbRunAsync(
      `INSERT INTO customer_payment_score_snapshots (
         user_id,
         score_100,
         raw_score_70,
         badge_key,
         badge_label,
         badge_tone,
         status_tag,
         active_points,
         discipline_points,
         missed_penalty,
         delay_penalty,
         average_weight,
         total_periods,
         on_time_periods,
         within_7d_periods,
         within_30d_periods,
         within_60d_periods,
         late_periods,
         missed_periods,
         average_delay_days,
         oldest_overdue_days,
         current_outstanding,
         unapplied_credit,
         is_active,
         is_defaulter,
         customer_tag,
         computed_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET
         score_100 = EXCLUDED.score_100,
         raw_score_70 = EXCLUDED.raw_score_70,
         badge_key = EXCLUDED.badge_key,
         badge_label = EXCLUDED.badge_label,
         badge_tone = EXCLUDED.badge_tone,
         status_tag = EXCLUDED.status_tag,
         active_points = EXCLUDED.active_points,
         discipline_points = EXCLUDED.discipline_points,
         missed_penalty = EXCLUDED.missed_penalty,
         delay_penalty = EXCLUDED.delay_penalty,
         average_weight = EXCLUDED.average_weight,
         total_periods = EXCLUDED.total_periods,
         on_time_periods = EXCLUDED.on_time_periods,
         within_7d_periods = EXCLUDED.within_7d_periods,
         within_30d_periods = EXCLUDED.within_30d_periods,
         within_60d_periods = EXCLUDED.within_60d_periods,
         late_periods = EXCLUDED.late_periods,
         missed_periods = EXCLUDED.missed_periods,
         average_delay_days = EXCLUDED.average_delay_days,
         oldest_overdue_days = EXCLUDED.oldest_overdue_days,
         current_outstanding = EXCLUDED.current_outstanding,
         unapplied_credit = EXCLUDED.unapplied_credit,
         is_active = EXCLUDED.is_active,
         is_defaulter = EXCLUDED.is_defaulter,
         customer_tag = EXCLUDED.customer_tag,
         computed_at = CURRENT_TIMESTAMP`,
      [
        normalizedUserId,
        summary.payment_score === null || summary.payment_score === undefined
          ? null
          : Math.round(Number(summary.payment_score)),
        toFiniteNumber(summary.raw_score_70, 0),
        summary.payment_status || null,
        summary.payment_status_label || null,
        summary.payment_status_tone || null,
        summary.payment_status_tag || null,
        toFiniteNumber(summary.active_points, 0),
        toFiniteNumber(summary.discipline_points, 0),
        toFiniteNumber(summary.missed_penalty, 0),
        toFiniteNumber(summary.delay_penalty, 0),
        toFiniteNumber(summary.average_weight, 0),
        Number(summary.total_periods || 0),
        Number(summary.on_time_periods || 0),
        Number(summary.within_7d_periods || 0),
        Number(summary.within_30d_periods || 0),
        Number(summary.within_60d_periods || 0),
        Number(summary.late_periods || 0),
        Number(summary.missed_periods || 0),
        toFiniteNumber(summary.average_delay_days, 0),
        Number(summary.oldest_overdue_days || 0),
        toFiniteNumber(summary.outstanding_amount, 0),
        toFiniteNumber(summary.unapplied_payment_amount, 0),
        summary.is_active ? 1 : 0,
        summary.is_defaulter ? 1 : 0,
        summary.customer_tag || null,
      ]
    );

    return {
      ...profile,
      profile: profileRow,
    };
  };

  const rebuildAllCustomerPaymentIntelligence = async ({ nowMs = Date.now() } = {}) => {
    const customers = await dbAllAsync(
      `SELECT id
       FROM users
       WHERE role = 'customer'
       ORDER BY id ASC`
    );

    let rebuilt = 0;
    for (const row of customers) {
      const userId = Number(row?.id || 0);
      if (!userId) continue;
      await rebuildCustomerPaymentIntelligence(userId, { nowMs });
      rebuilt += 1;
    }

    return {
      success: true,
      rebuilt,
    };
  };

  return {
    ensureCustomerCreditProfileAsync,
    getCustomerCreditProfileAsync,
    rebuildCustomerPaymentIntelligence,
    rebuildAllCustomerPaymentIntelligence,
  };
};

module.exports = {
  DEFAULT_PROFILE,
  createPaymentIntelligenceUtils,
};
