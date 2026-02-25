require('../server/loadEnv');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { normalizeExecutionMode } = require('../server/db/executionAdapter');
const {
  createPostgresPool,
  getPostgresConnectionLabel,
  pingPostgresPool,
} = require('../server/db/postgresScaffold');

const DEFAULT_TABLE_ORDER = [
  'users',
  'categories',
  'products',
  'distributors',
  'offers',
  'orders',
  'purchase_orders',
  'purchase_returns',
  'bills',
  'import_batches',
  'visitor_sessions',
  'order_items',
  'order_status_history',
  'purchase_order_items',
  'purchase_return_items',
  'bill_items',
  'stock_ledger',
  'credit_history',
  'distributor_ledger',
  'messages',
  'password_reset_requests',
  'password_reset_otps',
  'password_reset_sessions',
  'email_verification_tokens',
  'phone_verification_tokens',
  'contact_verification_requests',
  'notification_events',
];

const parseArgs = (argv) => {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] || '');
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || String(next).startsWith('--')) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
};

const quoteIdent = (value) => `"${String(value).replace(/"/g, '""')}"`;

const toPgNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const normalizeCell = (value, meta) => {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  if (typeof value === 'string' && value === '' && meta?.isNullable) return null;
  return value;
};

const getSourceTables = (sqlite) => sqlite
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all()
  .map((row) => String(row.name));

const getSourceColumns = (sqlite, tableName) => sqlite
  .prepare(`PRAGMA table_info(${quoteIdent(tableName)})`)
  .all()
  .map((row) => String(row.name));

const getTargetColumnMeta = async (pool) => {
  const result = await pool.query(`
    SELECT table_name, column_name, is_nullable, data_type, ordinal_position
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);

  const meta = new Map();
  for (const row of result.rows) {
    const table = String(row.table_name);
    const column = String(row.column_name);
    if (!meta.has(table)) meta.set(table, []);
    meta.get(table).push({
      column,
      isNullable: String(row.is_nullable).toUpperCase() === 'YES',
      dataType: String(row.data_type || '').toLowerCase(),
    });
  }
  return meta;
};

const buildOrderedTables = ({ sourceTables, targetTables, explicitTables }) => {
  const sourceSet = new Set(sourceTables);
  const targetSet = new Set(targetTables);
  let intersection = [...sourceSet].filter((name) => targetSet.has(name));
  if (explicitTables.length) {
    const explicitSet = new Set(explicitTables);
    intersection = intersection.filter((name) => explicitSet.has(name));
  }
  const orderedPrimary = DEFAULT_TABLE_ORDER.filter((name) => intersection.includes(name));
  const orderedRemainder = intersection
    .filter((name) => !orderedPrimary.includes(name))
    .sort((a, b) => a.localeCompare(b));
  return [...orderedPrimary, ...orderedRemainder];
};

const insertBatch = async ({ pool, tableName, columns, rows, mode }) => {
  if (!rows.length) return;

  const params = [];
  const valuesSql = rows.map((row, rowIndex) => {
    const placeholders = row.map((cell, cellIndex) => {
      params.push(cell);
      return `$${rowIndex * columns.length + cellIndex + 1}`;
    });
    return `(${placeholders.join(', ')})`;
  }).join(', ');

  const tableSql = quoteIdent(tableName);
  const columnsSql = columns.map(quoteIdent).join(', ');
  let sql = `INSERT INTO ${tableSql} (${columnsSql}) VALUES ${valuesSql}`;

  if (mode === 'upsert') {
    const hasId = columns.includes('id');
    if (hasId) {
      const updates = columns
        .filter((column) => column !== 'id')
        .map((column) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`);
      if (updates.length) {
        sql += ` ON CONFLICT (${quoteIdent('id')}) DO UPDATE SET ${updates.join(', ')}`;
      } else {
        sql += ` ON CONFLICT (${quoteIdent('id')}) DO NOTHING`;
      }
    } else {
      sql += ' ON CONFLICT DO NOTHING';
    }
  }

  await pool.query(sql, params);
};

