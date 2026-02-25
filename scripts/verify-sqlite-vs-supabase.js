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

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const nearlyEqual = (a, b, epsilon = 0.0001) => Math.abs(a - b) <= epsilon;

const getSourceTables = (sqlite) => sqlite
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all()
  .map((row) => String(row.name));

const getTargetTables = async (pool) => {
  const result = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  return result.rows.map((row) => String(row.table_name));
};

const getOrderedTables = ({ sourceTables, targetTables }) => {
  const sourceSet = new Set(sourceTables);
  const targetSet = new Set(targetTables);
  const intersection = [...sourceSet].filter((name) => targetSet.has(name));
  const primary = DEFAULT_TABLE_ORDER.filter((name) => intersection.includes(name));
  const remainder = intersection.filter((name) => !primary.includes(name)).sort((a, b) => a.localeCompare(b));
  return [...primary, ...remainder];
};

const aggregateChecks = [
  {
    key: 'orders_total_amount',
    sqliteSql: `SELECT COALESCE(SUM(CAST(total_amount AS REAL)), 0) AS value FROM orders`,
    pgSql: `SELECT COALESCE(SUM(total_amount), 0) AS value FROM orders`,
  },
  {
    key: 'bills_total_amount',
    sqliteSql: `SELECT COALESCE(SUM(CAST(total_amount AS REAL)), 0) AS value FROM bills`,
    pgSql: `SELECT COALESCE(SUM(total_amount), 0) AS value FROM bills`,
  },
  {
    key: 'credit_history_amount',
    sqliteSql: `SELECT COALESCE(SUM(CAST(amount AS REAL)), 0) AS value FROM credit_history`,
    pgSql: `SELECT COALESCE(SUM(amount), 0) AS value FROM credit_history`,
  },
  {
    key: 'stock_ledger_qty_change',
    sqliteSql: `SELECT COALESCE(SUM(CAST(quantity_change AS REAL)), 0) AS value FROM stock_ledger`,
    pgSql: `SELECT COALESCE(SUM(quantity_change), 0) AS value FROM stock_ledger`,
  },
  {
    key: 'products_stock',
    sqliteSql: `SELECT COALESCE(SUM(CAST(stock AS REAL)), 0) AS value FROM products`,
    pgSql: `SELECT COALESCE(SUM(stock), 0) AS value FROM products`,
  },
];

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const showOnlyMismatches = Boolean(args['only-mismatch'] || args['only-mismatches']);
  const sqlitePath = String(
    args.sqlite
    || process.env.SQLITE_DB_PATH
    || process.env.DB_PATH
    || path.join('server', 'barman-store.db')
  ).trim();

  const executionMode = normalizeExecutionMode(process.env.DB_EXECUTION_MODE || process.env.DB_CLIENT || 'postgres');
  if (executionMode !== 'postgres') {
    throw new Error(`DB_EXECUTION_MODE=${executionMode}. Set DB_EXECUTION_MODE=postgres before verifying.`);
  }
  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`SQLite file not found: ${sqlitePath}`);
  }

  const sqlite = new Database(sqlitePath, { readonly: true });
  const pool = createPostgresPool();
  let failed = false;

  try {
    await pingPostgresPool(pool);
    console.log(`[VERIFY] Source SQLite: ${sqlitePath}`);
    console.log(`[VERIFY] Target Postgres: ${getPostgresConnectionLabel()}`);

    const sourceTables = getSourceTables(sqlite);
    const targetTables = await getTargetTables(pool);
    const orderedTables = getOrderedTables({ sourceTables, targetTables });
    console.log(`[VERIFY] Comparing row counts for ${orderedTables.length} tables.`);

    for (const tableName of orderedTables) {
      const sqliteCount = toNumber(sqlite.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdent(tableName)}`).get()?.count);
      const pgCountRes = await pool.query(`SELECT COUNT(*) AS count FROM ${quoteIdent(tableName)}`);
      const pgCount = toNumber(pgCountRes.rows?.[0]?.count);
      const ok = sqliteCount === pgCount;
      if (!ok) failed = true;
      if (!showOnlyMismatches || !ok) {
        console.log(`[VERIFY] [${ok ? 'OK' : 'MISMATCH'}] ${tableName}: sqlite=${sqliteCount}, postgres=${pgCount}`);
      }
    }

    for (const check of aggregateChecks) {
      const sqliteValue = toNumber(sqlite.prepare(check.sqliteSql).get()?.value);
      const pgRes = await pool.query(check.pgSql);
      const pgValue = toNumber(pgRes.rows?.[0]?.value);
      const ok = nearlyEqual(sqliteValue, pgValue);
      if (!ok) failed = true;
      if (!showOnlyMismatches || !ok) {
        console.log(`[VERIFY] [${ok ? 'OK' : 'MISMATCH'}] ${check.key}: sqlite=${sqliteValue}, postgres=${pgValue}`);
      }
    }

    const sqliteRoles = sqlite.prepare(`
      SELECT COALESCE(role, '') AS role, COUNT(*) AS count
      FROM users
      GROUP BY COALESCE(role, '')
      ORDER BY role
    `).all();
    const pgRolesRes = await pool.query(`
      SELECT COALESCE(role, '') AS role, COUNT(*) AS count
      FROM users
      GROUP BY COALESCE(role, '')
      ORDER BY role
    `);
    const sqliteRoleMap = new Map(sqliteRoles.map((row) => [String(row.role), toNumber(row.count)]));
    const pgRoleMap = new Map((pgRolesRes.rows || []).map((row) => [String(row.role), toNumber(row.count)]));
    const allRoles = [...new Set([...sqliteRoleMap.keys(), ...pgRoleMap.keys()])].sort((a, b) => a.localeCompare(b));
    for (const role of allRoles) {
      const sqliteCount = sqliteRoleMap.get(role) || 0;
      const pgCount = pgRoleMap.get(role) || 0;
      const ok = sqliteCount === pgCount;
      if (!ok) failed = true;
      if (!showOnlyMismatches || !ok) {
        const roleLabel = role || '(empty-role)';
        console.log(`[VERIFY] [${ok ? 'OK' : 'MISMATCH'}] users.role.${roleLabel}: sqlite=${sqliteCount}, postgres=${pgCount}`);
      }
    }

    if (failed) {
      throw new Error('Verification failed. Review mismatches above.');
    }

    console.log('[VERIFY] Success. SQLite and Supabase checks matched.');
  } finally {
    sqlite.close();
    await pool.end().catch(() => {});
  }
};

main().catch((error) => {
  console.error(`[VERIFY] Failed: ${error.message}`);
  process.exit(1);
});
