const { registerContactVerificationAdminListRoutes } = require('./listRoutes');
const { registerContactVerificationAdminApproveRoutes } = require('./approveRoutes');
const { registerContactVerificationAdminRejectRoutes } = require('./rejectRoutes');

module.exports = {
  registerContactVerificationAdminListRoutes,
  registerContactVerificationAdminApproveRoutes,
  registerContactVerificationAdminRejectRoutes,
};
