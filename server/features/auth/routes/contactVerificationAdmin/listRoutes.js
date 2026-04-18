const registerContactVerificationAdminListRoutes = (deps) => {
  const { app, requireAdmin, dbAllAsync } = deps;

  app.get('/api/admin/contact-verification-requests', requireAdmin, async (req, res) => {
    try {
      const statusFilter = String(req.query?.status || 'open')
        .trim()
        .toLowerCase();
      const allowedStatuses = new Set(['pending', 'sent', 'rejected', 'completed']);
      const params = [];
      let whereClause = '';
      if (statusFilter === 'open') {
        whereClause = `WHERE cvr.status IN ('pending', 'sent')`;
      } else if (statusFilter === 'all') {
        whereClause = '';
      } else if (allowedStatuses.has(statusFilter)) {
        whereClause = 'WHERE cvr.status = ?';
        params.push(statusFilter);
      } else {
        return res.status(400).json({ error: 'Invalid status filter' });
      }

      const rows = await dbAllAsync(
        `SELECT cvr.*,
                u.name AS user_name,
                u.email AS user_email,
                u.phone AS user_phone,
                u.email_verified,
                u.phone_verified,
                p.name AS processed_by_name
         FROM contact_verification_requests cvr
         LEFT JOIN users u ON u.id = cvr.user_id
         LEFT JOIN users p ON p.id = cvr.processed_by
         ${whereClause}
         ORDER BY
           CASE cvr.status
             WHEN 'pending' THEN 0
             WHEN 'sent' THEN 1
             WHEN 'rejected' THEN 2
             WHEN 'completed' THEN 3
             ELSE 9
           END,
           cvr.created_at DESC,
           cvr.id DESC`,
        params
      );
      return res.json(rows);
    } catch (error) {
      return res
        .status(500)
        .json({ error: error.message || 'Failed to load verification requests' });
    }
  });
};

module.exports = { registerContactVerificationAdminListRoutes };
