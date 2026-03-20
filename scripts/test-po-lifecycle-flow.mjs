import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import pg from 'pg';
import {
  logSmokeSkipInfo,
  parseBooleanEnv,
  resolveSmokeDbConfig,
  withResolvedSmokeDbEnv,
} from './smokeDbConfig.mjs';

const { Pool } = pg;
const allowSkipIfNoDb = parseBooleanEnv(process.env.SMOKE_ALLOW_NO_DB, false);
const smokeDbConfig = resolveSmokeDbConfig({
  testName: 'PO lifecycle smoke test',
  explicitEnvKeys: ['SMOKE_TEST_DB_URL'],
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const terminateServer = async (server, timeoutMs = 2000) => {
  if (!server) return;
  if (typeof server.close === 'function') {
    await Promise.race([
      new Promise((resolve) => {
        try {
          server.close(() => resolve(true));
        } catch (_) {
          resolve(true);
        }
      }),
      delay(timeoutMs),
    ]);
    return;
  }
  if (server.killed) return;
  const exited = new Promise((resolve) => {
    server.once('exit', () => resolve(true));
  });
  try {
    server.kill('SIGTERM');
  } catch (_) {
    // ignore kill errors
  }
  const timedOut = await Promise.race([exited.then(() => false), delay(timeoutMs).then(() => true)]);
  if (timedOut && !server.killed) {
    try {
      server.kill('SIGKILL');
    } catch (_) {
      // ignore hard kill errors
    }
    await Promise.race([exited, delay(800)]);
  }
};

const buildTestEnv = (port, authSecret) => ({
  NODE_ENV: 'test',
  PORT: String(port),
  AUTH_TOKEN_SECRET: authSecret,
  SUPABASE_AUTH_ENABLED: 'false',
  ...withResolvedSmokeDbEnv({}, smokeDbConfig.dbUrl),
});

let inProcessApp = null;
const loadInProcessApp = async () => {
  if (inProcessApp) return inProcessApp;
  const moduleUrl = new URL('../server/index.js', import.meta.url);
  const imported = await import(moduleUrl);
  inProcessApp = imported.default || imported.app || imported;
  return inProcessApp;
};

const startInProcessServer = async (port, authSecret) => {
  Object.assign(process.env, buildTestEnv(port, authSecret));
  const app = await loadInProcessApp();
  const server = app.listen(port, '127.0.0.1');
  return {
    server,
    app,
    readLogs: () => ({ stdout: '', stderr: '[INFO] In-process server started.' }),
  };
};

const spawnTestServer = async (port, authSecret) => {
  let stdout = '';
  let stderr = '';
  try {
    const server = spawn(process.execPath, ['server/index.js'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...buildTestEnv(port, authSecret),
      },
    });
    server.stdout.on('data', (chunk) => { stdout += String(chunk); });
    server.stderr.on('data', (chunk) => { stderr += String(chunk); });
    return {
      server,
      app: null,
      readLogs: () => ({ stdout, stderr }),
    };
  } catch (error) {
    if (error?.code !== 'EPERM') throw error;
    stderr = `${stderr}\n[WARN] spawn EPERM. Falling back to in-process server.`;
    const boot = await startInProcessServer(port, authSecret);
    return {
      ...boot,
      readLogs: () => ({ stdout, stderr }),
    };
  }
};

const toJson = async (res) => {
  try {
    return await res.json();
  } catch (_) {
    return null;
  }
};

const makeRequest = (baseUrl, token = '') => async (pathname, init = {}) =>
  fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });

