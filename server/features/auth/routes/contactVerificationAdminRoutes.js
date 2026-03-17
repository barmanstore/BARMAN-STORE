const {
  registerContactVerificationAdminListRoutes,
  registerContactVerificationAdminApproveRoutes,
  registerContactVerificationAdminRejectRoutes,
} = require('./contactVerificationAdmin');

const registerContactVerificationAdminRoutes = (deps) => {
  registerContactVerificationAdminListRoutes(deps);
  registerContactVerificationAdminApproveRoutes(deps);
  registerContactVerificationAdminRejectRoutes(deps);
};

module.exports = { registerContactVerificationAdminRoutes };
