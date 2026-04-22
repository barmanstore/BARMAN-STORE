const { registerOtpRequestRoutes } = require('./otpRequestRoutes');
const { registerOtpVerifyRoutes } = require('./otpVerifyRoutes');
const { registerPasswordDisabledRoutes } = require('./passwordDisabledRoutes');

module.exports = {
  registerOtpRequestRoutes,
  registerOtpVerifyRoutes,
  registerPasswordDisabledRoutes,
};
