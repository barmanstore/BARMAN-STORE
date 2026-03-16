const { registerAuthSessionRoutes } = require('./routes/sessionRoutes');
const { registerOtpRoutes } = require('./routes/otpRoutes');
const { registerEmailVerificationRoutes } = require('./routes/emailVerificationRoutes');
const { registerPhoneVerificationRoutes } = require('./routes/phoneVerificationRoutes');
const { registerPhoneChangeRoutes } = require('./routes/phoneChangeRoutes');
const { registerContactVerificationRoutes } = require('./routes/contactVerificationRoutes');
const { registerAuthResetModeRoutes } = require('./routes/resetModeRoutes');

const registerAuthRoutes = (deps) => {
  registerAuthSessionRoutes(deps);
  registerOtpRoutes(deps);
  registerEmailVerificationRoutes(deps);
  registerPhoneVerificationRoutes(deps);
  registerPhoneChangeRoutes(deps);
  registerContactVerificationRoutes(deps);
  registerAuthResetModeRoutes(deps);
};

module.exports = { registerAuthRoutes };
