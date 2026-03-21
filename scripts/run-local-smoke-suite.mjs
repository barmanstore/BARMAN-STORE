import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import process from 'node:process';
import pg from 'pg';
import EmbeddedPostgres from 'embedded-postgres';

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const scriptPath = (name) => path.join(repoRoot, 'scripts', name);

const suiteDefinitions = {
  phone: [
    { label: 'Phone workflow smoke test', command: process.execPath, args: [scriptPath('test-phone-validation.mjs')] },
  ],
  'order-flow': [
    { label: 'Order+billing workflow smoke test', command: process.execPath, args: [scriptPath('test-order-billing-flow.mjs')] },
  ],
  'po-lifecycle': [
    { label: 'PO lifecycle smoke test', command: process.execPath, args: [scriptPath('test-po-lifecycle-flow.mjs')] },
  ],
  'credit-ui': [
    { label: 'Credit history UI smoke test', command: process.execPath, args: [scriptPath('test-credit-history-ui.mjs')] },
  ],
  'category-tree': [
    { label: 'Category tree smoke test', command: process.execPath, args: [scriptPath('test-category-tree-rules.mjs')] },
  ],
  core: [
    { label: 'Phone workflow smoke test', command: process.execPath, args: [scriptPath('test-phone-validation.mjs')] },
    { label: 'Order+billing workflow smoke test', command: process.execPath, args: [scriptPath('test-order-billing-flow.mjs')] },
    { label: 'Credit history UI smoke test', command: process.execPath, args: [scriptPath('test-credit-history-ui.mjs')] },
  ],
  all: [
    { label: 'Phone workflow smoke test', command: process.execPath, args: [scriptPath('test-phone-validation.mjs')] },
    { label: 'Order+billing workflow smoke test', command: process.execPath, args: [scriptPath('test-order-billing-flow.mjs')] },
    { label: 'PO lifecycle smoke test', command: process.execPath, args: [scriptPath('test-po-lifecycle-flow.mjs')] },
    { label: 'Credit history UI smoke test', command: process.execPath, args: [scriptPath('test-credit-history-ui.mjs')] },
    { label: 'Category tree smoke test', command: process.execPath, args: [scriptPath('test-category-tree-rules.mjs')] },
  ],
};

const suiteName = String(process.argv[2] || 'all').trim().toLowerCase();
const steps = suiteDefinitions[suiteName];

if (!steps) {
  const names = Object.keys(suiteDefinitions).join(', ');
  console.error(`[LOCAL_SMOKE_DB] Unknown suite "${suiteName}". Expected one of: ${names}`);
  process.exit(1);
}

const dbUser = String(process.env.LOCAL_SMOKE_DB_USER || 'postgres').trim() || 'postgres';
const dbPassword = String(process.env.LOCAL_SMOKE_DB_PASSWORD || 'postgres').trim() || 'postgres';
const dbName = String(process.env.LOCAL_SMOKE_DB_NAME || 'barman_store_smoke').trim() || 'barman_store_smoke';
const preferredPort = Math.max(1025, Number(process.env.LOCAL_SMOKE_DB_PORT || 55432) || 55432);
const dbDir = path.join(repoRoot, '.local', 'embedded-postgres', 'smoke-utf8');
const verbose = String(process.env.LOCAL_SMOKE_DB_VERBOSE || '').trim() === '1';

const isPortAvailable = (port) => new Promise((resolve) => {
  const server = net.createServer();
  server.once('error', () => resolve(false));
  server.once('listening', () => {
    server.close(() => resolve(true));
  });
  server.listen(port, '127.0.0.1');
});

const findAvailablePort = async (startPort) => {
  for (let port = startPort; port < startPort + 25; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available local smoke DB port found between ${startPort} and ${startPort + 24}.`);
};

const runCommand = (label, command, args, env) => new Promise((resolve, reject) => {
  console.log(`[LOCAL_SMOKE_DB] ${label}...`);
  const child = spawn(command, args, {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
  });
  child.once('error', reject);
  child.once('exit', (code, signal) => {
    if (signal) {
      reject(new Error(`${label} terminated by signal ${signal}`));
      return;
    }
    if (code !== 0) {
      reject(new Error(`${label} failed with exit code ${code}`));
      return;
    }
    resolve();
  });
});

const ensureDatabase = async (pg, databaseName) => {
  try {
    await pg.createDatabase(databaseName);
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    if (!message.includes('already exists') && !message.includes('duplicate database')) {
      throw error;
    }
  }
};

const ensureLocalSupabaseRoles = async (connectionString) => {
  const client = new Client({
    connectionString,
    ssl: false,
  });
  await client.connect();
  try {
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN;
        END IF;
      END
      $$;
    `);
  } finally {
    await client.end().catch(() => {});
  }
};

