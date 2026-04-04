const {
  DEFAULT_GRACE_DAYS,
  PAYMENT_INTELLIGENCE_MODEL_VERSION,
} = require('../../utils/creditStatusPolicy');

const registerCreditLedgerReportsRoutes = (deps) => {
  const {
    app,
    requireAuth,
    requireAdmin,
    dbGetAsync,
    dbAllAsync,
    getLatestCreditEntryAsync,
    rebuildAllCustomerPaymentIntelligence,
  } = deps;

  app.post('/api/credit/check-limit', requireAuth, async (req, res) => {
    try {
      const customerId = req.body?.customer_id;
      const additionalAmount = Number(req.body?.additional_amount || 0);
      if (!customerId) return res.status(400).json({ error: 'customer_id is required' });
      const user = await dbGetAsync(`SELECT id, name, credit_limit FROM users WHERE id = ?`, [customerId]);
      if (!user) return res.status(404).json({ error: 'Customer not found' });
      const last = await getLatestCreditEntryAsync(customerId);
      const currentBalance = Number(last?.balance || 0);
      const creditLimit = Number(user.credit_limit || 0);
      const projected = currentBalance + additionalAmount;
      const allowed = creditLimit <= 0 ? true : projected <= creditLimit;
      return res.json({
        allowed,
        customer_id: user.id,
        customer_name: user.name,
        current_balance: currentBalance,
        additional_amount: additionalAmount,
        projected_balance: projected,
        credit_limit: creditLimit,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/credit/aging', requireAdmin, async (_, res) => {
    try {
      const loadCustomers = async () => dbAllAsync(
        `SELECT
           u.id as customer_id,
           u.name as customer_name,
           u.email,
           u.phone,
           COALESCE(u.credit_limit, 0) as credit_limit,
           COALESCE(cp.is_active, 1) as is_active,
           COALESCE(NULLIF(cp.grace_days, 60), ${DEFAULT_GRACE_DAYS}) as grace_days,
           cas.current_balance,
           cas.payment_score,
           cas.payment_status,
           cas.payment_status_label,
           cas.payment_status_tone,
           cas.payment_status_description,
           cas.payment_status_tag,
           cas.customer_tag,
           cas.is_active as snapshot_active,
           cas.is_defaulter,
           cas.limit_status,
           cas.limit_status_label,
           cas.credit_limit_utilization,
           cas.oldest_open_days,
           cas.oldest_overdue_days,
           cas.average_settlement_days,
           cas.average_delay_days,
           cas.total_periods,
           cas.on_time_periods,
           cas.within_7d_periods,
           cas.within_30d_periods,
           cas.within_60d_periods,
           cas.late_periods,
           cas.missed_periods,
           cas.days_0_30,
           cas.days_31_60,
           cas.days_61_90,
           cas.days_over_90,
           cas.badges,
           cas.summary_line,
           cas.model_version
         FROM users u
         LEFT JOIN customer_credit_profiles cp ON cp.user_id = u.id
         LEFT JOIN customer_credit_aging_snapshots cas ON cas.user_id = u.id
         WHERE u.role = 'customer'
         ORDER BY u.name ASC`
      );

      let customers = await loadCustomers();

      if (!Array.isArray(customers) || customers.length === 0) {
        return res.json({
          report: [],
          summary: {
            total_outstanding: 0,
            customers_overdue: 0,
            customers_over_limit: 0,
            average_payment_score: 0,
            customers_need_follow_up: 0,
            customers_defaulters: 0,
            customers_new: 0,
            badge_counts: {
              excellent: 0,
              very_good: 0,
              good: 0,
              average: 0,
              needs_attention: 0,
              problem: 0,
              defaulter: 0,
            },
            aging_0_30: 0,
            aging_31_60: 0,
            aging_61_90: 0,
            aging_over_90: 0,
          },
        });
      }

      let hasSnapshotData = customers.some((row) => (
        row?.current_balance !== null
        || row?.total_periods !== null
      ));
      let hasStaleSnapshotData = customers.some((row) => (
        (row?.current_balance !== null || row?.total_periods !== null)
        && Number(row?.model_version || 0) !== PAYMENT_INTELLIGENCE_MODEL_VERSION
      ));

      if ((hasStaleSnapshotData || !hasSnapshotData) && typeof rebuildAllCustomerPaymentIntelligence === 'function') {
        await rebuildAllCustomerPaymentIntelligence({ nowMs: Date.now() });
        customers = await loadCustomers();
        hasSnapshotData = customers.some((row) => (
          row?.current_balance !== null
          || row?.total_periods !== null
        ));
        hasStaleSnapshotData = customers.some((row) => (
          (row?.current_balance !== null || row?.total_periods !== null)
          && Number(row?.model_version || 0) !== PAYMENT_INTELLIGENCE_MODEL_VERSION
        ));
      }

      if (!hasSnapshotData || hasStaleSnapshotData) {
        console.warn(`[AGING] Snapshot table not ready (hasData=${hasSnapshotData}, stale=${hasStaleSnapshotData})`);
        return res.status(503).json({ status: 'initializing' });
      }

      const normalizeBadges = (value) => {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
          } catch (_) {
            return [];
          }
        }
        return [];
      };

      const evaluatedCustomers = customers
        .map((customer) => {
          const currentBalance = Number(customer?.current_balance || 0);
          return {
            ...customer,
            credit_limit: Number(customer?.credit_limit || 0),
            current_balance: currentBalance,
            payment_score: customer?.payment_score ?? null,
            payment_status: customer?.payment_status || null,
            payment_status_label: customer?.payment_status_label || null,
            payment_status_tone: customer?.payment_status_tone || null,
            payment_status_description: customer?.payment_status_description || null,
            payment_status_tag: customer?.payment_status_tag || null,
            is_defaulter: Boolean(Number(customer?.is_defaulter || 0)),
            is_active: customer?.snapshot_active === null || customer?.snapshot_active === undefined
              ? Boolean(Number(customer?.is_active ?? 1))
              : Boolean(Number(customer?.snapshot_active)),
            customer_tag: customer?.customer_tag || null,
            limit_status: customer?.limit_status || null,
            limit_status_label: customer?.limit_status_label || null,
            credit_limit_utilization: Number(customer?.credit_limit_utilization || 0),
            oldest_open_days: Number(customer?.oldest_open_days || 0),
            oldest_overdue_days: Number(customer?.oldest_overdue_days || 0),
            average_settlement_days: customer?.average_settlement_days ?? null,
            average_delay_days: customer?.average_delay_days ?? null,
            total_periods: Number(customer?.total_periods || 0),
            on_time_periods: Number(customer?.on_time_periods || 0),
            within_7d_periods: Number(customer?.within_7d_periods || 0),
            within_30d_periods: Number(customer?.within_30d_periods || 0),
            within_60d_periods: Number(customer?.within_60d_periods || 0),
            late_periods: Number(customer?.late_periods || 0),
            missed_periods: Number(customer?.missed_periods || 0),
            days_0_30: Number(customer?.days_0_30 || 0),
            days_31_60: Number(customer?.days_31_60 || 0),
            days_61_90: Number(customer?.days_61_90 || 0),
            days_over_90: Number(customer?.days_over_90 || 0),
            badges: normalizeBadges(customer?.badges),
            summary_line: customer?.summary_line || '',
          };
        })
        .filter((row) => (
          Number(row.total_periods || 0) > 0
          || Number(row.current_balance || 0) > 0
        ));

      const report = evaluatedCustomers
        .filter((row) => (
          Number(row.current_balance || 0) > 0
          || Number(row.days_0_30 || 0) > 0
          || Number(row.days_31_60 || 0) > 0
          || Number(row.days_61_90 || 0) > 0
          || Number(row.days_over_90 || 0) > 0
        ))
        .sort((a, b) => (
          Number(b.current_balance || 0) - Number(a.current_balance || 0)
          || Number(a.payment_score ?? 101) - Number(b.payment_score ?? 101)
          || String(a.customer_name || '').localeCompare(String(b.customer_name || ''))
        ));

      const summary = report.reduce(
        (acc, r) => {
          acc.total_outstanding += Number(r.current_balance || 0);
          acc.aging_0_30 += Number(r.days_0_30 || 0);
          acc.aging_31_60 += Number(r.days_31_60 || 0);
          acc.aging_61_90 += Number(r.days_61_90 || 0);
          acc.aging_over_90 += Number(r.days_over_90 || 0);
          if (Number(r.days_31_60 || 0) > 0 || Number(r.days_61_90 || 0) > 0 || Number(r.days_over_90 || 0) > 0) {
            acc.customers_overdue += 1;
          }
          if (String(r.limit_status || '').trim().toLowerCase() === 'over_limit') {
            acc.customers_over_limit += 1;
          }
          return acc;
        },
        {
          total_outstanding: 0,
          customers_overdue: 0,
          customers_over_limit: 0,
          aging_0_30: 0,
          aging_31_60: 0,
          aging_61_90: 0,
          aging_over_90: 0,
        }
      );

      const customerBreakdown = evaluatedCustomers.reduce(
        (acc, row) => {
          const normalizedStatus = String(row.payment_status || '').trim().toLowerCase();
          const isNew = String(row.customer_tag || '').trim().toLowerCase() === 'insufficient_history'
            || normalizedStatus === 'new';
          if (!isNew && normalizedStatus && acc.badge_counts[normalizedStatus] !== undefined) {
            acc.badge_counts[normalizedStatus] += 1;
          }
          if (!isNew && Number.isFinite(Number(row.payment_score))) {
            acc.payment_score_total += Number(row.payment_score || 0);
            acc.payment_score_count += 1;
          }
          if (isNew) {
            acc.customers_new += 1;
          }
          if (row.is_defaulter) {
            acc.customers_defaulters += 1;
          }
          if (
            row.is_defaulter
            || Number(row.missed_periods || 0) > 0
            || Number(row.days_31_60 || 0) > 0
            || Number(row.days_61_90 || 0) > 0
            || Number(row.days_over_90 || 0) > 0
            || normalizedStatus === 'needs_attention'
            || normalizedStatus === 'problem'
            || normalizedStatus === 'defaulter'
          ) {
            acc.customers_need_follow_up += 1;
          }
          return acc;
        },
        {
          payment_score_total: 0,
          payment_score_count: 0,
          customers_defaulters: 0,
          customers_need_follow_up: 0,
          customers_new: 0,
          badge_counts: {
            excellent: 0,
            very_good: 0,
            good: 0,
            average: 0,
            needs_attention: 0,
            problem: 0,
            defaulter: 0,
          },
        }
      );
      return res.json({
        report,
        summary: {
          total_outstanding: summary.total_outstanding,
          customers_overdue: summary.customers_overdue,
          customers_over_limit: summary.customers_over_limit,
          average_payment_score: customerBreakdown.payment_score_count > 0
            ? Math.round((customerBreakdown.payment_score_total / customerBreakdown.payment_score_count) * 10) / 10
            : 0,
          customers_need_follow_up: customerBreakdown.customers_need_follow_up,
          customers_defaulters: customerBreakdown.customers_defaulters,
          customers_new: customerBreakdown.customers_new,
          badge_counts: customerBreakdown.badge_counts,
          aging_0_30: summary.aging_0_30,
          aging_31_60: summary.aging_31_60,
          aging_61_90: summary.aging_61_90,
          aging_over_90: summary.aging_over_90,
        },
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerCreditLedgerReportsRoutes };
