const registerRecommendationRoutes = (deps) => {
  const {
    app,
    requireAuth,
    requireAdmin,
    dbGetAsync,
    dbRunAsync,
    dbAllAsync,
    dbTxAsync,
    parsePhoneInput,
    createAppNotification,
    notifyAdmins,
    runCustomerRequestPurge,
    logAdminAuditAsync,
    normalizeCreditIssueStatus,
    getLatestCreditEntryAsync,
    buildPaymentActivityBadges,
    recalculateCreditBalancesForUser,
    normalizeTransactionDate,
    buildCreditTransactionTimestamp,
    CREDIT_ENTRY_DEDUP_WINDOW_MS,
    toTimestampMs,
    resolveClientRequestId,
    isUniqueViolationError,
  } = deps;

  app.post('/api/product-recommendations', requireAuth, async (req, res) => {
    try {
      const requestedName = String(req.body?.requested_name || req.body?.name || '').trim();
      const notes = String(req.body?.notes || '').trim();
      const phoneParsed = parsePhoneInput(req.body?.contact_phone || req.body?.phone || req.authUser?.phone || null);
      if (phoneParsed.error && (req.body?.contact_phone || req.body?.phone)) {
        return res.status(400).json({ error: phoneParsed.error });
      }
      if (!requestedName) {
        return res.status(400).json({ error: 'Requested product name is required' });
      }
      const result = await dbRunAsync(
        `INSERT INTO product_recommendations (user_id, requested_name, notes, contact_phone, status)
         VALUES (?, ?, ?, ?, ?)`,
        [req.authUser.id, requestedName, notes || null, phoneParsed.value || null, 'open']
      );
      const created = await dbGetAsync(`SELECT * FROM product_recommendations WHERE id = ?`, [result.lastInsertRowid]);
      const recommendationId = Number(created?.id || 0) || Number(result.lastInsertRowid || 0) || null;
      try {
        await createAppNotification({
          userId: Number(req.authUser?.id || 0),
          title: 'Product request received',
          message: `Your product request "${requestedName}" was submitted.`,
          level: 'success',
          entityType: 'product_recommendation',
          entityId: recommendationId,
          metadata: {
            recommendation_id: recommendationId,
            user_id: Number(req.authUser?.id || 0) || null,
            requested_name: requestedName,
            status: 'open',
          },
          createdBy: Number(req.authUser?.id || 0) || null,
        });
        await notifyAdmins({
          title: 'New product request',
          message: `${String(req.authUser?.name || '').trim() || `User #${req.authUser?.id}`} requested "${requestedName}".`,
          level: 'info',
          entityType: 'product_recommendation',
          entityId: recommendationId,
          metadata: {
            recommendation_id: recommendationId,
            user_id: Number(req.authUser?.id || 0) || null,
            requested_name: requestedName,
            status: 'open',
          },
          createdBy: Number(req.authUser?.id || 0) || null,
        });
      } catch (notifyError) {
        console.warn('[NOTIFY] product recommendation notification failed:', notifyError?.message || notifyError);
      }
      return res.status(201).json({ success: true, recommendation: created });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  
  app.get('/api/product-recommendations/mine', requireAuth, async (req, res) => {
    try {
      await runCustomerRequestPurge();
      const rows = await dbAllAsync(
        `SELECT *
         FROM product_recommendations
         WHERE user_id = ?
         ORDER BY created_at DESC`,
        [req.authUser.id]
      );
      return res.json(rows);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  
  app.get('/api/admin/product-recommendations', requireAdmin, async (req, res) => {
    try {
      await runCustomerRequestPurge();
      const status = String(req.query?.status || '').trim().toLowerCase();
      const allowed = new Set(['open', 'reviewed', 'fulfilled', 'rejected']);
      const rows = await dbAllAsync(
        `SELECT pr.*,
                u.name as user_name,
                u.email as user_email,
                u.phone as user_phone
         FROM product_recommendations pr
         LEFT JOIN users u ON u.id = pr.user_id
         ${allowed.has(status) ? 'WHERE pr.status = ?' : ''}
         ORDER BY pr.created_at DESC`,
        allowed.has(status) ? [status] : []
      );
      return res.json(rows);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  
  app.put('/api/admin/product-recommendations/:id', requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid recommendation id' });
      const status = String(req.body?.status || '').trim().toLowerCase();
      const allowed = new Set(['open', 'reviewed', 'fulfilled', 'rejected']);
      if (!allowed.has(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      const adminNote = String(req.body?.admin_note || '').trim() || null;
      const current = await dbGetAsync(`SELECT * FROM product_recommendations WHERE id = ?`, [id]);
      if (!current) return res.status(404).json({ error: 'Recommendation not found' });
      await dbRunAsync(
        `UPDATE product_recommendations
         SET status = ?, admin_note = ?, resolved_by = ?, resolved_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          status,
          adminNote,
          req.authUser.id,
          status === 'fulfilled' || status === 'rejected' ? new Date().toISOString() : null,
          id,
        ]
      );
      const updated = await dbGetAsync(`SELECT * FROM product_recommendations WHERE id = ?`, [id]);
      await logAdminAuditAsync(req, {
        action: 'product_recommendation.update',
        entityType: 'product_recommendation',
        entityId: id,
        details: { status, admin_note: adminNote },
      });
      try {
        if (Number(updated?.user_id || 0)) {
          await createAppNotification({
            userId: Number(updated.user_id),
            title: 'Product request updated',
            message: `Your product request "${updated.requested_name || `#${id}`}" is now ${status.replace(/_/g, ' ')}${adminNote ? `: ${adminNote}` : ''}.`,
            level: status === 'fulfilled' ? 'success' : (status === 'rejected' ? 'warning' : 'info'),
            entityType: 'product_recommendation',
            entityId: id,
            metadata: {
              recommendation_id: id,
              user_id: Number(updated.user_id || 0) || null,
              status,
            },
            createdBy: Number(req.authUser?.id || 0) || null,
          });
        }
      } catch (notifyError) {
        console.warn('[NOTIFY] product recommendation update notification failed:', notifyError?.message || notifyError);
      }
      return res.json({ success: true, recommendation: updated });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  
};

module.exports = { registerRecommendationRoutes };
