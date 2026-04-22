const {
  registerPhoneChangeAdminListRoutes,
  registerPhoneChangeAdminApproveRoutes,
  registerPhoneChangeAdminRejectRoutes,
} = require('./phoneChangeAdmin');

const registerPhoneChangeAdminRoutes = (deps) => {
  registerPhoneChangeAdminListRoutes(deps);
  registerPhoneChangeAdminApproveRoutes(deps);
  registerPhoneChangeAdminRejectRoutes(deps);
};

module.exports = { registerPhoneChangeAdminRoutes };
