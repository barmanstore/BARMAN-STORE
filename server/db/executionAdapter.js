const Database = require('better-sqlite3');

const normalizeExecutionMode = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'postgres' || normalized === 'pg' || normalized === 'supabase') return 'postgres';
  return normalized === 'mysql' ? 'mysql' : 'sqlite';
};

const createUnsupportedSyncError = (operation, mode) => new Error(
  `[DB] "${operation}" is a synchronous SQLite-only operation and is unavailable in DB_EXECUTION_MODE=${mode}.`
);

const createUnsupportedAdapter = (mode) => ({
  mode,
  prepare: () => { throw createUnsupportedSyncError('prepare', mode); },
  exec: () => { throw createUnsupportedSyncError('exec', mode); },
  pragma: () => { throw createUnsupportedSyncError('pragma', mode); },
  transaction: () => { throw createUnsupportedSyncError('transaction', mode); },
  close: () => {},
  reopen: () => {},
});

const createSqliteAdapter = ({ sqlitePath }) => {
  let sqlite = new Database(sqlitePath);

  return {
    mode: 'sqlite',
    prepare: (sql) => sqlite.prepare(sql),
    exec: (sql) => sqlite.exec(sql),
    pragma: (statement) => sqlite.pragma(statement),
    transaction: (handler) => sqlite.transaction(handler),
    close: () => {
      try {
        if (sqlite) sqlite.close();
      } catch (_) {
        // ignore close failures
      }
    },
    reopen: () => {
      try {
        if (sqlite) sqlite.close();
      } catch (_) {
        // ignore close failures
      }
      sqlite = new Database(sqlitePath);
    },
  };
};

const createExecutionAdapter = ({ mode = 'sqlite', sqlitePath }) => {
  const resolvedMode = normalizeExecutionMode(mode);
  if (resolvedMode === 'mysql') return createUnsupportedAdapter('mysql');
  if (resolvedMode === 'postgres') return createUnsupportedAdapter('postgres');
  return createSqliteAdapter({ sqlitePath });
};

module.exports = {
  createExecutionAdapter,
  normalizeExecutionMode,
};
