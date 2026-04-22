require('../server/loadEnv');
const path = require('path');
const { normalizeExecutionMode } = require('../server/db/executionAdapter');
const {
  createPostgresPool,
  getPostgresConnectionLabel,
  pingPostgresPool,
} = require('../server/db/postgresScaffold');
const { applyPostgresMigrations } = require('../server/db/postgresBootstrap');

const POSTGRES_MIGRATIONS_DIR =
  process.env.POSTGRES_MIGRATIONS_DIR || path.join(__dirname, '..', 'supabase', 'migrations');

const main = async () => {
  const mode = normalizeExecutionMode(
    process.env.DB_EXECUTION_MODE || process.env.DB_CLIENT || 'postgres'
  );
  if (mode !== 'postgres') {
    console.log(
      `[DB] DB_EXECUTION_MODE=${mode}. Set DB_EXECUTION_MODE=postgres to apply Supabase/Postgres migrations.`
    );
    return;
  }

  const pool = createPostgresPool();
  try {
    await pingPostgresPool(pool);
    console.log(`[DB] Connected (${getPostgresConnectionLabel()})`);
    const result = await applyPostgresMigrations(pool, POSTGRES_MIGRATIONS_DIR);
    if (result.applied.length) {
      console.log(
        `[DB] Applied migrations (${result.applied.length}/${result.total}): ${result.applied.join(', ')}`
      );
    } else {
      console.log(`[DB] No new migrations. Already up-to-date (${result.total} files).`);
    }
  } finally {
    await pool.end().catch(() => {});
  }
};

main().catch((error) => {
  console.error(`[DB] Supabase/Postgres migration failed: ${error.message}`);
  process.exit(1);
});
