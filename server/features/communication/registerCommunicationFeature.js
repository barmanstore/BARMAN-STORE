const { registerCommunicationRoutes } = require('./communicationRoutes');

const registerCommunicationFeature = (deps = {}) => {
  registerCommunicationRoutes(deps);
};

module.exports = { registerCommunicationFeature };
