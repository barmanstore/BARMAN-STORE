require('../server/loadEnv');
const { normalizeExecutionMode } = require('../server/db/executionAdapter');
const {
  createPostgresPool,
  getPostgresConnectionLabel,
  pingPostgresPool,
} = require('../server/db/postgresScaffold');

const main = async () => {
  const mode = normalizeExecutionMode(
    process.env.DB_EXECUTION_MODE || process.env.DB_CLIENT || 'postgres'
  );
  if (mode !== 'postgres') {
    console.log(
      `[DB] DB_EXECUTION_MODE=${mode}. Set DB_EXECUTION_MODE=postgres for Supabase/Postgres checks.`
    );
    return;
  }

  const pool = createPostgresPool();
  try {
    await pingPostgresPool(pool);
    console.log(`[DB] Postgres/Supabase check passed (${getPostgresConnectionLabel()})`);
  } finally {
    await pool.end().catch(() => {});
  }
};

main().catch((error) => {
  console.error(`[DB] Postgres/Supabase check failed: ${error.message}`);
  process.exit(1);
});
