const { createRuntimeConfig } = require('./configParts/runtimeConfig');
const { createAuthConfig } = require('./configParts/authConfig');
const { createPhoneChangeConfig } = require('./configParts/phoneChangeConfig');
const { createNotificationConfig } = require('./configParts/notificationConfig');
const { createBusinessConfig } = require('./configParts/businessConfig');

const createServerConfig = ({
  env,
  baseDir,
  path,
  parseBooleanEnv,
  normalizeExecutionMode,
  defaultOnlineStoreUrl,
} = {}) => {
  const runtimeConfig = createRuntimeConfig({
    env,
    baseDir,
    path,
    parseBooleanEnv,
    normalizeExecutionMode,
  });
  const authConfig = createAuthConfig({
    env,
    parseBooleanEnv,
    defaultOnlineStoreUrl,
  });
  const phoneChangeConfig = createPhoneChangeConfig({ env, parseBooleanEnv });
  const notificationConfig = createNotificationConfig({ env, parseBooleanEnv });
  const businessConfig = createBusinessConfig({ env });

  if (env.NODE_ENV === 'production' && !env.AUTH_TOKEN_SECRET) {
    throw new Error('AUTH_TOKEN_SECRET must be set in production');
  }

  return {
    ...runtimeConfig,
    ...authConfig,
    ...phoneChangeConfig,
    ...notificationConfig,
    ...businessConfig,
  };
};

module.exports = { createServerConfig };
