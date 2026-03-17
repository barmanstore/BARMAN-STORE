const registerContactVerificationAdminRejectRoutes = (deps) => {
  const { app, requireAdmin, dbGetAsync, rejectContactVerificationRequest } = deps;

  app.post('/api/admin/contact-verification-requests/:id/reject', requireAdmin, async (req, res) => {
    try {
      const requestId = Number(req.params.id || 0);
      if (!requestId) return res.status(400).json({ error: 'Invalid request id' });
      const requestRow = await dbGetAsync('SELECT * FROM contact_verification_requests WHERE id = ?', [requestId]);
      if (!requestRow) return res.status(404).json({ error: 'Verification request not found' });

      if (!['pending', 'sent'].includes(String(requestRow.status || '').toLowerCase())) {
        return res.status(400).json({ error: `Cannot reject request in status "${requestRow.status}"` });
      }

      const updated = await rejectContactVerificationRequest({
        id: requestId,
        processedBy: Number(req.authUser?.id || 0) || null,
        adminNote: req.body?.admin_note || null,
        rejectionReason: req.body?.rejection_reason || null,
      });
      return res.json({ success: true, request: updated });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to reject verification request' });
    }
  });
};

module.exports = { registerContactVerificationAdminRejectRoutes };
