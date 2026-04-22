const { registerAuthRoutes } = require('./authRoutes');
const { registerUserRoutes } = require('./userRoutes');

const registerAuthFeature = (deps = {}) => {
  registerAuthRoutes(deps);
  registerUserRoutes(deps);
};

module.exports = { registerAuthFeature };
