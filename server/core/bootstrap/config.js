const { createOriginConfig } = require('../originConfig');
const { createServerConfig } = require('../config');

const createBootstrapConfig = ({
  env,
  baseDir,
  path,
  parseBooleanEnv,
  normalizeExecutionMode,
  defaultAllowedOrigins = [],
} = {}) => {
  const { corsOptions, defaultOnlineStoreUrl } = createOriginConfig({
    frontendOrigin: env.FRONTEND_ORIGIN,
    defaultAllowedOrigins,
  });

  const serverConfig = createServerConfig({
    env,
    baseDir,
    path,
    parseBooleanEnv,
    normalizeExecutionMode,
    defaultOnlineStoreUrl,
  });

  return {
    ...serverConfig,
    corsOptions,
    defaultOnlineStoreUrl,
  };
};

module.exports = { createBootstrapConfig };
