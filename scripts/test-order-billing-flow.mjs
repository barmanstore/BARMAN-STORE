import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import pg from 'pg';
import '../server/loadEnv.js';

const { Pool } = pg;
const allowSkipIfNoDb = ['1', 'true', 'yes', 'on'].includes(String(process.env.SMOKE_ALLOW_NO_DB || '').trim().toLowerCase());
const hasDbEnv = Boolean(
  process.env.SUPABASE_DB_URL
  || process.env.DATABASE_URL
  || process.env.POSTGRES_DB_URL
  || process.env.POSTGRES_URL
  || process.env.POSTGRES_PRISMA_URL
  || process.env.PG_CONNECTION_STRING
  || process.env.PGHOST
  || process.env.PG_HOST
  || process.env.POSTGRES_HOST
);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const main = async () => {
  const port = 5700 + Math.floor(Math.random() * 200);
  const authSecret = `order-flow-secret-${randomSuffix()}`;
  const server = spawn('node', ['server/index.js'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      AUTH_TOKEN_SECRET: authSecret,
      SUPABASE_AUTH_ENABLED: 'false',
    },
  });

  let stdout = '';
  let stderr = '';
  server.stdout.on('data', (chunk) => { stdout += String(chunk); });
  server.stderr.on('data', (chunk) => { stderr += String(chunk); });

  const baseUrl = `http://127.0.0.1:${port}`;
  const request = makeRequest(baseUrl);

  let pool = null;
  try {
    if (allowSkipIfNoDb && !hasDbEnv) {
      console.warn('[WARN] Order flow smoke test skipped because no database configuration is set.');
      console.warn('[WARN] Provide SUPABASE_DB_URL/DATABASE_URL to run the test.');
      return;
    }

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
      const dbBootFailed = /Database initialization failed|Postgres\/Supabase initialization failed|ECONNREFUSED/i.test(stderr);
      if (allowSkipIfNoDb && dbBootFailed) {
        console.warn('[WARN] Order flow smoke test skipped because the database is unavailable.');
        console.warn('[WARN] Provide SUPABASE_DB_URL/DATABASE_URL to run the test.');
        return;
      }
      assert.equal(ready, true, `Server did not start in time. stderr:\n${stderr}\nstdout:\n${stdout}`);
    }

    const dbUrl = String(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_DB_URL || '').trim();
    pool = dbUrl ? new Pool({ connectionString: dbUrl }) : new Pool();
    try {
      await pool.query('SELECT 1 AS ok');
    } catch (error) {
      if (allowSkipIfNoDb) {
        console.warn('[WARN] Order flow smoke test skipped because the database is unavailable.');
        console.warn('[WARN] Provide SUPABASE_DB_URL/DATABASE_URL to run the test.');
        return;
      }
      throw error;
    }

    const adminRow = await pool.query(`SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1`);
    let adminId = Number(adminRow.rows?.[0]?.id || 0);
    if (!adminId) {
      const adminEmail = `admin-smoke-${randomSuffix()}@example.com`;
      const createdAdmin = await pool.query(
        `INSERT INTO users (role, name, email, email_verified, phone, phone_verified, address, password_hash, must_change_password)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        ['admin', 'Smoke Admin', adminEmail, 1, null, 0, null, 'smoke-hash', 0]
      );
      adminId = Number(createdAdmin.rows?.[0]?.id || 0);
    }
    assert.equal(adminId > 0, true, 'Admin user is required for smoke test');

    const customerEmail = `customer-smoke-${randomSuffix()}@example.com`;
    const customerPhone = `9${Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, '0')}`;
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
        JSON.stringify({ street: 'Smoke Street', city: 'Guwahati', state: 'Assam', zip: '781001', country: 'India' }),
        'smoke-hash',
        0,
      ]
    );
    const customerId = Number(createdCustomer.rows?.[0]?.id || 0);
    assert.equal(customerId > 0, true, 'Customer creation failed for smoke test');

    const adminToken = signToken({ uid: adminId, role: 'admin' }, authSecret);
    const customerToken = signToken({ uid: customerId, role: 'customer' }, authSecret);
    const adminRequest = makeRequest(baseUrl, adminToken);
    const customerRequest = makeRequest(baseUrl, customerToken);

    const sku = `SMK-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const productCreateRes = await adminRequest('/api/products', {
      method: 'POST',
      body: JSON.stringify({
        name: `Smoke Product ${randomSuffix()}`,
        price: 100,
        mrp: 100,
        stock: 1,
        category: 'Groceries',
        uom: 'pcs',
        sku,
      }),
    });
    const productCreateJson = await toJson(productCreateRes);
    assert.equal(productCreateRes.status, 201, `product create failed: ${JSON.stringify(productCreateJson)}`);
    const productId = Number(productCreateJson?.id || 0);
    assert.equal(productId > 0, true, 'Created product id missing');

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
            product_name: 'Smoke Product',
            quantity: 3,
            price: 100,
          },
        ],
      }),
    });
    const orderCreateJson = await toJson(orderCreateRes);
    assert.equal(orderCreateRes.status, 201, `order create failed: ${JSON.stringify(orderCreateJson)}`);
    const orderId = Number(orderCreateJson?.orderId || 0);
    assert.equal(orderId > 0, true, 'Created order id missing');

    const billBeforeReceiveRes = await adminRequest('/api/bills/create', {
      method: 'POST',
      body: JSON.stringify({
        order_id: orderId,
        customer_id: customerId,
        paid_amount: 0,
        bill_type: 'sales',
        items: [
          {
            product_id: productId,
            product_name: 'Smoke Product',
            mrp: 100,
            qty: 2,
            unit: 'pcs',
            discount: 0,
            amount: 200,
          },
        ],
      }),
    });
    const billBeforeReceiveJson = await toJson(billBeforeReceiveRes);
    assert.equal(billBeforeReceiveRes.status, 409, `order-linked bill should block before receive: ${JSON.stringify(billBeforeReceiveJson)}`);

    const firstReceiveRes = await adminRequest(`/api/orders/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'received', description: 'Smoke receive attempt with zero stock' }),
    });
    const firstReceiveJson = await toJson(firstReceiveRes);
    assert.equal(firstReceiveRes.status, 200, `receive should allow partial fulfillment on low stock: ${JSON.stringify(firstReceiveJson)}`);
    assert.equal(Number(firstReceiveJson?.fulfilled_qty || 0), 1, 'fulfilled quantity should be limited by stock');
    assert.equal(Number(firstReceiveJson?.pending_qty || 0), 2, 'pending quantity should reflect unfulfilled requested quantity');

    const productAfterReceiveRes = await request(`/api/products/${productId}`);
    const productAfterReceiveJson = await toJson(productAfterReceiveRes);
    assert.equal(productAfterReceiveRes.status, 200, `product fetch after receive failed: ${JSON.stringify(productAfterReceiveJson)}`);
    assert.equal(Number(productAfterReceiveJson?.stock || 0), 0, 'stock should deduct only fulfilled quantity');

    const billCreateRes = await adminRequest('/api/bills/create', {
      method: 'POST',
      body: JSON.stringify({
        order_id: orderId,
        customer_id: customerId,
        paid_amount: 0,
        bill_type: 'sales',
        items: [
          {
            product_id: productId,
            product_name: 'Smoke Product',
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
    assert.equal(billCreateRes.status, 201, `order-linked bill create failed: ${JSON.stringify(billCreateJson)}`);
    assert.equal(Boolean(billCreateJson?.stock_applied), false, 'order-linked billing should not apply additional stock');

    const productAfterBillRes = await request(`/api/products/${productId}`);
    const productAfterBillJson = await toJson(productAfterBillRes);
    assert.equal(productAfterBillRes.status, 200, `product fetch after bill failed: ${JSON.stringify(productAfterBillJson)}`);
    assert.equal(Number(productAfterBillJson?.stock || 0), 0, 'stock should stay unchanged after order-linked billing');

    const duplicateBillRes = await adminRequest('/api/bills/create', {
      method: 'POST',
      body: JSON.stringify({
        order_id: orderId,
        customer_id: customerId,
        paid_amount: 0,
        bill_type: 'sales',
        items: [
          {
            product_id: productId,
            product_name: 'Smoke Product',
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
    assert.equal(duplicateBillRes.status, 200, `duplicate order bill should dedupe: ${JSON.stringify(duplicateBillJson)}`);
    assert.equal(Boolean(duplicateBillJson?.deduplicated), true, 'duplicate order billing should be deduplicated');

    const customerCreditRes = await adminRequest(`/api/users/${customerId}/credit-history`);
    const customerCreditJson = await toJson(customerCreditRes);
    assert.equal(customerCreditRes.status, 200, `credit history fetch failed: ${JSON.stringify(customerCreditJson)}`);
    const billReference = String(billCreateJson?.bill_number || '').trim();
    const creditMatch = Array.isArray(customerCreditJson)
      ? customerCreditJson.find((entry) => String(entry?.reference || '').trim() === billReference)
      : null;
    assert.equal(Boolean(creditMatch), true, 'credit history should include order-linked bill reference');

    const orderDetailRes = await adminRequest(`/api/orders/${orderId}`);
    const orderDetailJson = await toJson(orderDetailRes);
    assert.equal(orderDetailRes.status, 200, `order detail fetch failed: ${JSON.stringify(orderDetailJson)}`);
    assert.equal(Boolean(orderDetailJson?.bill_id), true, 'order should expose linked bill_id');
    assert.equal(String(orderDetailJson?.payment_status || ''), 'pending', 'order payment_status should follow billing payment state');

    console.log('Order->billing zero-stock workflow smoke test passed.');
  } finally {
    if (pool) {
      await pool.end().catch(() => {});
    }
    server.kill('SIGTERM');
    await delay(300);
  }
};

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
