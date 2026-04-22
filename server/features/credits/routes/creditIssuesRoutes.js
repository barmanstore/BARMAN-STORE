const { registerCreditIssuesListRoutes } = require('./creditIssues/creditIssuesList');
const { registerCreditIssuesActionsRoutes } = require('./creditIssues/creditIssuesActions');
const { registerCreditIssuesAdminRoutes } = require('./creditIssues/creditIssuesAdmin');

const registerCreditIssuesRoutes = (deps) => {
  registerCreditIssuesListRoutes(deps);
  registerCreditIssuesActionsRoutes(deps);
  registerCreditIssuesAdminRoutes(deps);
};

module.exports = { registerCreditIssuesRoutes };
