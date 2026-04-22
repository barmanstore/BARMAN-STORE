const {
  registerOtpRequestRoutes,
  registerOtpVerifyRoutes,
  registerPasswordDisabledRoutes,
} = require('./otp');

const registerOtpRoutes = (deps) => {
  registerOtpRequestRoutes(deps);
  registerOtpVerifyRoutes(deps);
  registerPasswordDisabledRoutes(deps);
};

module.exports = { registerOtpRoutes };
