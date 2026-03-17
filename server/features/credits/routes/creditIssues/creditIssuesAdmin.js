const { listCreditIssues } = require('./admin/listIssues');
const { resolveCreditIssue } = require('./admin/resolveIssue');

const registerCreditIssuesAdminRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbGetAsync,
    dbRunAsync,
    dbAllAsync,
    dbTxAsync,
    createAppNotification,
    notifyAdmins,
    runCustomerRequestPurge,
    logAdminAuditAsync,
    normalizeCreditIssueStatus,
    getLatestCreditEntryAsync,
    recalculateCreditBalancesForUser,
    normalizeTransactionDate,
    buildCreditTransactionTimestamp,
  } = deps;

  app.get('/api/admin/credit-issues', requireAdmin, async (req, res) => {
    try {
      const requestedStatus = String(req.query?.status || '').trim().toLowerCase();
      const rows = await listCreditIssues({
        dbAllAsync,
        runCustomerRequestPurge,
        normalizeCreditIssueStatus,
        requestedStatus,
      });
      return res.json(rows);
    } catch (error) {
      if (error?.status === 400) {
        return res.status(400).json({ error: error.message || 'Invalid status filter' });
      }
      return res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/admin/credit-issues/:id', requireAdmin, async (req, res) => {
    try {
      const issueId = Number(req.params.id);
      if (!issueId) return res.status(400).json({ error: 'Invalid issue id' });
      const { updated, issueDetails } = await resolveCreditIssue({
        req,
        issueId,
        dbGetAsync,
        dbRunAsync,
        dbTxAsync,
        createAppNotification,
        logAdminAuditAsync,
        normalizeCreditIssueStatus,
        getLatestCreditEntryAsync,
        recalculateCreditBalancesForUser,
        normalizeTransactionDate,
        buildCreditTransactionTimestamp,
      });
      return res.json({ success: true, issue: issueDetails || updated });
    } catch (error) {
      if (error?.status === 400) {
        return res.status(400).json({ error: error.message });
      }
      if (error?.code === 'NOT_FOUND') {
        return res.status(404).json({ error: 'Credit issue not found' });
      }
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerCreditIssuesAdminRoutes };
