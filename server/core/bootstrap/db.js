const { createDatabaseService } = require('../dbService');

const createBootstrapDatabase = ({
  config,
  AsyncLocalStorage,
  createPostgresPool,
  pingPostgresPool,
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
  } = config;

  return createDatabaseService({
    executionMode: DB_EXECUTION_MODE,
    postgresMigrationsDir: POSTGRES_MIGRATIONS_DIR,
    createPostgresPool,
    pingPostgresPool,
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
