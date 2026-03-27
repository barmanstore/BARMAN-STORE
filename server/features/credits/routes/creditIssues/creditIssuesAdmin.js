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
    getCustomerCreditProfileAsync,
    recalculateCreditBalancesForUser,
    rebuildCustomerPaymentIntelligence,
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
      const status = Number(error?.status || 0) || 500;
      return res.status(status).json({ error: error?.message || 'Failed to load credit issues' });
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
        getCustomerCreditProfileAsync,
        recalculateCreditBalancesForUser,
        rebuildCustomerPaymentIntelligence,
        normalizeTransactionDate,
        buildCreditTransactionTimestamp,
      });
      return res.json({ success: true, issue: issueDetails || updated });
    } catch (error) {
      const status = Number(error?.status || 0) || (error?.code === 'NOT_FOUND' ? 404 : 500);
      const message = error?.message || (status === 404 ? 'Credit issue not found' : 'Failed to update credit issue');
      return res.status(status).json({ error: message });
    }
  });
};

module.exports = { registerCreditIssuesAdminRoutes };
