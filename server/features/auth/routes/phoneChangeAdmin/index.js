const { registerPhoneChangeAdminListRoutes } = require('./listRoutes');
const { registerPhoneChangeAdminApproveRoutes } = require('./approveRoutes');
const { registerPhoneChangeAdminRejectRoutes } = require('./rejectRoutes');

module.exports = {
  registerPhoneChangeAdminListRoutes,
  registerPhoneChangeAdminApproveRoutes,
  registerPhoneChangeAdminRejectRoutes,
};
