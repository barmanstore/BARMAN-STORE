const { registerPhoneChangeAdminRoutes } = require('./routes/phoneChangeAdminRoutes');
const { registerContactVerificationAdminRoutes } = require('./routes/contactVerificationAdminRoutes');
const { registerUserVerificationAdminRoutes } = require('./routes/userVerificationAdminRoutes');
const { registerUserCrudRoutes } = require('./routes/userCrudRoutes');
const { registerCustomerRoutes } = require('./routes/customerRoutes');
const { registerCustomerValidationRoutes } = require('./routes/customerValidationRoutes');

const registerUserRoutes = (deps) => {
  registerPhoneChangeAdminRoutes(deps);
  registerContactVerificationAdminRoutes(deps);
  registerUserVerificationAdminRoutes(deps);
  registerUserCrudRoutes(deps);
  registerCustomerRoutes(deps);
  registerCustomerValidationRoutes(deps);
};

module.exports = { registerUserRoutes };
