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
  testName: 'Linked order billing regression smoke test',
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
  const timedOut = await Promise.race([
    exited.then(() => false),
    delay(timeoutMs).then(() => true),
  ]);
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
    server.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    server.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
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

const makeRequest =
  (baseUrl, token = '') =>
  async (pathname, init = {}) =>
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
    exp: now + 7 * 24 * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', String(secret || 'barman-store-local-secret'))
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
};

const randomSuffix = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const main = async () => {
  const port = 5750 + Math.floor(Math.random() * 100);
  const authSecret = `linked-order-billing-${randomSuffix()}`;
  const hasDbEnv = Boolean(smokeDbConfig.dbUrl);
  let server = null;
  let appInstance = null;
  let readLogs = () => ({ stdout: '', stderr: '' });
  let request = null;
  let pool = null;

  try {
    if (smokeDbConfig.shouldSkip) {
      logSmokeSkipInfo(smokeDbConfig.reason);
      return;
    }
    if (allowSkipIfNoDb && !hasDbEnv) {
      logSmokeSkipInfo(
        'Linked order billing regression smoke test skipped because no dedicated smoke-test database is configured.',
        ['Set SMOKE_TEST_DB_URL to run the test safely.']
      );
      return;
    }
    if (!hasDbEnv) {
      throw new Error('Linked order billing regression smoke test requires SMOKE_TEST_DB_URL.');
    }

    const boot = await spawnTestServer(port, authSecret);
    server = boot.server;
    appInstance = boot.app || null;
    readLogs = boot.readLogs;

    const baseUrl = `http://127.0.0.1:${port}`;
    request = makeRequest(baseUrl);

    let ready = false;
    for (let i = 0; i < 140; i += 1) {
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
      assert.equal(
        ready,
        true,
        `Server did not start in time. stderr:\n${logs.stderr}\nstdout:\n${logs.stdout}`
      );
    }

    pool = new Pool({ connectionString: String(smokeDbConfig.dbUrl || '').trim() });
    await pool.query('SELECT 1 AS ok');

    const adminRow = await pool.query(
      `SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1`
    );
    let adminId = Number(adminRow.rows?.[0]?.id || 0);
    if (!adminId) {
      const createdAdmin = await pool.query(
        `INSERT INTO users (role, name, email, email_verified, phone, phone_verified, address, password_hash, must_change_password)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          'admin',
          'Linked Smoke Admin',
          `admin-smoke-${randomSuffix()}@example.com`,
          1,
          null,
          0,
          null,
          'smoke-hash',
          0,
        ]
      );
      adminId = Number(createdAdmin.rows?.[0]?.id || 0);
    }
    assert.equal(adminId > 0, true, 'Admin user is required for linked order billing smoke test');

    const customerEmail = `customer-smoke-${randomSuffix()}@example.com`;
    const customerPhone = `9${Math.floor(Math.random() * 1_000_000_000)
      .toString()
      .padStart(9, '0')}`;
    const createdCustomer = await pool.query(
      `INSERT INTO users (role, name, email, email_verified, phone, phone_verified, address, password_hash, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        'customer',
        `Smoke Customer ${randomSuffix()}`,
        customerEmail,
        1,
        customerPhone,
        1,
        JSON.stringify({
          street: 'Smoke Street',
          city: 'Guwahati',
          state: 'Assam',
          zip: '781001',
          country: 'India',
        }),
        'smoke-hash',
        0,
      ]
    );
    const customerId = Number(createdCustomer.rows?.[0]?.id || 0);
    assert.equal(customerId > 0, true, 'Customer creation failed');

    const adminToken = signToken({ uid: adminId, role: 'admin' }, authSecret);
    const customerToken = signToken({ uid: customerId, role: 'customer' }, authSecret);
    const adminRequest = makeRequest(baseUrl, adminToken);
    const customerRequest = makeRequest(baseUrl, customerToken);

    const sku = `SMK-LINK-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const productName = `Linked Billing Product ${randomSuffix()}`;
    const productCreateRes = await adminRequest('/api/products', {
      method: 'POST',
      body: JSON.stringify({
        name: productName,
        price: 100,
        mrp: 100,
        stock: 3,
        category: 'Groceries',
        uom: 'pcs',
        sku,
      }),
    });
    const productCreateJson = await toJson(productCreateRes);
    assert.equal(
      productCreateRes.status,
      201,
      `product create failed: ${JSON.stringify(productCreateJson)}`
    );
    const productId = Number(productCreateJson?.id || 0);
    assert.equal(productId > 0, true, 'Created product id missing');

    const activeOfferStartAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const activeOfferEndAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const offerCreateRes = await adminRequest('/api/offers', {
      method: 'POST',
      body: JSON.stringify({
        name: `Linked Billing Offer ${randomSuffix()}`,
        type: 'percentage',
        value: 10,
        apply_to_product: productId,
        min_quantity: 1,
        first_order_only: true,
        start_at: activeOfferStartAt,
        end_at: activeOfferEndAt,
        status: 'active',
      }),
    });
    const offerCreateJson = await toJson(offerCreateRes);
    assert.equal(
      offerCreateRes.status,
      201,
      `offer create failed: ${JSON.stringify(offerCreateJson)}`
    );
    const offerId = Number(offerCreateJson?.id || 0);
    assert.equal(offerId > 0, true, 'Offer id missing');

    const orderCreateRes = await customerRequest('/api/orders/create-validated', {
      method: 'POST',
      body: JSON.stringify({
        customer_name: `Smoke Customer ${customerId}`,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        shipping_address: {
          street: 'Smoke Street',
          city: 'Guwahati',
          state: 'Assam',
          zip: '781001',
          country: 'India',
        },
        items: [
          {
            product_id: productId,
            product_name: productName,
            quantity: 3,
            price: 100,
          },
        ],
      }),
    });
    const orderCreateJson = await toJson(orderCreateRes);
    assert.equal(
      orderCreateRes.status,
      201,
      `order create failed: ${JSON.stringify(orderCreateJson)}`
    );
    const orderId = Number(orderCreateJson?.orderId || 0);
    assert.equal(orderId > 0, true, 'Created order id missing');
    assert.equal(
      Number(orderCreateJson?.totalAmount || 0),
      297,
      'order total should include first-order discount before tax'
    );

    const firstOrderItemRow = await pool.query(
      `SELECT id, line_subtotal, offer_discount, manual_discount, offer_label, total
       FROM order_items
       WHERE order_id = $1
       ORDER BY id ASC
       LIMIT 1`,
      [orderId]
    );
    const firstOrderItem = firstOrderItemRow.rows?.[0] || null;
    const firstOrderItemId = Number(firstOrderItem?.id || 0);
    assert.equal(firstOrderItemId > 0, true, 'linked order item id missing');
    assert.equal(
      Number(firstOrderItem?.line_subtotal || 0),
      300,
      'order line subtotal should preserve pre-discount amount'
    );
    assert.equal(
      Number(firstOrderItem?.offer_discount || 0),
      30,
      'order line should persist original offer discount'
    );
    assert.equal(
      Number(firstOrderItem?.manual_discount || 0),
      0,
      'order line should persist manual discount separately'
    );
    assert.equal(
      String(firstOrderItem?.offer_label || '').trim(),
      '10% OFF | First order only',
      'order line should persist original offer label'
    );
    assert.equal(
      Number(firstOrderItem?.total || 0),
      270,
      'order line total should reflect the original discount'
    );

    const offerUpdateRes = await adminRequest(`/api/offers/${offerId}`, {
      method: 'PUT',
      body: JSON.stringify({ value: 25 }),
    });
    const offerUpdateJson = await toJson(offerUpdateRes);
    assert.equal(
      offerUpdateRes.status,
      200,
      `offer update failed: ${JSON.stringify(offerUpdateJson)}`
    );
    assert.equal(
      Number(offerUpdateJson?.value || 0),
      25,
      'offer value should update after order placement'
    );

    const receiveRes = await adminRequest(`/api/orders/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify({
        status: 'received',
        description: 'Linked billing regression receive',
      }),
    });
    const receiveJson = await toJson(receiveRes);
    assert.equal(receiveRes.status, 200, `receive failed: ${JSON.stringify(receiveJson)}`);
    assert.equal(
      Number(receiveJson?.fulfilled_qty || 0),
      3,
      'received order should fulfill all requested quantity'
    );
    assert.equal(
      Number(receiveJson?.pending_qty || 0),
      0,
      'received order should have no pending quantity'
    );

    const invalidLinkedBillRes = await adminRequest('/api/bills/create', {
      method: 'POST',
      body: JSON.stringify({
        order_id: orderId,
        customer_id: customerId,
        paid_amount: 0,
        bill_type: 'sales',
        items: [
          {
            linked_order_item_id: firstOrderItemId + 999999,
            product_id: productId,
            product_name: productName,
            mrp: 100,
            qty: 3,
            unit: 'pcs',
            discount: 0,
            amount: 300,
          },
        ],
      }),
    });
    const invalidLinkedBillJson = await toJson(invalidLinkedBillRes);
    assert.equal(
      invalidLinkedBillRes.status,
      400,
      `linked bill should reject invalid order item ids: ${JSON.stringify(invalidLinkedBillJson)}`
    );

    const billCreateRes = await adminRequest('/api/bills/create', {
      method: 'POST',
      body: JSON.stringify({
        order_id: orderId,
        customer_id: customerId,
        paid_amount: 0,
        bill_type: 'sales',
        items: [
          {
            linked_order_item_id: firstOrderItemId,
            product_id: productId,
            product_name: productName,
            mrp: 100,
            qty: 3,
            unit: 'pcs',
            discount: 0,
            amount: 300,
          },
        ],
      }),
    });
    const billCreateJson = await toJson(billCreateRes);
    assert.equal(
      billCreateRes.status,
      201,
      `linked bill create failed: ${JSON.stringify(billCreateJson)}`
    );
    assert.equal(
      Boolean(billCreateJson?.stock_applied),
      false,
      'linked order billing should not apply stock twice'
    );

    const persistedBillRes = await adminRequest(`/api/bills/${billCreateJson?.bill_id}`);
    const persistedBillJson = await toJson(persistedBillRes);
    assert.equal(
      persistedBillRes.status,
      200,
      `linked bill fetch failed: ${JSON.stringify(persistedBillJson)}`
    );
    assert.equal(
      Number(persistedBillJson?.subtotal || 0),
      300,
      'linked bill subtotal should preserve original order subtotal'
    );
    assert.equal(
      Number(persistedBillJson?.discount_amount || 0),
      30,
      'linked bill discount should preserve original order discount'
    );
    assert.equal(
      Number(persistedBillJson?.total_amount || 0),
      270,
      'linked bill total should preserve original order total'
    );
    const persistedBillItem = Array.isArray(persistedBillJson?.items)
      ? persistedBillJson.items[0]
      : null;
    assert.equal(
      Number(persistedBillItem?.line_subtotal || 0),
      300,
      'linked bill item should preserve original subtotal'
    );
    assert.equal(
      Number(persistedBillItem?.offer_discount || 0),
      30,
      'linked bill item should preserve original offer discount'
    );
    assert.equal(
      Number(persistedBillItem?.manual_discount || 0),
      0,
      'linked bill item should preserve original manual discount'
    );
    assert.equal(
      String(persistedBillItem?.offer_label || '').trim(),
      '10% OFF | First order only',
      'linked bill item should preserve original offer label'
    );
    assert.equal(
      Number(persistedBillItem?.amount || 0),
      270,
      'linked bill item should preserve original discounted amount'
    );

    const duplicateBillRes = await adminRequest('/api/bills/create', {
      method: 'POST',
      body: JSON.stringify({
        order_id: orderId,
        customer_id: customerId,
        paid_amount: 0,
        bill_type: 'sales',
        items: [
          {
            linked_order_item_id: firstOrderItemId,
            product_id: productId,
            product_name: productName,
            mrp: 100,
            qty: 3,
            unit: 'pcs',
            discount: 0,
            amount: 300,
          },
        ],
      }),
    });
    const duplicateBillJson = await toJson(duplicateBillRes);
    assert.equal(
      duplicateBillRes.status,
      200,
      `duplicate linked bill should dedupe: ${JSON.stringify(duplicateBillJson)}`
    );
    assert.equal(
      Boolean(duplicateBillJson?.deduplicated),
      true,
      'duplicate linked bill should be deduplicated'
    );

    const restockRes = await adminRequest(`/api/products/${productId}`, {
      method: 'PUT',
      body: JSON.stringify({ stock: 1 }),
    });
    const restockJson = await toJson(restockRes);
    assert.equal(
      restockRes.status,
      200,
      `restock before partial bill failed: ${JSON.stringify(restockJson)}`
    );
    assert.equal(
      Number(restockJson?.stock || 0),
      1,
      'restock should prepare one unit for partial linked billing'
    );

    const partialOrderRes = await customerRequest('/api/orders/create-validated', {
      method: 'POST',
      body: JSON.stringify({
        customer_name: `Smoke Customer ${customerId}`,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        shipping_address: {
          street: 'Smoke Street',
          city: 'Guwahati',
          state: 'Assam',
          zip: '781001',
          country: 'India',
        },
        items: [
          {
            product_id: productId,
            product_name: productName,
            quantity: 2,
            price: 100,
          },
        ],
      }),
    });
    const partialOrderJson = await toJson(partialOrderRes);
    assert.equal(
      partialOrderRes.status,
      201,
      `partial linked order create failed: ${JSON.stringify(partialOrderJson)}`
    );
    const partialOrderId = Number(partialOrderJson?.orderId || 0);
    assert.equal(partialOrderId > 0, true, 'partial linked order id missing');
    assert.equal(
      Number(partialOrderJson?.totalAmount || 0),
      220,
      'second order should not reuse first-order-only discount'
    );

    const partialReceiveRes = await adminRequest(`/api/orders/${partialOrderId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'received', description: 'Partial linked billing receive' }),
    });
    const partialReceiveJson = await toJson(partialReceiveRes);
    assert.equal(
      partialReceiveRes.status,
      200,
      `partial receive failed: ${JSON.stringify(partialReceiveJson)}`
    );
    assert.equal(
      Number(partialReceiveJson?.fulfilled_qty || 0),
      1,
      'partial receive should only fulfill available quantity'
    );
    assert.equal(
      Number(partialReceiveJson?.pending_qty || 0),
      1,
      'partial receive should keep the remaining quantity pending'
    );

    const partialOrderItemRow = await pool.query(
      `SELECT id
       FROM order_items
       WHERE order_id = $1
       ORDER BY id ASC
       LIMIT 1`,
      [partialOrderId]
    );
    const partialOrderItemId = Number(partialOrderItemRow.rows?.[0]?.id || 0);
    assert.equal(partialOrderItemId > 0, true, 'partial linked order item id missing');

    const partialBillRes = await adminRequest('/api/bills/create', {
      method: 'POST',
      body: JSON.stringify({
        order_id: partialOrderId,
        customer_id: customerId,
        paid_amount: 0,
        bill_type: 'sales',
        fulfillment_mode: 'available_now',
        items: [
          {
            linked_order_item_id: partialOrderItemId,
            product_id: productId,
            product_name: productName,
            mrp: 100,
            qty: 2,
            unit: 'pcs',
            discount: 0,
            amount: 200,
          },
        ],
      }),
    });
    const partialBillJson = await toJson(partialBillRes);
    assert.equal(
      partialBillRes.status,
      201,
      `partial linked bill create failed: ${JSON.stringify(partialBillJson)}`
    );
    assert.equal(
      Number(partialBillJson?.fulfilled_qty || 0),
      1,
      'partial linked bill response should report one billed unit'
    );
    assert.equal(
      Number(partialBillJson?.pending_qty || 0),
      1,
      'partial linked bill response should report one pending unit'
    );

    const partialPersistedBillRes = await adminRequest(`/api/bills/${partialBillJson?.bill_id}`);
    const partialPersistedBillJson = await toJson(partialPersistedBillRes);
    assert.equal(
      partialPersistedBillRes.status,
      200,
      `partial linked bill fetch failed: ${JSON.stringify(partialPersistedBillJson)}`
    );
    assert.equal(
      Number(partialPersistedBillJson?.subtotal || 0),
      100,
      'partial linked bill subtotal should bill only fulfilled quantity'
    );
    assert.equal(
      Number(partialPersistedBillJson?.discount_amount || 0),
      0,
      'partial linked bill should not invent discounts'
    );
    assert.equal(
      Number(partialPersistedBillJson?.total_amount || 0),
      100,
      'partial linked bill total should bill only fulfilled quantity'
    );
    const partialPersistedBillItem = Array.isArray(partialPersistedBillJson?.items)
      ? partialPersistedBillJson.items[0]
      : null;
    assert.equal(
      Number(partialPersistedBillItem?.qty || 0),
      1,
      'partial linked bill item qty should match fulfilled quantity'
    );
    assert.equal(
      Number(partialPersistedBillItem?.requested_qty || 0),
      2,
      'partial linked bill item should keep requested quantity'
    );
    assert.equal(
      Number(partialPersistedBillItem?.fulfilled_qty || 0),
      1,
      'partial linked bill item should persist fulfilled quantity'
    );
    assert.equal(
      Number(partialPersistedBillItem?.pending_qty || 0),
      1,
      'partial linked bill item should persist pending quantity'
    );
    assert.equal(
      Number(partialPersistedBillItem?.line_subtotal || 0),
      100,
      'partial linked bill item subtotal should bill only fulfilled quantity'
    );
    assert.equal(
      Number(partialPersistedBillItem?.amount || 0),
      100,
      'partial linked bill item amount should bill only fulfilled quantity'
    );

    console.log('Linked order billing regression smoke test passed.');
  } finally {
    if (pool) {
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