const signToken = ({ uid, role = 'customer' }, secret) => {
  const now = Date.now();
  const payload = {
    uid: Number(uid || 0),
    role: String(role || 'customer'),
    iat: now,
    exp: now + (7 * 24 * 60 * 60 * 1000),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', String(secret || 'barman-store-local-secret'))
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
};

const randomSuffix = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const main = async () => {
  const port = 5900 + Math.floor(Math.random() * 100);
  const authSecret = `po-lifecycle-secret-${randomSuffix()}`;
  const hasDbEnv = Boolean(smokeDbConfig.dbUrl);
  let server = null;
  let appInstance = null;
  let readLogs = () => ({ stdout: '', stderr: '' });
  let request = null;

  let pool = null;
  let createdProductId = 0;
  let createdDistributorId = 0;
  let createdPoId = 0;
  try {
    if (smokeDbConfig.shouldSkip) {
      logSmokeSkipInfo(smokeDbConfig.reason);
      return;
    }
    if (allowSkipIfNoDb && !hasDbEnv) {
      logSmokeSkipInfo(
        'PO lifecycle smoke test skipped because no dedicated smoke-test database is configured.',
        ['Set SMOKE_TEST_DB_URL to run the test safely.']
      );
      return;
    }
    if (!hasDbEnv) {
      throw new Error('PO lifecycle smoke test requires SMOKE_TEST_DB_URL. Set SMOKE_TEST_ALLOW_PRIMARY_DB=1 only if you intentionally want to reuse the primary app DB.');
    }

    const boot = await spawnTestServer(port, authSecret);
    server = boot.server;
    appInstance = boot.app || null;
    readLogs = boot.readLogs;

    const baseUrl = `http://127.0.0.1:${port}`;
    request = makeRequest(baseUrl);
    if (!request) {
      throw new Error('PO lifecycle smoke test could not initialize HTTP client.');
      return;
    }

    let ready = false;
    for (let i = 0; i < 180; i += 1) {
      try {
        const res = await request('/');
        if (res.ok) {
          ready = true;
          break;
        }
      } catch (_) {
        // keep polling
      }
      await delay(250);
    }
    if (!ready) {
      const logs = readLogs();
      const dbBootFailed = /Database initialization failed|Postgres\/Supabase initialization failed|ECONNREFUSED/i.test(logs.stderr);
      if (allowSkipIfNoDb && dbBootFailed) {
        logSmokeSkipInfo(
          'PO lifecycle smoke test skipped because the database is unavailable.',
          ['Set SMOKE_TEST_DB_URL to run the test safely.']
        );
        return;
      }
      assert.equal(ready, true, `Server did not start in time. stderr:\n${logs.stderr}\nstdout:\n${logs.stdout}`);
    }

    const dbUrl = String(smokeDbConfig.dbUrl || '').trim();
    pool = new Pool({ connectionString: dbUrl });
    try {
      await pool.query('SELECT 1 AS ok');
    } catch (error) {
      if (allowSkipIfNoDb) {
        logSmokeSkipInfo(
          'PO lifecycle smoke test skipped because the database is unavailable.',
          ['Set SMOKE_TEST_DB_URL to run the test safely.']
        );
        return;
      }
      throw error;
    }

    const adminRow = await pool.query(`SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1`);
    let adminId = Number(adminRow.rows?.[0]?.id || 0);
    if (!adminId) {
      const adminEmail = `po-admin-smoke-${randomSuffix()}@example.com`;
      const createdAdmin = await pool.query(
        `INSERT INTO users (role, name, email, email_verified, phone, phone_verified, address, password_hash, must_change_password)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        ['admin', 'PO Smoke Admin', adminEmail, 1, null, 0, null, 'smoke-hash', 0]
      );
      adminId = Number(createdAdmin.rows?.[0]?.id || 0);
    }
    assert.equal(adminId > 0, true, 'Admin user is required for smoke test');

    const adminToken = signToken({ uid: adminId, role: 'admin' }, authSecret);
    const adminRequest = makeRequest(baseUrl, adminToken);

    const productSku = `SMK-PO-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const productCreateRes = await adminRequest('/api/products', {
      method: 'POST',
      body: JSON.stringify({
        name: `Smoke PO Product ${randomSuffix()}`,
        price: 120,
        mrp: 120,
        stock: 5,
        category: 'Groceries',
        uom: 'pcs',
        sku: productSku,
      }),
    });
    const productCreateJson = await toJson(productCreateRes);
    assert.equal(productCreateRes.status, 201, `product create failed: ${JSON.stringify(productCreateJson)}`);
    createdProductId = Number(productCreateJson?.id || 0);
    assert.equal(createdProductId > 0, true, 'Created product id missing');

    const distributorName = `Smoke Distributor ${randomSuffix()}`;
    const distributorCreateRes = await adminRequest('/api/distributors', {
      method: 'POST',
      body: JSON.stringify({
        name: distributorName,
        contacts: JSON.stringify({ phone: '9876543210' }),
        payment_terms: 'Net 15',
      }),
    });
    const distributorCreateJson = await toJson(distributorCreateRes);
    assert.equal(distributorCreateRes.status, 201, `distributor create failed: ${JSON.stringify(distributorCreateJson)}`);
    createdDistributorId = Number(distributorCreateJson?.id || 0);
    assert.equal(createdDistributorId > 0, true, 'Created distributor id missing');

    const registerRes = await adminRequest('/api/purchase-orders', {
      method: 'POST',
      body: JSON.stringify({
        distributor_id: createdDistributorId,
        expected_delivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        notes: 'Smoke lifecycle register',
        items: [
          {
            product_id: createdProductId,
            product_name: 'Smoke PO Product',
            quantity: 2,
            uom: 'pcs',
            unit_price: 120,
            rate: 120,
            gst_rate: 0,
            discount_type: 'percent',
            discount_value: 0,
          },
        ],
        created_by: adminId,
      }),
    });
    const registerJson = await toJson(registerRes);
    assert.equal(registerRes.status, 201, `register PO failed: ${JSON.stringify(registerJson)}`);
    createdPoId = Number(registerJson?.id || 0);
    assert.equal(createdPoId > 0, true, 'Created PO id missing');
    assert.equal(String(registerJson?.po_status || ''), 'prepared', 'PO should start as prepared');
    assert.equal(String(registerJson?.payment_status || ''), 'unpaid', 'PO should start unpaid');

    const poBeforeEditRes = await adminRequest(`/api/purchase-orders/${createdPoId}`);
    const poBeforeEditJson = await toJson(poBeforeEditRes);
    assert.equal(poBeforeEditRes.status, 200, `PO fetch before edit failed: ${JSON.stringify(poBeforeEditJson)}`);
    const poTotal = toNumber(poBeforeEditJson?.total_amount || poBeforeEditJson?.total);
    assert.equal(poTotal > 0, true, 'PO total amount should be > 0');

    const editRes = await adminRequest(`/api/purchase-orders/${createdPoId}`, {
      method: 'PUT',
      body: JSON.stringify({
        distributor_id: createdDistributorId,
        notes: 'Smoke lifecycle edited note',
        expected_delivery: poBeforeEditJson?.expected_delivery || null,
        items: [
          {
            product_id: createdProductId,
            product_name: 'Smoke PO Product',
            quantity: 2,
            uom: 'pcs',
            unit_price: 120,
            rate: 120,
            gst_rate: 0,
            discount_type: 'percent',
            discount_value: 0,
          },
        ],
        created_by: adminId,
      }),
    });
    const editJson = await toJson(editRes);
    assert.equal(editRes.status, 200, `edit PO failed: ${JSON.stringify(editJson)}`);

    const partialPayAmount = Number((poTotal / 2).toFixed(2));
    const processRes = await adminRequest(`/api/purchase-orders/${createdPoId}/status`, {
      method: 'PUT',
      body: JSON.stringify({
        status: 'processed',
        bill_number: `BILL-SMOKE-${Date.now()}`,
        paid_amount: partialPayAmount,
        payment_mode: 'cash',
        payment_reference: `SMOKE-PART-${Date.now()}`,
        payment_notes: 'Initial partial payment',
        updated_by: adminId,
      }),
    });
    const processJson = await toJson(processRes);
    assert.equal(processRes.status, 200, `process PO failed: ${JSON.stringify(processJson)}`);
    assert.equal(String(processJson?.po_status || ''), 'part_paid', 'PO should become part_paid after partial process payment');
    assert.equal(String(processJson?.payment_status || ''), 'part_paid', 'PO should become part-paid after partial process payment');

    const editAfterProcessRes = await adminRequest(`/api/purchase-orders/${createdPoId}`, {
      method: 'PUT',
      body: JSON.stringify({
        notes: 'Edit should fail after process',
      }),
    });
    const editAfterProcessJson = await toJson(editAfterProcessRes);
    assert.equal(editAfterProcessRes.status, 400, `edit should fail after process: ${JSON.stringify(editAfterProcessJson)}`);

    const poAfterProcessRes = await adminRequest(`/api/purchase-orders/${createdPoId}`);
    const poAfterProcessJson = await toJson(poAfterProcessRes);
    assert.equal(poAfterProcessRes.status, 200, `PO fetch after process failed: ${JSON.stringify(poAfterProcessJson)}`);
    assert.equal(String(poAfterProcessJson?.po_status || ''), 'part_paid', 'stored PO status should be part_paid');
    assert.equal(String(poAfterProcessJson?.payment_status || ''), 'part_paid', 'stored PO payment should be part_paid');
    const dueAfterProcess = toNumber(poAfterProcessJson?.balance_due);
    assert.equal(dueAfterProcess > 0, true, 'balance_due should remain after partial payment');

    const finalPaymentRes = await adminRequest(`/api/purchase-orders/${createdPoId}/payments`, {
      method: 'POST',
      body: JSON.stringify({
        amount: dueAfterProcess,
        payment_mode: 'bank',
        reference: `SMOKE-FINAL-${Date.now()}`,
        transaction_date: new Date().toISOString().slice(0, 10),
        notes: 'Final payment',
        created_by: adminId,
      }),
    });
    const finalPaymentJson = await toJson(finalPaymentRes);
    assert.equal(finalPaymentRes.status, 201, `final payment failed: ${JSON.stringify(finalPaymentJson)}`);
    assert.equal(String(finalPaymentJson?.po_status || ''), 'fully_paid', 'PO lifecycle should become fully_paid after final payment');
    assert.equal(String(finalPaymentJson?.payment_status || ''), 'paid', 'payment status should become paid after final payment');
    assert.equal(toNumber(finalPaymentJson?.balance_due), 0, 'balance should be zero after final payment');

    const poAfterFinalRes = await adminRequest(`/api/purchase-orders/${createdPoId}`);
    const poAfterFinalJson = await toJson(poAfterFinalRes);
    assert.equal(poAfterFinalRes.status, 200, `PO fetch after final payment failed: ${JSON.stringify(poAfterFinalJson)}`);
    assert.equal(String(poAfterFinalJson?.po_status || ''), 'fully_paid', 'stored PO lifecycle should be fully_paid');
    assert.equal(String(poAfterFinalJson?.payment_status || ''), 'paid', 'stored payment status should be paid');
    assert.equal(toNumber(poAfterFinalJson?.balance_due), 0, 'stored balance should be zero');

    const ledgerRes = await adminRequest(`/api/distributors/${createdDistributorId}/ledger?limit=200`);
    const ledgerJson = await toJson(ledgerRes);
    assert.equal(ledgerRes.status, 200, `distributor ledger fetch failed: ${JSON.stringify(ledgerJson)}`);
    const ledgerRows = Array.isArray(ledgerJson) ? ledgerJson : [];
    const poCreditEntry = ledgerRows.find((row) =>
      String(row?.source || '').toLowerCase() === 'purchase_order'
      && String(row?.source_id || '').replace(/\.0+$/, '') === String(createdPoId)
      && String(row?.type || '').toLowerCase() === 'credit'
    );
    const poPaymentEntries = ledgerRows.filter((row) => String(row?.source || '').toLowerCase() === 'po_payment');
    assert.equal(Boolean(poCreditEntry), true, 'khata should include automatic PO credit entry');
    assert.equal(poPaymentEntries.length >= 2, true, 'khata should include process payment + final payment entries');

    const filteredPaidRes = await adminRequest('/api/purchase-orders?status=fully_paid&payment_status=paid');
    const filteredPaidJson = await toJson(filteredPaidRes);
    assert.equal(filteredPaidRes.status, 200, `filtered PO list failed: ${JSON.stringify(filteredPaidJson)}`);
    const filteredRows = Array.isArray(filteredPaidJson) ? filteredPaidJson : [];
    const filteredMatch = filteredRows.find((row) => String(row?.id) === String(createdPoId));
    assert.equal(Boolean(filteredMatch), true, 'filtered PO list should include processed+paid PO');

    const deleteProcessedRes = await adminRequest(`/api/purchase-orders/${createdPoId}`, { method: 'DELETE' });
    const deleteProcessedJson = await toJson(deleteProcessedRes);
    assert.equal(deleteProcessedRes.status, 400, `processed PO delete should be blocked: ${JSON.stringify(deleteProcessedJson)}`);

    console.log('PO lifecycle workflow smoke test passed.');
  } finally {
    if (pool) {
      if (createdPoId > 0) {
        await pool.query('DELETE FROM purchase_order_payments WHERE purchase_order_id = $1', [createdPoId]).catch(() => {});
        await pool.query('DELETE FROM purchase_order_items WHERE order_id = $1', [createdPoId]).catch(() => {});
        await pool.query('DELETE FROM purchase_orders WHERE id = $1', [createdPoId]).catch(() => {});
      }
      if (createdDistributorId > 0) {
        await pool.query('DELETE FROM distributor_ledger WHERE distributor_id = $1', [createdDistributorId]).catch(() => {});
        await pool.query('DELETE FROM distributors WHERE id = $1', [createdDistributorId]).catch(() => {});
      }
      if (createdProductId > 0) {
        await pool.query('DELETE FROM products WHERE id = $1', [createdProductId]).catch(() => {});
      }
      await pool.end().catch(() => {});
    }
    await terminateServer(server);
    if (appInstance?.closeRuntime) {
      await appInstance.closeRuntime().catch(() => {});
    }
  }
};

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
