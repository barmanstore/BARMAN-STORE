const registerCreditLedgerReportsRoutes = (deps) => {
  const {
    app,
    requireAuth,
    requireAdmin,
    dbGetAsync,
    dbAllAsync,
    getLatestCreditEntryAsync,
    buildCreditDisciplineProfile,
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
      const nowMs = Date.now();
      const customers = await dbAllAsync(
        `SELECT
           u.id as customer_id,
           u.name as customer_name,
           u.email,
           u.phone,
           COALESCE(u.credit_limit, 0) as credit_limit,
           COALESCE(cp.is_active, 1) as is_active,
           COALESCE(cp.grace_days, 60) as grace_days
         FROM users u
         LEFT JOIN customer_credit_profiles cp ON cp.user_id = u.id
         WHERE u.role = 'customer'
         ORDER BY u.name ASC`
      );

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
              needs_attention: 0,
              problem: 0,
            },
            aging_0_30: 0,
            aging_31_60: 0,
            aging_61_90: 0,
            aging_over_90: 0,
          },
        });
      }

      const ledgerRows = await dbAllAsync(
        `SELECT
           ch.id,
           ch.user_id,
           ch.type,
           ch.amount,
           ch.balance,
           ch.transaction_ts,
           ch.transaction_date,
           ch.due_date,
           ch.created_at,
           ch.source_type,
           ch.source_label,
           ch.reference
         FROM credit_history ch
         INNER JOIN users u ON u.id = ch.user_id
         WHERE u.role = 'customer'
         ORDER BY ch.user_id ASC, ch.transaction_ts ASC, ch.created_at ASC, ch.id ASC`
      );

      const rowsByUserId = new Map();
      for (const row of ledgerRows) {
        const userId = Number(row?.user_id || 0);
        if (!userId) continue;
        if (!rowsByUserId.has(userId)) rowsByUserId.set(userId, []);
        rowsByUserId.get(userId).push(row);
      }

      const evaluatedCustomers = customers
        .map((customer) => {
          const userId = Number(customer?.customer_id || 0);
          const customerRows = rowsByUserId.get(userId) || [];
          const latestBalance = customerRows.length > 0
            ? Number(customerRows[customerRows.length - 1]?.balance || 0)
            : 0;
          const profile = buildCreditDisciplineProfile(customerRows, {
            balance: latestBalance,
            creditLimit: Number(customer?.credit_limit || 0),
            nowMs,
            isActive: Boolean(Number(customer?.is_active ?? 1)),
            graceDays: Number(customer?.grace_days || 60),
          });
          const summary = profile?.summary || {};
          const currentBalance = Number(summary.current_balance || latestBalance || 0);
          return {
            ...customer,
            credit_limit: Number(customer?.credit_limit || 0),
            current_balance: currentBalance,
            payment_score: summary.payment_score,
            payment_status: summary.payment_status,
            payment_status_label: summary.payment_status_label,
            payment_status_tone: summary.payment_status_tone,
            payment_status_description: summary.payment_status_description,
            payment_status_tag: summary.payment_status_tag || null,
            is_defaulter: Boolean(summary.is_defaulter),
            is_active: Boolean(summary.is_active),
            customer_tag: summary.customer_tag || null,
            limit_status: summary.limit_status,
            limit_status_label: summary.limit_status_label,
            credit_limit_utilization: summary.credit_limit_utilization,
            oldest_open_days: Number(summary.oldest_open_days || 0),
            oldest_overdue_days: Number(summary.oldest_overdue_days || 0),
            average_settlement_days: summary.average_settlement_days,
            average_delay_days: summary.average_delay_days,
            total_periods: Number(summary.total_periods || 0),
            on_time_periods: Number(summary.on_time_periods || 0),
            within_7d_periods: Number(summary.within_7d_periods || 0),
            within_30d_periods: Number(summary.within_30d_periods || 0),
            within_60d_periods: Number(summary.within_60d_periods || 0),
            late_periods: Number(summary.late_periods || 0),
            missed_periods: Number(summary.missed_periods || 0),
            days_0_30: Number(summary.days_0_30 || 0),
            days_31_60: Number(summary.days_31_60 || 0),
            days_61_90: Number(summary.days_61_90 || 0),
            days_over_90: Number(summary.days_over_90 || 0),
            badges: Array.isArray(profile?.badges) ? profile.badges : [],
            summary_line: summary.summary_line || '',
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
            needs_attention: 0,
            problem: 0,
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
