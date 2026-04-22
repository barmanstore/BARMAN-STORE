const { createDatabaseService } = require('../dbService');

const createBootstrapDatabase = ({
  config,
  AsyncLocalStorage,
  createPostgresPool,
  pingPostgresPool,
  getPostgresConnectionCandidatesFromEnv,
  getPostgresConnectionLabel,
  applyPostgresMigrations,
  ensurePostgresBootstrapData,
  createQueryAdapter,
  normalizeEmail,
  isStrongPassword,
  hashPassword,
  generateSku,
} = {}) => {
  const {
    DB_EXECUTION_MODE,
    POSTGRES_MIGRATIONS_DIR,
    POSTGRES_RUN_MIGRATIONS_ON_STARTUP,
    POSTGRES_RUN_BOOTSTRAP_ON_STARTUP,
  } = config;

  return createDatabaseService({
    executionMode: DB_EXECUTION_MODE,
    postgresMigrationsDir: POSTGRES_MIGRATIONS_DIR,
    runMigrationsOnStartup: POSTGRES_RUN_MIGRATIONS_ON_STARTUP,
    runBootstrapOnStartup: POSTGRES_RUN_BOOTSTRAP_ON_STARTUP,
    createPostgresPool,
    pingPostgresPool,
    getPostgresConnectionCandidatesFromEnv,
    getPostgresConnectionLabel,
    applyPostgresMigrations,
    ensurePostgresBootstrapData,
    createQueryAdapter,
    AsyncLocalStorage,
    normalizeEmail,
    isStrongPassword,
    hashPassword,
    generateSku,
  });
};

module.exports = { createBootstrapDatabase };
