const registerPhoneChangeRoutes = (deps) => {
  const {
    app,
    requireAuth,
    requireInternalCron,
    processPendingPhoneChangeRequests,
    getLatestPhoneChangeRequestForUser,
    serializePhoneChangeRequest,
    getOpenPhoneChangeRequestForUser,
    rejectPhoneChangeRequest,
    createAppNotification,
    PHONE_CHANGE_STATUS_REJECTED,
    PHONE_CHANGE_AUTO_BATCH_SIZE,
  } = deps;

  app.get('/api/auth/phone-change-request/status', requireAuth, async (req, res) => {
    try {
      await processPendingPhoneChangeRequests({ limit: 10 });
      const row = await getLatestPhoneChangeRequestForUser(req.authUser.id);
      if (!row) {
        return res.json({
          request: null,
        });
      }
      return res.json({
        request: serializePhoneChangeRequest(row),
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to load phone change request status' });
    }
  });

  app.post('/api/auth/phone-change-request/cancel', requireAuth, async (req, res) => {
    try {
      const userId = Number(req.authUser?.id || 0);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const openRequest = await getOpenPhoneChangeRequestForUser(userId);
      if (!openRequest) {
        return res.status(404).json({ error: 'No pending phone change request found' });
      }
      const reason = String(req.body?.reason || '').trim() || 'Cancelled by user';
      const cancelled = await rejectPhoneChangeRequest({
        id: openRequest.id,
        reviewedBy: userId,
        adminNote: 'Cancelled by user',
        rejectionReason: reason,
      });
      if (!cancelled) {
        return res.status(404).json({ error: 'No pending phone change request found' });
      }
      await createAppNotification({
        userId,
        title: 'Phone update request cancelled',
        message: 'Your pending phone update request has been cancelled.',
        level: 'info',
        entityType: 'phone_change_request',
        entityId: Number(cancelled.id || 0) || null,
        metadata: {
          route: '/profile',
          status: PHONE_CHANGE_STATUS_REJECTED,
        },
        createdBy: userId,
      });
      return res.json({
        success: true,
        message: 'Pending phone update request cancelled',
        request: serializePhoneChangeRequest(cancelled),
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to cancel phone change request' });
    }
  });

  const handleInternalPhoneChangeProcess = async (req, res) => {
    try {
      const rawLimit = Number(req.body?.limit ?? req.query?.limit ?? PHONE_CHANGE_AUTO_BATCH_SIZE);
      const limit = Number.isFinite(rawLimit)
        ? Math.max(1, Math.min(250, Math.floor(rawLimit)))
        : PHONE_CHANGE_AUTO_BATCH_SIZE;
      const result = await processPendingPhoneChangeRequests({ limit });
      return res.json({
        success: true,
        limit,
        result: result || {
          auto_approved: 0,
          escalated_admin_review: 0,
          auto_rejected_invalid: 0,
          expired_rejected: 0,
          scanned_auto_candidates: 0,
          scanned_overdue_candidates: 0,
        },
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to process phone change queue' });
    }
  };

  app.get('/api/internal/phone-change/process', requireInternalCron, handleInternalPhoneChangeProcess);
  app.post('/api/internal/phone-change/process', requireInternalCron, handleInternalPhoneChangeProcess);
};

module.exports = { registerPhoneChangeRoutes };
