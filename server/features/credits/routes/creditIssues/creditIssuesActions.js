const registerCreditIssuesActionsRoutes = (deps) => {
  const {
    app,
    requireAuth,
    dbGetAsync,
    dbRunAsync,
    notifyAdmins,
    normalizeCreditIssueStatus,
  } = deps;

  app.post('/api/users/:userId/credit-issues', requireAuth, async (req, res) => {
    try {
      const requestUserId = Number(req.params.userId);
      if (!requestUserId) return res.status(400).json({ error: 'Invalid user id' });
      if (Number(req.authUser?.id) !== requestUserId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const creditEntryId = Number(req.body?.credit_entry_id || 0) || null;
      const issueType = String(req.body?.issue_type || 'wrong_entry').trim().toLowerCase();
      const message = String(req.body?.message || '').trim();
      if (!message) return res.status(400).json({ error: 'Issue message is required' });
      const allowedIssueTypes = new Set(['wrong_entry', 'missing_entry', 'wrong_amount', 'other']);
      if (!allowedIssueTypes.has(issueType)) {
        return res.status(400).json({ error: 'Invalid issue type' });
      }

      let entry = null;
      if (creditEntryId) {
        entry = await dbGetAsync(`SELECT * FROM credit_history WHERE id = ? AND user_id = ?`, [creditEntryId, requestUserId]);
        if (!entry) return res.status(404).json({ error: 'Credit entry not found for this user' });
      }

      const result = await dbRunAsync(
        `INSERT INTO credit_entry_issues
         (user_id, credit_entry_id, issue_type, message, status, entry_snapshot, reported_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          requestUserId,
          creditEntryId,
          issueType,
          message,
          'open',
          entry ? JSON.stringify(entry) : null,
          req.authUser.id,
        ]
      );
      const created = await dbGetAsync(`SELECT * FROM credit_entry_issues WHERE id = ?`, [result.lastInsertRowid]);
      const reporterName = String(req.authUser?.name || '').trim() || `User #${requestUserId}`;
      await notifyAdmins({
        title: 'New credit issue reported',
        message: `${reporterName} reported issue #${created?.id || ''} (${issueType.replace(/_/g, ' ')})`,
        level: 'warning',
        entityType: 'credit_entry_issue',
        entityId: Number(created?.id || 0) || null,
        issueId: Number(created?.id || 0) || null,
        metadata: {
          user_id: requestUserId,
          issue_id: Number(created?.id || 0) || null,
          credit_entry_id: creditEntryId || null,
          issue_type: issueType,
        },
        createdBy: Number(req.authUser?.id || 0) || null,
      });
      return res.status(201).json({ success: true, issue: created });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/users/:userId/credit-issues/:id/respond', requireAuth, async (req, res) => {
    try {
      const requestUserId = Number(req.params.userId || 0);
      const issueId = Number(req.params.id || 0);
      if (!requestUserId || !issueId) {
        return res.status(400).json({ error: 'Invalid user id or issue id' });
      }
      if (Number(req.authUser?.id) !== requestUserId) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const responseStatus = String(req.body?.response_status || '').trim().toLowerCase();
      if (responseStatus !== 'acknowledged' && responseStatus !== 'disputed') {
        return res.status(400).json({ error: 'response_status must be acknowledged or disputed' });
      }
      const responseNote = String(req.body?.message || req.body?.note || '').trim() || null;
      if (responseStatus === 'disputed' && !responseNote) {
        return res.status(400).json({ error: 'Please describe what is still wrong' });
      }

      const existing = await dbGetAsync(`SELECT * FROM credit_entry_issues WHERE id = ? AND user_id = ?`, [issueId, requestUserId]);
      if (!existing) return res.status(404).json({ error: 'Credit issue not found' });

      const nextStatus = (
        responseStatus === 'disputed'
        && normalizeCreditIssueStatus(existing.status, { fallback: 'open' }) === 'corrected'
      )
        ? 'in_review'
        : normalizeCreditIssueStatus(existing.status, { fallback: 'open' });

      await dbRunAsync(
        `UPDATE credit_entry_issues
         SET status = ?,
             customer_response_status = ?,
             customer_response_note = ?,
             customer_response_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
        [nextStatus, responseStatus, responseNote, issueId, requestUserId]
      );
      const updated = await dbGetAsync(`SELECT * FROM credit_entry_issues WHERE id = ?`, [issueId]);

      await notifyAdmins({
        title: 'Customer responded to credit issue',
        message: `Issue #${issueId} response: ${responseStatus}${responseNote ? ` - ${responseNote}` : ''}`,
        level: responseStatus === 'disputed' ? 'warning' : 'info',
        entityType: 'credit_entry_issue',
        entityId: issueId,
        issueId,
        metadata: {
          user_id: requestUserId,
          issue_id: issueId,
          credit_entry_id: Number(existing?.credit_entry_id || 0) || null,
          response_status: responseStatus,
        },
        createdBy: Number(req.authUser?.id || 0) || null,
      });

      return res.json({ success: true, issue: updated });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to submit response' });
    }
  });
};

module.exports = { registerCreditIssuesActionsRoutes };
