const isTransientAnalyticsWriteError = (error) => {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  return (
    code === '53300' ||
    code === '57P03' ||
    message.includes('timeout exceeded when trying to connect') ||
    message.includes('max client connections reached') ||
    message.includes('remaining connection slots are reserved')
  );
};

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const asNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeDateKey = (value) => {
  const raw = String(value || '').trim();
  return DATE_KEY_PATTERN.test(raw) ? raw : '';
};

const serializeDailyCashTally = (row) => {
  if (!row) return null;
  return {
    date: row.tally_date,
    counted_cash_total: asNumber(row.counted_cash_total, 0),
    note: row.note || '',
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    created_by: Number(row.created_by || 0) || null,
    updated_by: Number(row.updated_by || 0) || null,
    updated_by_name: String(row.updated_by_name || '').trim(),
  };
};

const buildCashPictureSummary = ({ billTotals = null, tallyRow = null } = {}) => {
  const totalBilled = asNumber(billTotals?.total_billed, 0);
  const cashCollected = asNumber(billTotals?.cash_collected, 0);
  const creditIssued = asNumber(billTotals?.credit_issued, 0);
  const txCount = Math.max(0, asNumber(billTotals?.tx_count, 0));
  const paidBills = Math.max(0, asNumber(billTotals?.paid_bills, 0));
  const pendingBills = Math.max(0, asNumber(billTotals?.pending_bills, 0));
  const hasManualCashTally = Boolean(tallyRow);
  const manualCashTally = hasManualCashTally ? asNumber(tallyRow?.counted_cash_total, 0) : 0;
  const effectiveCashPicture = hasManualCashTally ? manualCashTally : cashCollected;

  return {
    total_billed: totalBilled,
    cash_collected: cashCollected,
    credit_issued: creditIssued,
    tx_count: txCount,
    paid_bills: paidBills,
    pending_bills: pendingBills,
    avg_ticket: txCount > 0 ? totalBilled / txCount : 0,
    expected_drawer_cash: cashCollected,
    effective_cash_picture: effectiveCashPicture,
    cash_variance: effectiveCashPicture - cashCollected,
    has_manual_cash_tally: hasManualCashTally,
    manual_cash_tally: manualCashTally,
    cash_tally_updated_at: tallyRow?.updated_at || tallyRow?.created_at || null,
    cash_tally_updated_by_name: String(tallyRow?.updated_by_name || '').trim(),
  };
};

const loadSalesBillSummary = async (dbGetAsync, { dateKey = '' } = {}) => {
  const normalizedDateKey = normalizeDateKey(dateKey);
  const usesCurrentDate = !normalizedDateKey;
  const params = usesCurrentDate ? [] : [normalizedDateKey];

  return dbGetAsync(
    `SELECT
       COALESCE(SUM(total_amount), 0) AS total_billed,
       COALESCE(SUM(paid_amount), 0) AS cash_collected,
       COALESCE(SUM(credit_amount), 0) AS credit_issued,
       COUNT(*) AS tx_count,
       COALESCE(SUM(CASE WHEN LOWER(COALESCE(payment_status, '')) = 'paid' THEN 1 ELSE 0 END), 0) AS paid_bills,
       COALESCE(SUM(CASE WHEN LOWER(COALESCE(payment_status, '')) = 'paid' THEN 0 ELSE 1 END), 0) AS pending_bills
     FROM bills
     WHERE LOWER(COALESCE(bill_type, 'sales')) = 'sales'
       AND DATE(created_at) = ${usesCurrentDate ? 'CURRENT_DATE' : 'DATE(?)'}`,
    params
  );
};

const loadDailyCashTally = async (dbGetAsync, dateKey) =>
  dbGetAsync(
    `SELECT
     dct.tally_date,
     dct.counted_cash_total,
     dct.note,
     dct.created_by,
     dct.updated_by,
     dct.created_at,
     dct.updated_at,
     updater.name AS updated_by_name
   FROM daily_cash_tallies dct
   LEFT JOIN users updater ON updater.id = dct.updated_by
   WHERE dct.tally_date = DATE(?)`,
    [dateKey]
  );

const loadTodayDailyCashTally = async (dbGetAsync) =>
  dbGetAsync(
    `SELECT
     dct.tally_date,
     dct.counted_cash_total,
     dct.note,
     dct.created_by,
     dct.updated_by,
     dct.created_at,
     dct.updated_at,
     updater.name AS updated_by_name
   FROM daily_cash_tallies dct
   LEFT JOIN users updater ON updater.id = dct.updated_by
   WHERE dct.tally_date = CURRENT_DATE`
  );

const registerAnalyticsRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    requireCapability,
    requireAuth,
    requireCronSecret,
    dbGetAsync,
    dbRunAsync,
    dbAllAsync,
    dbTxAsync,
    normalizeEmail,
    parsePhoneInput,
    normalizePhone,
    parseBooleanEnv,
    normalizeVisitorSessionId,
    generateVisitorSessionId,
    sanitizeTrackedPath,
    sanitizeShortText,
    hashVisitorIp,
    getAuthUserFromRequest,
    SQL_UPSERT_VISITOR_SESSION,
    VISITOR_ONLINE_WINDOW_MINUTES,
    sendEmailVerificationChallenge,
    sendPhoneVerificationChallenge,
    updateNotificationEventStatus,
    createAppNotification,
    notifyAdmins,
    purgeOldAppNotificationsAsync,
    APP_NOTIFICATION_RETENTION_DAYS,
    APP_NOTIFICATION_PURGE_BATCH_LIMIT,
    runPurchaseOperationNotificationsAsync,
    PURCHASE_OPERATIONS_NOTIFICATIONS_ENABLED,
    resolveClientRequestId,
    parseJsonText,
    safeSerializeJson,
    isUniqueViolationError,
    crypto,
  } = deps;

  app.post('/api/analytics/session/start', async (req, res) => {
    let sessionId = normalizeVisitorSessionId(req.body?.session_id || req.body?.sessionId);
    if (!sessionId) sessionId = generateVisitorSessionId();
    try {
      const trackedPath = sanitizeTrackedPath(req.body?.path || req.body?.pathname || '/');
      const referrer = sanitizeShortText(req.body?.referrer || req.headers.referer, 500);
      const userAgent = sanitizeShortText(req.headers['user-agent'], 500);
      const ipHash = hashVisitorIp(req);
      const authUser = await getAuthUserFromRequest(req);
      const authUserId = Number(authUser?.id || 0) || null;

      await dbRunAsync(SQL_UPSERT_VISITOR_SESSION, [
        sessionId,
        authUserId,
        trackedPath,
        referrer,
        userAgent,
        ipHash,
      ]);

      return res.status(201).json({ success: true, session_id: sessionId });
    } catch (error) {
      if (isTransientAnalyticsWriteError(error)) {
        console.warn('[analytics] session start degraded:', error.message || error);
        return res.status(202).json({ success: false, degraded: true, session_id: sessionId });
      }
      return res.status(500).json({ error: error.message || 'Failed to start visitor session' });
    }
  });

  app.post('/api/analytics/session/heartbeat', async (req, res) => {
    let sessionId = normalizeVisitorSessionId(req.body?.session_id || req.body?.sessionId);
    try {
      if (!sessionId) {
        return res.status(400).json({ error: 'session_id is required' });
      }
      const trackedPath = sanitizeTrackedPath(req.body?.path || req.body?.pathname || '/');
      const referrer = sanitizeShortText(req.body?.referrer || req.headers.referer, 500);
      const userAgent = sanitizeShortText(req.headers['user-agent'], 500);
      const ipHash = hashVisitorIp(req);
      const authUser = await getAuthUserFromRequest(req);
      const authUserId = Number(authUser?.id || 0) || null;

      await dbRunAsync(SQL_UPSERT_VISITOR_SESSION, [
        sessionId,
        authUserId,
        trackedPath,
        referrer,
        userAgent,
        ipHash,
      ]);

      return res.json({ success: true });
    } catch (error) {
      if (isTransientAnalyticsWriteError(error)) {
        console.warn('[analytics] heartbeat degraded:', error.message || error);
        return res.status(202).json({ success: false, degraded: true, session_id: sessionId });
      }
      return res.status(500).json({ error: error.message || 'Failed to track visitor heartbeat' });
    }
  });

  app.get(
    '/api/admin/analytics/summary',
    requireCapability('view_backoffice', 'Backoffice access required'),
    async (_, res) => {
      try {
        const windowArg = -VISITOR_ONLINE_WINDOW_MINUTES;

        const [
          onlineVisitorsRow,
          onlineLoggedInUsersRow,
          uniqueSessionsTodayRow,
          uniqueSessionsMonthRow,
          uniqueSessionsYearRow,
          todayBillSummary,
          todayCashTally,
        ] = await Promise.all([
          dbGetAsync(
            `SELECT COUNT(DISTINCT session_id) AS count
           FROM visitor_sessions
           WHERE last_seen_at >= (CURRENT_TIMESTAMP + (? * INTERVAL '1 minute'))`,
            [windowArg]
          ),
          dbGetAsync(
            `SELECT COUNT(DISTINCT user_id) AS count
           FROM visitor_sessions
           WHERE user_id IS NOT NULL
             AND last_seen_at >= (CURRENT_TIMESTAMP + (? * INTERVAL '1 minute'))`,
            [windowArg]
          ),
          dbGetAsync(
            `SELECT COUNT(DISTINCT session_id) AS count
           FROM visitor_sessions
           WHERE DATE(started_at) = CURRENT_DATE`
          ),
          dbGetAsync(
            `SELECT COUNT(DISTINCT session_id) AS count
           FROM visitor_sessions
           WHERE TO_CHAR(started_at, 'YYYY-MM') = TO_CHAR(CURRENT_TIMESTAMP, 'YYYY-MM')`
          ),
          dbGetAsync(
            `SELECT COUNT(DISTINCT session_id) AS count
           FROM visitor_sessions
           WHERE EXTRACT(YEAR FROM started_at) = EXTRACT(YEAR FROM CURRENT_TIMESTAMP)`
          ),
          loadSalesBillSummary(dbGetAsync),
          loadTodayDailyCashTally(dbGetAsync),
        ]);

        const onlineVisitors = Number(onlineVisitorsRow?.count || 0);
        const onlineLoggedInUsers = Number(onlineLoggedInUsersRow?.count || 0);
        const uniqueSessionsToday = Number(uniqueSessionsTodayRow?.count || 0);
        const uniqueSessionsMonth = Number(uniqueSessionsMonthRow?.count || 0);
        const uniqueSessionsYear = Number(uniqueSessionsYearRow?.count || 0);

        return res.json({
          online_visitors: onlineVisitors,
          online_logged_in_users: onlineLoggedInUsers,
          unique_sessions_today: uniqueSessionsToday,
          unique_sessions_month: uniqueSessionsMonth,
          unique_sessions_year: uniqueSessionsYear,
          online_window_minutes: VISITOR_ONLINE_WINDOW_MINUTES,
          today_cash_summary: buildCashPictureSummary({
            billTotals: todayBillSummary,
            tallyRow: todayCashTally,
          }),
        });
      } catch (error) {
        return res.status(500).json({ error: error.message || 'Failed to load analytics summary' });
      }
    }
  );

  app.get(
    '/api/admin/analytics/daily-cash-tally',
    requireCapability('view_backoffice', 'Backoffice access required'),
    async (req, res) => {
      try {
        const dateKey = normalizeDateKey(req.query?.date || req.query?.day);
        if (!dateKey) {
          return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
        }

        const tallyRow = await loadDailyCashTally(dbGetAsync, dateKey);
        return res.json({
          date: dateKey,
          entry: serializeDailyCashTally(tallyRow),
        });
      } catch (error) {
        return res.status(500).json({ error: error.message || 'Failed to load daily cash tally' });
      }
    }
  );

  app.put('/api/admin/analytics/daily-cash-tally', requireAdmin, async (req, res) => {
    try {
      const dateKey = normalizeDateKey(req.body?.date || req.body?.day);
      if (!dateKey) {
        return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
      }

      const countedCashTotal = Number(req.body?.counted_cash_total ?? req.body?.countedCashTotal);
      if (!Number.isFinite(countedCashTotal) || countedCashTotal < 0) {
        return res
          .status(400)
          .json({ error: 'counted_cash_total must be a valid non-negative number' });
      }

      const note = sanitizeShortText(req.body?.note || req.body?.notes || '', 1000) || null;
      const actorId = Number(req.authUser?.id || req.user?.id || 0) || null;

      await dbRunAsync(
        `INSERT INTO daily_cash_tallies (tally_date, counted_cash_total, note, created_by, updated_by)
         VALUES (DATE(?), ?, ?, ?, ?)
         ON CONFLICT (tally_date) DO UPDATE SET
           counted_cash_total = EXCLUDED.counted_cash_total,
           note = EXCLUDED.note,
           updated_by = EXCLUDED.updated_by,
           updated_at = CURRENT_TIMESTAMP`,
        [dateKey, countedCashTotal, note, actorId, actorId]
      );

      const [savedTally, billSummary] = await Promise.all([
        loadDailyCashTally(dbGetAsync, dateKey),
        loadSalesBillSummary(dbGetAsync, { dateKey }),
      ]);

      return res.json({
        success: true,
        date: dateKey,
        entry: serializeDailyCashTally(savedTally),
        summary: buildCashPictureSummary({
          billTotals: billSummary,
          tallyRow: savedTally,
        }),
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to save daily cash tally' });
    }
  });
};

module.exports = { registerAnalyticsRoutes };
