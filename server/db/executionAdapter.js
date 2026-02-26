const normalizeExecutionMode = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'postgres';
  if (normalized === 'postgres' || normalized === 'pg' || normalized === 'supabase') return 'postgres';
  throw new Error(`[DB] Unsupported DB_EXECUTION_MODE=${value}. Only "postgres" is supported.`);
};

const createUnsupportedSyncError = (operation, mode) => new Error(
  `[DB] "${operation}" is unavailable in DB_EXECUTION_MODE=${mode}. Use async DB helpers with postgres mode.`
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

const createExecutionAdapter = ({ mode = 'postgres' }) => {
  const resolvedMode = normalizeExecutionMode(mode);
  if (resolvedMode === 'postgres') return createUnsupportedAdapter('postgres');
  throw new Error(`[DB] Unsupported DB execution adapter mode: ${resolvedMode}`);
};

module.exports = {
  createExecutionAdapter,
  normalizeExecutionMode,
};
