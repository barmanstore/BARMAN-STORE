const { registerAuthFeature } = require('./registerAuthFeature');
const { createAuthSupport } = require('./authSupport');
const { sanitizeUser } = require('./userUtils');
const { createProfileImageUtils } = require('./profileImageUtils');
const { createProfileImageStorage } = require('./profileImageStorage');

module.exports = {
  registerAuthFeature,
  createAuthSupport,
  sanitizeUser,
  createProfileImageUtils,
  createProfileImageStorage,
};
