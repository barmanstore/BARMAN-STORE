const createUnsupportedModeError = (mode) => new Error(
  `[DB] DB_EXECUTION_MODE=${mode} is no longer supported. Use DB_EXECUTION_MODE=postgres or sqlite.`
);

const createPostgresSyncNotSupportedError = (operation) => new Error(
  `[DB] Postgres adapter does not support synchronous "${operation}". Use async DB helpers.`
);

const createPostgresPoolNotReadyError = () => new Error(
  '[DB] Postgres pool is not initialized. Check DB_EXECUTION_MODE/DB_CLIENT and SUPABASE/PG connection settings.'
);

const resolveMode = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'postgres' || normalized === 'pg' || normalized === 'supabase') return 'postgres';
  if (normalized === 'mysql') return 'mysql';
  return 'sqlite';
};

const normalizePostgresRunResult = (result) => ({
  changes: Number(result?.rowCount || 0),
  lastInsertRowid: Number(result?.rows?.[0]?.id || 0),
});

const convertQuestionParamsToPostgres = (sql) => {
  let out = '';
  let index = 1;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      out += char;
      if (char === '\n') inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      out += char;
      if (char === '*' && next === '/') {
        out += next;
        i += 1;
        inBlockComment = false;
      }
      continue;
    }

    if (!inSingle && !inDouble) {
      if (char === '-' && next === '-') {
        out += char + next;
        i += 1;
        inLineComment = true;
        continue;
      }
      if (char === '/' && next === '*') {
        out += char + next;
        i += 1;
        inBlockComment = true;
        continue;
      }
    }

    if (char === '\'' && !inDouble) {
      out += char;
      if (inSingle && next === '\'') {
        out += next;
        i += 1;
      } else {
        inSingle = !inSingle;
      }
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      out += char;
      continue;
    }

    if (char === '?' && !inSingle && !inDouble) {
      out += `$${index}`;
      index += 1;
      continue;
    }

    out += char;
  }

  return out;
};

const appendReturningIdIfInsert = (sql) => {
  const trimmed = String(sql || '').trim();
  if (!/^insert\s+into\s+/i.test(trimmed)) return sql;
  if (/\breturning\b/i.test(trimmed)) return sql;
  if (/;\s*$/.test(sql)) return sql.replace(/;\s*$/, ' RETURNING id;');
  return `${sql} RETURNING id`;
};

const createPostgresQueryAdapter = ({ getPostgresPool }) => {
  const withPool = async (handler) => {
    const pool = typeof getPostgresPool === 'function' ? getPostgresPool() : null;
    if (!pool) throw createPostgresPoolNotReadyError();
    return handler(pool);
  };

  const execute = async (runner, sql, params = [], { forRun = false } = {}) => {
    const transformed = convertQuestionParamsToPostgres(
      forRun ? appendReturningIdIfInsert(sql) : sql
    );
    return runner.query(transformed, params);
  };

  return {
    mode: 'postgres',
    run: () => { throw createPostgresSyncNotSupportedError('run'); },
    runAsync: async (sql, params = []) => withPool(async (pool) => {
      const result = await execute(pool, sql, params, { forRun: true });
      return normalizePostgresRunResult(result);
    }),
    get: () => { throw createPostgresSyncNotSupportedError('get'); },
    getAsync: async (sql, params = []) => withPool(async (pool) => {
      const result = await execute(pool, sql, params);
      return result?.rows?.[0];
    }),
    all: () => { throw createPostgresSyncNotSupportedError('all'); },
    allAsync: async (sql, params = []) => withPool(async (pool) => {
      const result = await execute(pool, sql, params);
      return result?.rows || [];
    }),
    prepare: () => { throw createPostgresSyncNotSupportedError('prepare'); },
    transaction: () => (..._args) => {
      throw createPostgresSyncNotSupportedError('transaction');
    },
    transactionAsync: async (handler, ...args) => withPool(async (pool) => {
      const connection = await pool.connect();
      const tx = {
        runAsync: async (sql, params = []) => {
          const result = await execute(connection, sql, params, { forRun: true });
          return normalizePostgresRunResult(result);
        },
        getAsync: async (sql, params = []) => {
          const result = await execute(connection, sql, params);
          return result?.rows?.[0];
        },
        allAsync: async (sql, params = []) => {
          const result = await execute(connection, sql, params);
          return result?.rows || [];
        },
      };
      try {
        await connection.query('BEGIN');
        const result = await handler(tx, ...args);
        await connection.query('COMMIT');
        return result;
      } catch (error) {
        try {
          await connection.query('ROLLBACK');
        } catch (_) {
          // ignore rollback failures
        }
        throw error;
      } finally {
        connection.release();
      }
    }),
  };
};

const createUnsupportedQueryAdapter = (mode) => {
  const raise = () => { throw createUnsupportedModeError(mode); };
  return {
    mode,
    run: raise,
    runAsync: async () => raise(),
    get: raise,
    getAsync: async () => raise(),
    all: raise,
    allAsync: async () => raise(),
    prepare: raise,
    transaction: () => { throw createUnsupportedModeError(mode); },
    transactionAsync: async () => raise(),
  };
};

const createSqliteQueryAdapter = ({ db }) => ({
  mode: 'sqlite',
  run: (sql, params = []) => db.prepare(sql).run(params),
  runAsync: async (sql, params = []) => db.prepare(sql).run(params),
  get: (sql, params = []) => db.prepare(sql).get(params),
  getAsync: async (sql, params = []) => db.prepare(sql).get(params),
  all: (sql, params = []) => db.prepare(sql).all(params),
  allAsync: async (sql, params = []) => db.prepare(sql).all(params),
  prepare: (sql) => db.prepare(sql),
  transaction: (handler) => db.transaction(handler),
  transactionAsync: async (handler, ...args) => {
    const tx = {
      runAsync: async (sql, params = []) => db.prepare(sql).run(params),
      getAsync: async (sql, params = []) => db.prepare(sql).get(params),
      allAsync: async (sql, params = []) => db.prepare(sql).all(params),
    };
    db.exec('BEGIN');
    try {
      const result = await handler(tx, ...args);
      db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch (_) {
        // ignore rollback failures
      }
      throw error;
    }
  },
});

const createQueryAdapter = ({ mode = 'sqlite', db, getPostgresPool = null }) => {
  const resolvedMode = resolveMode(mode);
  if (resolvedMode === 'mysql') {
    return createUnsupportedQueryAdapter('mysql');
  }
  if (resolvedMode === 'postgres') {
    return createPostgresQueryAdapter({ getPostgresPool });
  }
  return createSqliteQueryAdapter({ db });
};

module.exports = {
  createQueryAdapter,
};
