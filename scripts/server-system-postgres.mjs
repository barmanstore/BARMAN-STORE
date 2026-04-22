import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import process from 'node:process';
import pg from 'pg';
import '../server/loadEnv.js';

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const scriptPath = (name) => path.join(repoRoot, 'scripts', name);
const serverEntry = path.join(repoRoot, 'server', 'index.js');

const dbHost = String(process.env.LOCAL_SYSTEM_DB_HOST || '127.0.0.1').trim() || '127.0.0.1';
const dbPort = String(process.env.LOCAL_SYSTEM_DB_PORT || '5432').trim() || '5432';
const dbUser = String(process.env.LOCAL_SYSTEM_DB_USER || 'naren').trim() || 'naren';
const dbPassword = String(process.env.LOCAL_SYSTEM_DB_PASSWORD || '5514').trim() || '5514';
const dbName =
  String(process.env.LOCAL_SYSTEM_DB_NAME || 'barman_store_local').trim() ||
  'barman_store_local';
const frontendOrigin =
  String(process.env.FRONTEND_ORIGIN || '').trim() ||
  'http://localhost:3000,http://127.0.0.1:3000';
const bootstrapAdminEmail =
  String(process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim() || 'admin@local.test';
const bootstrapAdminPassword =
  String(process.env.BOOTSTRAP_ADMIN_PASSWORD || '').trim() || 'LocalAdmin123!';
const externalSupabaseDbUrl = String(
  process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || ''
).trim();
const externalSupabaseUrl = (() => {
  const explicitUrl =
    String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim() || '';
  if (explicitUrl) return explicitUrl.replace(/\/+$/, '');
  if (!externalSupabaseDbUrl) return '';
  try {
    const parsed = new URL(externalSupabaseDbUrl);
    const host = String(parsed.hostname || '').trim().toLowerCase();
    const username = decodeURIComponent(String(parsed.username || '').trim()).toLowerCase();
    const directHostMatch = host.match(/^db\.([a-z0-9-]+)\.supabase\.co$/i);
    if (directHostMatch?.[1]) {
      return `https://${directHostMatch[1]}.supabase.co`;
    }
    const pooledUserMatch = username.match(/^postgres\.([a-z0-9-]+)$/i);
    if (pooledUserMatch?.[1]) {
      return `https://${pooledUserMatch[1]}.supabase.co`;
    }
  } catch (_) {
    return '';
  }
  return '';
})();
const externalSupabaseAnonKey =
  String(
    process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      ''
  ).trim() || '';
const shouldEnableSupabaseAuth =
  String(process.env.SUPABASE_AUTH_ENABLED || '').trim()
    ? String(process.env.SUPABASE_AUTH_ENABLED).trim().toLowerCase() === 'true'
    : Boolean(externalSupabaseUrl && externalSupabaseAnonKey);

const appDbUrl = new URL(`postgresql://${dbHost}:${dbPort}/${dbName}`);
appDbUrl.username = dbUser;
appDbUrl.password = dbPassword;

const connectionString = appDbUrl.toString();

const localEnv = {
  ...process.env,
  DB_CLIENT: 'postgres',
  DB_EXECUTION_MODE: 'postgres',
  SUPABASE_DB_URL: connectionString,
  DATABASE_URL: connectionString,
  POSTGRES_URL: connectionString,
  PG_CONNECTION_STRING: connectionString,
  PGHOST: dbHost,
  PGPORT: dbPort,
  PGUSER: dbUser,
  PGPASSWORD: dbPassword,
  PGDATABASE: dbName,
  PG_SSL: 'false',
  PG_SSL_REJECT_UNAUTHORIZED: 'false',
  SUPABASE_URL: externalSupabaseUrl,
  SUPABASE_ANON_KEY: externalSupabaseAnonKey,
  SUPABASE_AUTH_ENABLED: shouldEnableSupabaseAuth ? 'true' : 'false',
  OTP_DELIVERY_MODE:
    process.env.OTP_DELIVERY_MODE || (shouldEnableSupabaseAuth ? 'auto' : 'manual'),
  EMAIL_DELIVERY_MODE: 'manual',
  AUTH_LOGIN_OTP_EXPOSE_CODE:
    process.env.AUTH_LOGIN_OTP_EXPOSE_CODE || (shouldEnableSupabaseAuth ? 'false' : 'true'),
  FRONTEND_ORIGIN: frontendOrigin,
  BOOTSTRAP_ADMIN_EMAIL: bootstrapAdminEmail,
  BOOTSTRAP_ADMIN_PASSWORD: bootstrapAdminPassword,
};

const runCommand = (label, command, args, env) =>
  new Promise((resolve, reject) => {
    console.log(`[SYSTEM_LOCAL_POSTGRES] ${label}...`);
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

const verifyConnection = async () => {
  const client = new Client({
    connectionString,
    ssl: false,
  });

  await client.connect();
  try {
    await client.query('SELECT 1 AS ok');
  } finally {
    await client.end().catch(() => {});
  }
};

const main = async () => {
  try {
    await verifyConnection();
    console.log(
      `[SYSTEM_LOCAL_POSTGRES] Using local PostgreSQL at ${dbHost}:${dbPort}/${dbName} as ${dbUser}`
    );
    console.log(`[SYSTEM_LOCAL_POSTGRES] Local admin email: ${bootstrapAdminEmail}`);
    if (shouldEnableSupabaseAuth) {
      console.log(
        `[SYSTEM_LOCAL_POSTGRES] Supabase auth enabled for localhost via ${externalSupabaseUrl}`
      );
    } else {
      console.log('[SYSTEM_LOCAL_POSTGRES] Supabase auth not configured, using manual OTP mode.');
    }

    await runCommand(
      'Applying local Postgres migrations',
      process.execPath,
      [scriptPath('apply-supabase-migrations.js')],
      localEnv
    );

    console.log('[SYSTEM_LOCAL_POSTGRES] Starting API server...');
    const serverProcess = spawn(process.execPath, [serverEntry], {
      cwd: repoRoot,
      env: localEnv,
      stdio: 'inherit',
    });

    serverProcess.once('error', (error) => {
      console.error(`[SYSTEM_LOCAL_POSTGRES] Failed to start API server: ${error.message}`);
      process.exit(1);
    });

    serverProcess.once('exit', (code, signal) => {
      if (signal) {
        process.exit(1);
      }
      process.exit(code ?? 0);
    });

    process.once('SIGINT', () => {
      serverProcess.kill('SIGINT');
    });
    process.once('SIGTERM', () => {
      serverProcess.kill('SIGTERM');
    });
  } catch (error) {
    console.error(`[SYSTEM_LOCAL_POSTGRES] ${error.message}`);
    process.exit(1);
  }
};

main();