const resetSequenceIfNeeded = async ({ pool, tableName, targetColumns }) => {
  if (!targetColumns.includes('id')) return;
  const maxRes = await pool.query(`SELECT COALESCE(MAX(id), 0) AS max_id FROM ${quoteIdent(tableName)}`);
  const maxId = toPgNumber(maxRes.rows?.[0]?.max_id);
  const sequenceRes = await pool.query(
    `SELECT pg_get_serial_sequence($1, 'id') AS seq`,
    [`public.${tableName}`]
  );
  const seq = sequenceRes.rows?.[0]?.seq || null;
  if (!seq) return;
  const nextValue = Math.max(1, maxId + 1);
  await pool.query(`SELECT setval($1::regclass, $2, false)`, [seq, nextValue]);
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const mode = String(args.mode || process.env.SQLITE_SUPABASE_MIGRATION_MODE || 'upsert').trim().toLowerCase();
  const dryRun = Boolean(args['dry-run'] || process.env.SQLITE_SUPABASE_MIGRATION_DRY_RUN === 'true');
  const batchSize = Math.max(1, Number(args.batch || process.env.SQLITE_SUPABASE_BATCH_SIZE || 500));
  const sqlitePath = String(
    args.sqlite
    || process.env.SQLITE_DB_PATH
    || process.env.DB_PATH
    || path.join('server', 'barman-store.db')
  ).trim();
  const explicitTables = String(args.tables || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

  if (!['upsert', 'truncate'].includes(mode)) {
    throw new Error(`Unsupported mode "${mode}". Use --mode upsert|truncate`);
  }

  const executionMode = normalizeExecutionMode(process.env.DB_EXECUTION_MODE || process.env.DB_CLIENT || 'postgres');
  if (executionMode !== 'postgres') {
    throw new Error(`DB_EXECUTION_MODE=${executionMode}. Set DB_EXECUTION_MODE=postgres before migrating.`);
  }

  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`SQLite file not found: ${sqlitePath}`);
  }

  const sqlite = new Database(sqlitePath, { readonly: true });
  const pool = createPostgresPool();

  try {
    await pingPostgresPool(pool);
    console.log(`[MIGRATE] Source SQLite: ${sqlitePath}`);
    console.log(`[MIGRATE] Target Postgres: ${getPostgresConnectionLabel()}`);
    console.log(`[MIGRATE] Mode=${mode} Batch=${batchSize} DryRun=${dryRun ? 'true' : 'false'}`);

    const sourceTables = getSourceTables(sqlite);
    const targetMeta = await getTargetColumnMeta(pool);
    const targetTables = [...targetMeta.keys()];
    const orderedTables = buildOrderedTables({ sourceTables, targetTables, explicitTables });

    if (!orderedTables.length) {
      console.log('[MIGRATE] No intersecting tables to migrate.');
      return;
    }

    console.log(`[MIGRATE] Tables to migrate (${orderedTables.length}): ${orderedTables.join(', ')}`);

    if (!dryRun && mode === 'truncate') {
      const truncateList = [...orderedTables].reverse().map(quoteIdent).join(', ');
      await pool.query(`TRUNCATE TABLE ${truncateList} RESTART IDENTITY CASCADE`);
      console.log('[MIGRATE] Target tables truncated (RESTART IDENTITY CASCADE).');
    }

    let totalRowsRead = 0;
    for (const tableName of orderedTables) {
      const sourceColumns = getSourceColumns(sqlite, tableName);
      const targetColumnsMeta = targetMeta.get(tableName) || [];
      const targetColumns = targetColumnsMeta.map((entry) => entry.column);
      const columnMetaByName = new Map(targetColumnsMeta.map((entry) => [entry.column, entry]));
      const columns = targetColumns.filter((column) => sourceColumns.includes(column));

      if (!columns.length) {
        console.log(`[MIGRATE] ${tableName}: skipped (no shared columns).`);
        continue;
      }

      const sourceCount = sqlite.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdent(tableName)}`).get()?.count || 0;
      console.log(`[MIGRATE] ${tableName}: source rows=${sourceCount}, columns=${columns.length}`);
      totalRowsRead += Number(sourceCount);
      if (dryRun || Number(sourceCount) === 0) continue;

      const selectSql = `SELECT ${columns.map(quoteIdent).join(', ')} FROM ${quoteIdent(tableName)}`;
      const stmt = sqlite.prepare(selectSql);
      let pending = [];
      let processed = 0;

      await pool.query('BEGIN');
      try {
        for (const rawRow of stmt.iterate()) {
          const row = columns.map((column) => normalizeCell(rawRow[column], columnMetaByName.get(column)));
          pending.push(row);
          processed += 1;
          if (pending.length >= batchSize) {
            await insertBatch({ pool, tableName, columns, rows: pending, mode });
            pending = [];
          }
        }
        if (pending.length) {
          await insertBatch({ pool, tableName, columns, rows: pending, mode });
        }
        await pool.query('COMMIT');
      } catch (error) {
        await pool.query('ROLLBACK');
        throw new Error(`Table ${tableName} migration failed: ${error.message}`);
      }

      await resetSequenceIfNeeded({ pool, tableName, targetColumns });
      const targetCount = (await pool.query(`SELECT COUNT(*) AS count FROM ${quoteIdent(tableName)}`)).rows?.[0]?.count || 0;
      console.log(`[MIGRATE] ${tableName}: processed=${processed}, target rows now=${targetCount}`);
    }

    console.log(`[MIGRATE] Completed. Total source rows scanned=${totalRowsRead}`);
  } finally {
    sqlite.close();
    await pool.end().catch(() => {});
  }
};

main().catch((error) => {
  console.error(`[MIGRATE] Failed: ${error.message}`);
  process.exit(1);
});
