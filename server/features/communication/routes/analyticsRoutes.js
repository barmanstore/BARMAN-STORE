const isTransientAnalyticsWriteError = (error) => {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  return (
    code === '53300'
    || code === '57P03'
    || message.includes('timeout exceeded when trying to connect')
    || message.includes('max client connections reached')
    || message.includes('remaining connection slots are reserved')
  );
};

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

      await dbRunAsync(SQL_UPSERT_VISITOR_SESSION, [sessionId, authUserId, trackedPath, referrer, userAgent, ipHash]);

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

      await dbRunAsync(SQL_UPSERT_VISITOR_SESSION, [sessionId, authUserId, trackedPath, referrer, userAgent, ipHash]);

      return res.json({ success: true });
    } catch (error) {
      if (isTransientAnalyticsWriteError(error)) {
        console.warn('[analytics] heartbeat degraded:', error.message || error);
        return res.status(202).json({ success: false, degraded: true, session_id: sessionId });
      }
      return res.status(500).json({ error: error.message || 'Failed to track visitor heartbeat' });
    }
  });

  app.get('/api/admin/analytics/summary', requireCapability('view_backoffice', 'Backoffice access required'), async (_, res) => {
    try {
      const windowArg = -VISITOR_ONLINE_WINDOW_MINUTES;

      const onlineVisitors = Number(
        (await dbGetAsync(
          `SELECT COUNT(DISTINCT session_id) AS count
           FROM visitor_sessions
           WHERE last_seen_at >= (CURRENT_TIMESTAMP + (? * INTERVAL '1 minute'))`,
          [windowArg]
        ))?.count || 0
      );
      const onlineLoggedInUsers = Number(
        (await dbGetAsync(
          `SELECT COUNT(DISTINCT user_id) AS count
           FROM visitor_sessions
           WHERE user_id IS NOT NULL
             AND last_seen_at >= (CURRENT_TIMESTAMP + (? * INTERVAL '1 minute'))`,
          [windowArg]
        ))?.count || 0
      );
      const uniqueSessionsToday = Number(
        (await dbGetAsync(
          `SELECT COUNT(DISTINCT session_id) AS count
           FROM visitor_sessions
           WHERE DATE(started_at) = CURRENT_DATE`
        ))?.count || 0
      );
      const uniqueSessionsMonth = Number(
        (await dbGetAsync(
          `SELECT COUNT(DISTINCT session_id) AS count
           FROM visitor_sessions
           WHERE TO_CHAR(started_at, 'YYYY-MM') = TO_CHAR(CURRENT_TIMESTAMP, 'YYYY-MM')`
        ))?.count || 0
      );
      const uniqueSessionsYear = Number(
        (await dbGetAsync(
          `SELECT COUNT(DISTINCT session_id) AS count
           FROM visitor_sessions
           WHERE EXTRACT(YEAR FROM started_at) = EXTRACT(YEAR FROM CURRENT_TIMESTAMP)`
        ))?.count || 0
      );

      return res.json({
        online_visitors: onlineVisitors,
        online_logged_in_users: onlineLoggedInUsers,
        unique_sessions_today: uniqueSessionsToday,
        unique_sessions_month: uniqueSessionsMonth,
        unique_sessions_year: uniqueSessionsYear,
        online_window_minutes: VISITOR_ONLINE_WINDOW_MINUTES,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to load analytics summary' });
    }
  });

};

module.exports = { registerAnalyticsRoutes };
