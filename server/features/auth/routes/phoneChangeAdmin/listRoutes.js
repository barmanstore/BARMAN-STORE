const registerPhoneChangeAdminListRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbAllAsync,
    runCustomerRequestPurge,
    processPendingPhoneChangeRequests,
    getPhoneMergeImpactSummary,
    serializePhoneChangeRequest,
    PHONE_CHANGE_STATUS_PENDING,
    PHONE_CHANGE_STATUS_APPROVED,
    PHONE_CHANGE_STATUS_REJECTED,
  } = deps;

  app.get('/api/admin/phone-change-requests', requireAdmin, async (req, res) => {
    try {
      await runCustomerRequestPurge();
      await processPendingPhoneChangeRequests();
      const statusFilter = String(req.query?.status || 'open').trim().toLowerCase();
      const params = [];
      let whereClause = '';
      if (statusFilter === 'open') {
        whereClause = 'WHERE pcr.status = ? AND COALESCE(pcr.needs_admin_review, 0) = 1';
        params.push(PHONE_CHANGE_STATUS_PENDING);
      } else if (statusFilter === 'pending_validation') {
        whereClause = 'WHERE pcr.status = ?';
        params.push(PHONE_CHANGE_STATUS_PENDING);
      } else if (statusFilter === 'approved') {
        whereClause = 'WHERE pcr.status = ?';
        params.push(PHONE_CHANGE_STATUS_APPROVED);
      } else if (statusFilter === 'rejected') {
        whereClause = 'WHERE pcr.status = ?';
        params.push(PHONE_CHANGE_STATUS_REJECTED);
      } else if (statusFilter !== 'all') {
        return res.status(400).json({ error: 'Invalid status filter' });
      }

      const rows = await dbAllAsync(
        `SELECT pcr.*,
                u.name AS user_name,
                u.email AS user_email,
                u.phone AS user_phone,
                cu.name AS conflict_user_name,
                cu.email AS conflict_user_email,
                r.name AS reviewed_by_name
         FROM phone_change_requests pcr
         LEFT JOIN users u ON u.id = pcr.user_id
         LEFT JOIN users cu ON cu.id = pcr.conflict_user_id
         LEFT JOIN users r ON r.id = pcr.reviewed_by
         ${whereClause}
         ORDER BY
           CASE pcr.status
             WHEN '${PHONE_CHANGE_STATUS_PENDING}' THEN 0
             WHEN '${PHONE_CHANGE_STATUS_APPROVED}' THEN 1
             WHEN '${PHONE_CHANGE_STATUS_REJECTED}' THEN 2
             ELSE 9
           END,
           COALESCE(pcr.needs_admin_review, 0) DESC,
           pcr.created_at DESC,
           pcr.id DESC`,
        params
      );
      const payload = await Promise.all((rows || []).map(async (row) => {
        const conflictUserId = Number(row?.conflict_user_id || 0) || null;
        const mergeImpact = conflictUserId ? await getPhoneMergeImpactSummary(conflictUserId) : null;
        return {
          ...serializePhoneChangeRequest(row),
          user_name: row.user_name || null,
          user_email: row.user_email || null,
          user_phone: row.user_phone || null,
          conflict_user_name: row.conflict_user_name || null,
          conflict_user_email: row.conflict_user_email || null,
          reviewed_by_name: row.reviewed_by_name || null,
          merge_impact: mergeImpact,
        };
      }));
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to load phone change requests' });
    }
  });
};

module.exports = { registerPhoneChangeAdminListRoutes };