const formatError = (error) => {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.stack || error.message || error.name;
  try {
    return JSON.stringify(error);
  } catch (_) {
    return String(error);
  }
};

const hasInitializedCluster = async (databaseDir) => {
  try {
    await fs.access(path.join(databaseDir, 'PG_VERSION'));
    return true;
  } catch (_) {
    return false;
  }
};

const buildConnectionString = (databaseName, port) => {
  const url = new URL(`postgresql://127.0.0.1:${port}/${databaseName}`);
  url.username = dbUser;
  url.password = dbPassword;
  return url.toString();
};

const describeConnectionTarget = (databaseName, port) =>
  `127.0.0.1:${port}/${databaseName}`;

const main = async () => {
  await fs.mkdir(dbDir, { recursive: true });
  const initializedCluster = await hasInitializedCluster(dbDir);
  if (!initializedCluster) {
    const existingEntries = await fs.readdir(dbDir).catch(() => []);
    if (existingEntries.length > 0) {
      console.log('[LOCAL_SMOKE_DB] Resetting partial embedded Postgres data directory...');
      await fs.rm(dbDir, { recursive: true, force: true });
      await fs.mkdir(dbDir, { recursive: true });
    }
  }

  const port = await findAvailablePort(preferredPort);
  const adminDbUrl = buildConnectionString('postgres', port);
  const smokeDbUrl = buildConnectionString(dbName, port);

  const pg = new EmbeddedPostgres({
    databaseDir: dbDir,
    user: dbUser,
    password: dbPassword,
    port,
    persistent: true,
    initdbFlags: ['--encoding=UTF8'],
    onLog: verbose ? console.log : () => {},
    onError: console.error,
  });

  const smokeTestEnv = {
    ...process.env,
    PG_SSL: 'false',
    PG_SSL_REJECT_UNAUTHORIZED: 'false',
    SMOKE_TEST_DB_URL: smokeDbUrl,
    PHONE_TEST_DB_URL: smokeDbUrl,
    SMOKE_TEST_ALLOW_PRIMARY_DB: '0',
    PHONE_TEST_ALLOW_NO_DB: '0',
    SMOKE_ALLOW_NO_DB: '0',
  };
  const migrationEnv = {
    ...smokeTestEnv,
    DB_CLIENT: 'postgres',
    DB_EXECUTION_MODE: 'postgres',
    SUPABASE_DB_URL: smokeDbUrl,
    DATABASE_URL: smokeDbUrl,
  };

  console.log(`[LOCAL_SMOKE_DB] Using ${describeConnectionTarget(dbName, port)}`);
  console.log(`[LOCAL_SMOKE_DB] Data directory: ${dbDir}`);

  try {
    if (await hasInitializedCluster(dbDir)) {
      console.log('[LOCAL_SMOKE_DB] Reusing existing embedded Postgres cluster...');
    } else {
      console.log('[LOCAL_SMOKE_DB] Initializing embedded Postgres...');
      await pg.initialise();
    }
    console.log('[LOCAL_SMOKE_DB] Starting embedded Postgres...');
    await pg.start();
    await ensureDatabase(pg, dbName);
    await ensureLocalSupabaseRoles(adminDbUrl);
    await runCommand('Applying Postgres migrations', process.execPath, [scriptPath('apply-supabase-migrations.js')], migrationEnv);
    for (const step of steps) {
      await runCommand(step.label, step.command, step.args, smokeTestEnv);
    }
    console.log(`[LOCAL_SMOKE_DB] Suite "${suiteName}" passed.`);
  } finally {
    console.log('[LOCAL_SMOKE_DB] Stopping embedded Postgres...');
    await pg.stop().catch((error) => {
      console.warn(`[LOCAL_SMOKE_DB] Failed to stop embedded Postgres cleanly: ${error.message}`);
    });
  }
};

main().catch((error) => {
  console.error(`[LOCAL_SMOKE_DB] ${formatError(error)}`);
  process.exit(1);
});
