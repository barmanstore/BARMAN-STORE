import '../server/loadEnv.js';
import postgresScaffold from '../server/db/postgresScaffold.js';
import { resolveSmokeDbConfig } from './smokeDbConfig.mjs';

const { getPostgresConnectionLabel } = postgresScaffold;

const localSmokeDbUser = String(process.env.LOCAL_SMOKE_DB_USER || 'postgres').trim() || 'postgres';
const localSmokeDbPort = Math.max(1025, Number(process.env.LOCAL_SMOKE_DB_PORT || 55433) || 55433);
const localSmokeDbName =
  String(process.env.LOCAL_SMOKE_DB_NAME || 'barman_store_smoke').trim() || 'barman_store_smoke';
const localSmokeDbHost = String(process.env.LOCAL_SMOKE_DB_HOST || '127.0.0.1').trim() || '127.0.0.1';

const describeTarget = (host, port, database) => `${host}:${port}/${database}`;

const main = () => {
  const primaryDbLabel = getPostgresConnectionLabel();
  const explicitSmokeConfig = resolveSmokeDbConfig({
    testName: 'Direct smoke tests',
    explicitEnvKeys: ['SMOKE_TEST_DB_URL', 'PHONE_TEST_DB_URL'],
    allowPrimaryEnvKey: 'SMOKE_TEST_ALLOW_PRIMARY_DB',
  });
  const localSmokeTarget = describeTarget(localSmokeDbHost, localSmokeDbPort, localSmokeDbName);

  console.log('========================================');
  console.log('Smoke DB Review');
  console.log('========================================');
  console.log(`[SMOKE-REVIEW] Primary app DB: ${primaryDbLabel}`);
  console.log(`[SMOKE-REVIEW] Local smoke-suite DB target: ${localSmokeTarget}`);
  console.log(
    `[SMOKE-REVIEW] Local smoke DBeaver profile: user=${localSmokeDbUser}, password=LOCAL_SMOKE_DB_PASSWORD or default postgres`
  );
  console.log('');

  if (explicitSmokeConfig.shouldSkip) {
    console.log(`[SMOKE-REVIEW] ${explicitSmokeConfig.reason}`);
  } else if (explicitSmokeConfig.sourceKey) {
    console.log(
      `[SMOKE-REVIEW] Direct smoke DB env: ${explicitSmokeConfig.sourceKey} -> ${explicitSmokeConfig.description}`
    );
  } else if (explicitSmokeConfig.dbUrl) {
    console.log(`[SMOKE-REVIEW] Direct smoke DB target: ${explicitSmokeConfig.description}`);
  } else {
    console.log('[SMOKE-REVIEW] No explicit smoke DB env is currently configured for direct smoke tests.');
  }

  console.log('');
  console.log('DBeaver guidance:');
  console.log(`- For the local smoke suite, connect to ${localSmokeTarget}.`);
  console.log('- If SMOKE_TEST_DB_URL or PHONE_TEST_DB_URL is set, direct smoke tests use that target instead.');
  console.log('- The smoke-local suite defaults to the local smoke target above when no explicit smoke DB is set.');
};

main();
