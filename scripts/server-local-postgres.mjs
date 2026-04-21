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
const serverEntry = path.join(repoRoot, 'server', 'index.js');

const dbUser = String(process.env.LOCAL_DEV_DB_USER || 'postgres').trim() || 'postgres';
const dbPassword =
  String(process.env.LOCAL_DEV_DB_PASSWORD || 'postgres').trim() || 'postgres';
const dbName =
  String(process.env.LOCAL_DEV_DB_NAME || 'barman_store_local').trim() || 'barman_store_local';
const preferredPort = Math.max(1025, Number(process.env.LOCAL_DEV_DB_PORT || 55433) || 55433);
const dbDir = path.join(repoRoot, '.local', 'embedded-postgres', 'dev');
const verbose = String(process.env.LOCAL_DEV_DB_VERBOSE || '').trim() === '1';
const frontendOrigin =
  String(process.env.FRONTEND_ORIGIN || '').trim() ||
  'http://localhost:3000,http://127.0.0.1:3000';
const bootstrapAdminEmail =
  String(process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim() || 'admin@local.test';
const bootstrapAdminPassword =
  String(process.env.BOOTSTRAP_ADMIN_PASSWORD || '').trim() || 'LocalAdmin123!';

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

const isPortAvailable = (port) =>
  new Promise((resolve) => {
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
  throw new Error(
    `No available local Postgres port found between ${startPort} and ${startPort + 24}.`
  );
};

const buildConnectionString = (databaseName, port) => {
  const url = new URL(`postgresql://127.0.0.1:${port}/${databaseName}`);
  url.username = dbUser;
  url.password = dbPassword;
  return url.toString();
};

const ensureDatabase = async (embeddedPostgres, databaseName) => {
  try {
    await embeddedPostgres.createDatabase(databaseName);
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

const runCommand = (label, command, args, env) =>
  new Promise((resolve, reject) => {
    console.log(`[LOCAL_POSTGRES] ${label}...`);
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

const stopChildProcess = async (child, signal = 'SIGINT') => {
  if (!child || child.exitCode !== null || child.killed) return;

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null && !child.killed) {
        child.kill('SIGTERM');
      }
    }, 3000);

    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });

    child.kill(signal);
  });
};

const main = async () => {
  await fs.mkdir(dbDir, { recursive: true });

  const port = await findAvailablePort(preferredPort);
  const adminDbUrl = buildConnectionString('postgres', port);
  const appDbUrl = buildConnectionString(dbName, port);

  const embeddedPostgres = new EmbeddedPostgres({
    databaseDir: dbDir,
    user: dbUser,
    password: dbPassword,
    port,
    persistent: true,
    initdbFlags: ['--encoding=UTF8'],
    onLog: verbose ? console.log : () => {},
    onError: (error) => {
      console.error(formatError(error));
    },
  });

  let serverProcess = null;

  const localEnv = {
    ...process.env,
    DB_CLIENT: 'postgres',
    DB_EXECUTION_MODE: 'postgres',
    SUPABASE_DB_URL: appDbUrl,
    DATABASE_URL: appDbUrl,
    POSTGRES_URL: appDbUrl,
    PG_CONNECTION_STRING: appDbUrl,
    PG_SSL: 'false',
    PG_SSL_REJECT_UNAUTHORIZED: 'false',
    SUPABASE_AUTH_ENABLED: 'false',
    OTP_DELIVERY_MODE: 'manual',
    EMAIL_DELIVERY_MODE: 'manual',
    AUTH_LOGIN_OTP_EXPOSE_CODE: 'true',
    FRONTEND_ORIGIN: frontendOrigin,
    BOOTSTRAP_ADMIN_EMAIL: bootstrapAdminEmail,
    BOOTSTRAP_ADMIN_PASSWORD: bootstrapAdminPassword,
  };

  const shutdown = async (signal) => {
    console.log(`[LOCAL_POSTGRES] Received ${signal}. Shutting down local services...`);
    await stopChildProcess(serverProcess);
    await embeddedPostgres.stop().catch((error) => {
      console.warn(`[LOCAL_POSTGRES] Failed to stop local Postgres cleanly: ${error.message}`);
    });
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  try {
    if (await hasInitializedCluster(dbDir)) {
      console.log('[LOCAL_POSTGRES] Reusing local Postgres data directory.');
    } else {
      console.log('[LOCAL_POSTGRES] Initializing local Postgres data directory...');
      await embeddedPostgres.initialise();
    }

    console.log(`[LOCAL_POSTGRES] Starting local Postgres on 127.0.0.1:${port}/${dbName}...`);
    await embeddedPostgres.start();
    await ensureDatabase(embeddedPostgres, dbName);
    await ensureLocalSupabaseRoles(adminDbUrl);

    console.log(`[LOCAL_POSTGRES] Local DB URL: ${appDbUrl}`);
    console.log(`[LOCAL_POSTGRES] Local admin email: ${bootstrapAdminEmail}`);

    await runCommand(
      'Applying local Postgres migrations',
      process.execPath,
      [scriptPath('apply-supabase-migrations.js')],
      localEnv
    );

    console.log('[LOCAL_POSTGRES] Starting API server...');
    serverProcess = spawn(process.execPath, [serverEntry], {
      cwd: repoRoot,
      env: localEnv,
      stdio: 'inherit',
    });

    serverProcess.once('error', async (error) => {
      console.error(`[LOCAL_POSTGRES] Failed to start API server: ${error.message}`);
      await embeddedPostgres.stop().catch(() => {});
      process.exit(1);
    });

    serverProcess.once('exit', async (code, signal) => {
      await embeddedPostgres.stop().catch(() => {});
      if (signal) {
        process.exit(1);
      }
      process.exit(code ?? 0);
    });
  } catch (error) {
    console.error(`[LOCAL_POSTGRES] ${formatError(error)}`);
    await stopChildProcess(serverProcess).catch(() => {});
    await embeddedPostgres.stop().catch(() => {});
    process.exit(1);
  }
};

main();
