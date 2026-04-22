const createDatabaseService = ({
  executionMode,
  postgresMigrationsDir,
  runMigrationsOnStartup = true,
  runBootstrapOnStartup = true,
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
} = {}) => {
  let postgresPool = null;
  const dbQuery = createQueryAdapter({
    mode: executionMode,
    getPostgresPool: () => postgresPool,
  });
  const txStorage = new AsyncLocalStorage();
  const getActiveTransaction = () => txStorage.getStore();

  const dbRunAsync = (sql, params = []) => {
    const tx = getActiveTransaction();
    return tx ? tx.runAsync(sql, params) : dbQuery.runAsync(sql, params);
  };
  const dbGetAsync = (sql, params = []) => {
    const tx = getActiveTransaction();
    return tx ? tx.getAsync(sql, params) : dbQuery.getAsync(sql, params);
  };
  const dbAllAsync = (sql, params = []) => {
    const tx = getActiveTransaction();
    return tx ? tx.allAsync(sql, params) : dbQuery.allAsync(sql, params);
  };
  const dbTxAsync = (handler, ...args) =>
    dbQuery.transactionAsync(
      async (tx, ...handlerArgs) => txStorage.run(tx, () => handler(...handlerArgs)),
      ...args
    );

  let runtimeBootstrapError = null;
  const startDatabaseScaffolding = async () => {
    console.log(`[DB] Execution mode: ${executionMode}`);

    try {
      const connectionCandidates =
        typeof getPostgresConnectionCandidatesFromEnv === 'function'
          ? getPostgresConnectionCandidatesFromEnv()
          : [{ name: 'primary', config: null, label: getPostgresConnectionLabel() }];
      const connectionFailures = [];

      for (const candidate of connectionCandidates) {
        const candidateLabel = String(candidate?.label || '').trim() || getPostgresConnectionLabel();
        const candidateName = String(candidate?.name || 'primary').trim() || 'primary';
        const pool = createPostgresPool(candidate?.config || null);

        try {
          await pingPostgresPool(pool);
          postgresPool = pool;
          console.log(`[DB] Postgres connected (${candidateLabel})`);
          if (candidateName === 'fallback') {
            console.warn(
              `[DB] Primary database unavailable. Using fallback database (${candidateLabel}).`
            );
          }
          break;
        } catch (error) {
          connectionFailures.push(`${candidateName}:${error.message}`);
          try {
            await pool.end();
          } catch (_) {
            // ignore close failures
          }
        }
      }

      if (!postgresPool) {
        throw new Error(
          connectionFailures.length
            ? connectionFailures.join(' | ')
            : 'No Postgres connection candidates configured'
        );
      }

      if (runMigrationsOnStartup) {
        const migrationResult = await applyPostgresMigrations(postgresPool, postgresMigrationsDir);
        if (migrationResult.applied.length) {
          console.log(
            `[DB] Postgres migrations applied (${migrationResult.applied.length}/${migrationResult.total}): ${migrationResult.applied.join(', ')}`
          );
        } else {
          console.log(`[DB] Postgres migrations up-to-date (${migrationResult.total} files).`);
        }
      } else {
        console.log('[DB] Skipping Postgres migrations during runtime startup.');
      }

      if (runBootstrapOnStartup) {
        await ensurePostgresBootstrapData({
          pool: postgresPool,
          normalizeEmail,
          isStrongPassword,
          hashPassword,
          generateSku,
        });
        console.log('[DB] Postgres bootstrap completed');
      } else {
        console.log('[DB] Skipping Postgres bootstrap during runtime startup.');
      }

      runtimeBootstrapError = null;
      return true;
    } catch (error) {
      runtimeBootstrapError =
        error instanceof Error
          ? error
          : new Error(String(error || 'Unknown database initialization error'));
      console.error(
        `[DB] Postgres/Supabase initialization failed: ${runtimeBootstrapError.message}`
      );
      await closePostgresScaffold();
      return false;
    }
  };

  let runtimeReadyPromise = null;
  const ensureRuntimeReady = async () => {
    if (runtimeReadyPromise) return runtimeReadyPromise;
    runtimeReadyPromise = (async () => {
      const ready = await startDatabaseScaffolding();
      if (!ready) {
        if (runtimeBootstrapError?.message) {
          throw new Error(`Database initialization failed: ${runtimeBootstrapError.message}`);
        }
        throw new Error('Database initialization failed');
      }
    })();
    try {
      await runtimeReadyPromise;
    } catch (error) {
      runtimeReadyPromise = null;
      throw error;
    }
    return runtimeReadyPromise;
  };

  const closePostgresScaffold = async () => {
    if (!postgresPool) return;
    const pool = postgresPool;
    postgresPool = null;
    try {
      await pool.end();
    } catch (_) {
      // ignore close failures
    }
  };

  return {
    dbRunAsync,
    dbGetAsync,
    dbAllAsync,
    dbTxAsync,
    ensureRuntimeReady,
    closePostgresScaffold,
    getActiveTransaction,
  };
};

module.exports = { createDatabaseService };
