const registerMediaProxyRoutes = (deps) => {
  const {
    app,
    requireAdmin,
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

  app.get('/api/media/proxy', async (req, res) => {
    try {
      const rawUrl = String(req.query?.url || '').trim();
      if (!rawUrl) {
        return res.status(400).json({ error: 'url query parameter is required' });
      }

      let target;
      try {
        target = new URL(rawUrl);
      } catch (_) {
        return res.status(400).json({ error: 'Invalid media URL' });
      }

      if (!['http:', 'https:'].includes(target.protocol)) {
        return res.status(400).json({ error: 'Only http/https media URLs are allowed' });
      }

      const hostname = String(target.hostname || '').toLowerCase();
      if (
        hostname === 'localhost'
        || hostname === '127.0.0.1'
        || hostname === '::1'
        || hostname.startsWith('10.')
        || hostname.startsWith('192.168.')
        || /^172\.(1[6-9]|2\\d|3[0-1])\\./.test(hostname)
      ) {
        return res.status(403).json({ error: 'Blocked media host' });
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const upstream = await fetch(target.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'BarmanStoreMediaProxy/1.0',
        },
      });
      clearTimeout(timeout);

      if (!upstream.ok) {
        return res.status(502).json({ error: `Upstream media fetch failed (${upstream.status})` });
      }

      const contentType = String(upstream.headers.get('content-type') || '').toLowerCase();
      if (!contentType.startsWith('image/')) {
        return res.status(415).json({ error: 'Only image content is supported' });
      }

      const buffer = Buffer.from(await upstream.arrayBuffer());
      if (buffer.length > 6 * 1024 * 1024) {
        return res.status(413).json({ error: 'Image too large for proxy (max 6MB)' });
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(buffer);
    } catch (error) {
      if (String(error?.name || '').toLowerCase() === 'aborterror') {
        return res.status(504).json({ error: 'Media fetch timed out' });
      }
      return res.status(500).json({ error: error.message || 'Media proxy failed' });
    }
  });

};

module.exports = { registerMediaProxyRoutes };
