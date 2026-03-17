const { registerEmailVerificationRequestRoutes } = require('./requestRoutes');
const { registerEmailVerificationConfirmRoutes } = require('./confirmRoutes');
const { registerEmailVerificationStatusRoutes } = require('./statusRoutes');
const { registerEmailVerificationRequestSelfRoutes } = require('./requestSelfRoutes');

module.exports = {
  registerEmailVerificationRequestRoutes,
  registerEmailVerificationConfirmRoutes,
  registerEmailVerificationStatusRoutes,
  registerEmailVerificationRequestSelfRoutes,
};
