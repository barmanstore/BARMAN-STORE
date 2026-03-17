const {
  registerEmailVerificationRequestRoutes,
  registerEmailVerificationConfirmRoutes,
  registerEmailVerificationStatusRoutes,
  registerEmailVerificationRequestSelfRoutes,
} = require('./emailVerification');

const registerEmailVerificationRoutes = (deps) => {
  registerEmailVerificationRequestRoutes(deps);
  registerEmailVerificationConfirmRoutes(deps);
  registerEmailVerificationStatusRoutes(deps);
  registerEmailVerificationRequestSelfRoutes(deps);
};

module.exports = { registerEmailVerificationRoutes };
