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
  testName: 'Order flow smoke test',
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

const main = async () => {
  const port = 5700 + Math.floor(Math.random() * 200);
  const authSecret = `order-flow-secret-${randomSuffix()}`;
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
        'Order flow smoke test skipped because no dedicated smoke-test database is configured.',
        ['Set SMOKE_TEST_DB_URL to run the test safely.']
      );
      return;
    }
    if (!hasDbEnv) {
      throw new Error('Order flow smoke test requires SMOKE_TEST_DB_URL. Set SMOKE_TEST_ALLOW_PRIMARY_DB=1 only if you intentionally want to reuse the primary app DB.');
    }

    const boot = await spawnTestServer(port, authSecret);
    server = boot.server;
    appInstance = boot.app || null;
    readLogs = boot.readLogs;

    const baseUrl = `http://127.0.0.1:${port}`;
    request = makeRequest(baseUrl);
    if (!request) {
      throw new Error('Order flow smoke test could not initialize HTTP client.');
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
      const logs = readLogs();
      const dbBootFailed = /Database initialization failed|Postgres\/Supabase initialization failed|ECONNREFUSED/i.test(logs.stderr);
      if (allowSkipIfNoDb && dbBootFailed) {
        logSmokeSkipInfo(
          'Order flow smoke test skipped because the database is unavailable.',
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
          'Order flow smoke test skipped because the database is unavailable.',
          ['Set SMOKE_TEST_DB_URL to run the test safely.']
        );
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

    const customerSessionRes = await customerRequest('/api/auth/session');
    const customerSessionJson = await toJson(customerSessionRes);
    assert.equal(
      customerSessionRes.status,
      200,
      `customer session auth failed: ${JSON.stringify(customerSessionJson)}`
    );

    const sku = `SMK-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const productName = `Smoke Product ${randomSuffix()}`;
    const productCreateRes = await adminRequest('/api/products', {
      method: 'POST',
      body: JSON.stringify({
        name: productName,
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

    const activeOfferStartAt = new Date(Date.now() - (5 * 60 * 1000)).toISOString();
    const activeOfferEndAt = new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString();
    const futureOfferStartAt = new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString();
    const futureOfferEndAt = new Date(Date.now() + (48 * 60 * 60 * 1000)).toISOString();

    const futureOfferRes = await adminRequest('/api/offers', {
      method: 'POST',
      body: JSON.stringify({
        name: `Future Offer ${randomSuffix()}`,
        type: 'percentage',
        value: 50,
        apply_to_product: productId,
        min_quantity: 1,
        start_at: futureOfferStartAt,
        end_at: futureOfferEndAt,
        status: 'active',
      }),
    });
    const futureOfferJson = await toJson(futureOfferRes);
    assert.equal(futureOfferRes.status, 201, `future offer create failed: ${JSON.stringify(futureOfferJson)}`);

    const offerCreateRes = await adminRequest('/api/offers', {
      method: 'POST',
      body: JSON.stringify({
        name: `Smoke Offer ${randomSuffix()}`,
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
    assert.equal(offerCreateRes.status, 201, `offer create failed: ${JSON.stringify(offerCreateJson)}`);
    const offerId = Number(offerCreateJson?.id || 0);
    assert.equal(offerId > 0, true, 'created offer id missing');

    const allScopeOfferRes = await adminRequest('/api/offers', {
      method: 'POST',
      body: JSON.stringify({
        name: `All Scope Offer ${randomSuffix()}`,
        type: 'fixed',
        value: 7,
        apply_to_category: 'ALL',
        min_quantity: 1,
        first_order_only: true,
        start_at: activeOfferStartAt,
        end_at: activeOfferEndAt,
        status: 'active',
      }),
    });
    const allScopeOfferJson = await toJson(allScopeOfferRes);
    assert.equal(allScopeOfferRes.status, 201, `all-scope offer create failed: ${JSON.stringify(allScopeOfferJson)}`);

    await pool.query(
      `INSERT INTO offers
         (name, description, type, value, min_quantity, apply_to_category, apply_to_product, buy_product_id, buy_quantity, get_product_id, get_quantity, start_date, end_date, start_at, end_at, status, first_order_only)
       VALUES
         ($1, '', 'percentage', 5, 1, NULL, NULL, NULL, 1, NULL, 1, NULL, NULL, $2, $3, 'active', TRUE)`,
      [`Legacy Global Offer ${randomSuffix()}`, activeOfferStartAt, activeOfferEndAt]
    );

    const productsListRes = await request(`/api/products?page=1&page_size=12&name=${encodeURIComponent(productName)}`);
    const productsListJson = await toJson(productsListRes);
    assert.equal(productsListRes.status, 200, `products list failed: ${JSON.stringify(productsListJson)}`);
    assert.match(
      String(productsListRes.headers.get('cache-control') || ''),
      /no-store/i,
      'products list with active offers should disable public caching'
    );
    const listedProduct = Array.isArray(productsListJson?.items)
      ? productsListJson.items.find((item) => Number(item?.id || 0) === productId)
      : null;
    assert.equal(Boolean(listedProduct), true, 'products list should include created product');
    assert.equal(Boolean(listedProduct?.offer_display?.has_offer), true, 'products list should decorate product with active offers');
    assert.equal(Number(listedProduct?.offer_display?.display_price || 0), 90, 'products list should expose discounted display price');
    assert.equal(
      String(listedProduct?.offer_display?.display_offer_label || '').trim(),
      '10% OFF | First order only',
      'products list should expose active offer label'
    );
    assert.equal(
      Array.isArray(listedProduct?.active_offer_labels) && listedProduct.active_offer_labels.includes('10% OFF | First order only'),
      true,
      'products list should expose active offer badges'
    );
    assert.equal(
      Array.isArray(listedProduct?.active_offer_labels) && listedProduct.active_offer_labels.includes('Save Rs 7 | First order only'),
      true,
      'products list should expose ALL-scoped offer badges'
    );
    assert.equal(
      Array.isArray(listedProduct?.active_offer_labels) && listedProduct.active_offer_labels.includes('5% OFF | First order only'),
      true,
      'products list should expose legacy blank-scope offer badges'
    );

    const productDetailWithOfferRes = await request(`/api/products/${productId}`);
    const productDetailWithOfferJson = await toJson(productDetailWithOfferRes);
    assert.equal(productDetailWithOfferRes.status, 200, `product detail with offer failed: ${JSON.stringify(productDetailWithOfferJson)}`);
    assert.equal(Boolean(productDetailWithOfferJson?.offer_display?.has_offer), true, 'product detail should include offer decoration');
    assert.equal(
      String(productDetailWithOfferJson?.offer_display?.display_offer_label || '').trim(),
      '10% OFF | First order only',
      'product detail should expose active offer label'
    );

    const suggestRes = await request(`/api/products/suggest?q=${encodeURIComponent(productName)}`);
    const suggestJson = await toJson(suggestRes);
    assert.equal(suggestRes.status, 200, `product suggest failed: ${JSON.stringify(suggestJson)}`);
    const suggestedProduct = Array.isArray(suggestJson?.items)
      ? suggestJson.items.find((item) => Number(item?.id || 0) === productId)
      : null;
    assert.equal(Boolean(suggestedProduct), true, 'product suggest should include created product');
    assert.equal(Boolean(suggestedProduct?.offer_display?.has_offer), true, 'product suggest should include offer decoration');
    assert.equal(
      Array.isArray(suggestedProduct?.active_offer_labels) && suggestedProduct.active_offer_labels.includes('10% OFF | First order only'),
      true,
      'product suggest should expose active offer badges'
    );

    const previewBeforeOrderRes = await customerRequest('/api/offers/preview', {
      method: 'POST',
      body: JSON.stringify({
        context: 'cart',
        items: [
          {
            product_id: productId,
            product_name: productName,
            quantity: 3,
            unit: 'pcs',
          },
        ],
      }),
    });
    const previewBeforeOrderJson = await toJson(previewBeforeOrderRes);
    assert.equal(previewBeforeOrderRes.status, 200, `offer preview before order failed: ${JSON.stringify(previewBeforeOrderJson)}`);
    if (previewBeforeOrderJson?.debug) {
      assert.equal(
        Number(previewBeforeOrderJson?.debug?.auth_user_id || 0) > 0,
        true,
        `offer preview auth resolution failed: ${JSON.stringify(previewBeforeOrderJson?.debug)}`
      );
    }
    assert.equal(
      Number(previewBeforeOrderJson?.summary?.auto_offer_discount_total || 0),
      30,
      `offer preview should include active discount before first order: ${JSON.stringify(previewBeforeOrderJson)}`
    );
    assert.equal(
      String(previewBeforeOrderJson?.items?.[0]?.best_offer_label || '').trim(),
      '10% OFF | First order only',
      'offer preview should expose active offer label before first order'
    );
    assert.equal(Number(previewBeforeOrderJson?.summary?.total || 0), 297, 'offer preview total should include discount and tax before first order');

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
    assert.equal(orderCreateRes.status, 201, `order create failed: ${JSON.stringify(orderCreateJson)}`);
    const orderId = Number(orderCreateJson?.orderId || 0);
    assert.equal(orderId > 0, true, 'Created order id missing');
    assert.equal(Number(orderCreateJson?.totalAmount || 0), 297, 'order total should include offer discount before tax');

    const orderItemRow = await pool.query(
      `SELECT id, line_subtotal, offer_discount, manual_discount, offer_label, total
       FROM order_items
       WHERE order_id = $1
       ORDER BY id ASC
       LIMIT 1`,
      [orderId]
    );
    const createdOrderItem = orderItemRow.rows?.[0] || null;
    const createdOrderItemId = Number(createdOrderItem?.id || 0);
    assert.equal(createdOrderItemId > 0, true, 'order item id missing');
    assert.equal(Number(createdOrderItem?.line_subtotal || 0), 300, 'order line subtotal should preserve pre-discount amount');
    assert.equal(Number(createdOrderItem?.offer_discount || 0), 30, 'order item should persist applied offer discount');
    assert.equal(Number(createdOrderItem?.manual_discount || 0), 0, 'order item should persist manual discount separately');
    assert.equal(String(createdOrderItem?.offer_label || '').trim(), '10% OFF | First order only', 'order item should persist applied offer label');
    assert.equal(Number(createdOrderItem?.total || 0), 270, 'order item total should reflect discount');

    const offerUpdateRes = await adminRequest(`/api/offers/${offerId}`, {
      method: 'PUT',
      body: JSON.stringify({ value: 25 }),
    });
    const offerUpdateJson = await toJson(offerUpdateRes);
    assert.equal(offerUpdateRes.status, 200, `offer update after order create failed: ${JSON.stringify(offerUpdateJson)}`);
    assert.equal(Number(offerUpdateJson?.value || 0), 25, 'offer update should persist the new percentage');

    const billBeforeReceiveRes = await adminRequest('/api/bills/create', {
      method: 'POST',
      body: JSON.stringify({
        order_id: orderId,
        customer_id: customerId,
        paid_amount: 0,
        bill_type: 'sales',
        items: [
          {
            linked_order_item_id: createdOrderItemId,
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

    const restockRes = await adminRequest(`/api/products/${productId}`, {
      method: 'PUT',
      body: JSON.stringify({
        stock: 2,
      }),
    });
    const restockJson = await toJson(restockRes);
    assert.equal(restockRes.status, 200, `product restock before reapply failed: ${JSON.stringify(restockJson)}`);
    assert.equal(Number(restockJson?.stock || 0), 2, 'restock should set product stock back to 2');

    const reapplyPendingRes = await adminRequest(`/api/orders/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify({
        status: 'received',
        description: 'Smoke reapply pending after restock',
        reapply_pending: true,
      }),
    });
    const reapplyPendingJson = await toJson(reapplyPendingRes);
    assert.equal(reapplyPendingRes.status, 200, `reapply pending should succeed after restock: ${JSON.stringify(reapplyPendingJson)}`);
    assert.equal(Number(reapplyPendingJson?.fulfilled_qty || 0), 3, 'reapply pending should complete the remaining fulfillment');
    assert.equal(Number(reapplyPendingJson?.pending_qty || 0), 0, 'reapply pending should clear pending quantity');

    const productAfterReapplyRes = await request(`/api/products/${productId}`);
    const productAfterReapplyJson = await toJson(productAfterReapplyRes);
    assert.equal(productAfterReapplyRes.status, 200, `product fetch after reapply failed: ${JSON.stringify(productAfterReapplyJson)}`);
    assert.equal(Number(productAfterReapplyJson?.stock || 0), 0, 'reapply pending should consume the replenished stock');

    const invalidLinkedBillRes = await adminRequest('/api/bills/create', {
      method: 'POST',
      body: JSON.stringify({
        order_id: orderId,
        customer_id: customerId,
        paid_amount: 0,
        bill_type: 'sales',
        items: [
          {
            linked_order_item_id: createdOrderItemId + 999999,
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
    assert.equal(invalidLinkedBillRes.status, 400, `linked bill should reject an invalid order item reference: ${JSON.stringify(invalidLinkedBillJson)}`);

    const billCreateRes = await adminRequest('/api/bills/create', {
      method: 'POST',
      body: JSON.stringify({
        order_id: orderId,
        customer_id: customerId,
        paid_amount: 0,
        bill_type: 'sales',
        items: [
          {
            linked_order_item_id: createdOrderItemId,
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
    assert.equal(billCreateRes.status, 201, `order-linked bill create failed: ${JSON.stringify(billCreateJson)}`);
    assert.equal(Boolean(billCreateJson?.stock_applied), false, 'order-linked billing should not apply additional stock');

    const persistedBillRes = await adminRequest(`/api/bills/${billCreateJson?.bill_id}`);
    const persistedBillJson = await toJson(persistedBillRes);
    assert.equal(persistedBillRes.status, 200, `bill detail fetch failed: ${JSON.stringify(persistedBillJson)}`);
    assert.equal(Number(persistedBillJson?.subtotal || 0), 300, 'bill subtotal should preserve pre-discount amount');
    assert.equal(Number(persistedBillJson?.discount_amount || 0), 30, 'bill header discount should match applied offer total');
    assert.equal(Number(persistedBillJson?.total_amount || 0), 270, 'bill total should reflect offer discount');
    const persistedBillItem = Array.isArray(persistedBillJson?.items) ? persistedBillJson.items[0] : null;
    assert.equal(Number(persistedBillItem?.line_subtotal || 0), 300, 'bill item should persist line subtotal');
    assert.equal(Number(persistedBillItem?.offer_discount || 0), 30, 'bill item should persist offer discount');
    assert.equal(Number(persistedBillItem?.manual_discount || 0), 0, 'bill item should persist manual discount separately');
    assert.equal(String(persistedBillItem?.offer_label || '').trim(), '10% OFF | First order only', 'bill item should persist offer label');
    assert.equal(Number(persistedBillItem?.discount || 0), 30, 'bill item discount should still expose combined discount');
    assert.equal(Number(persistedBillItem?.amount || 0), 270, 'bill item amount should reflect discount');

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
            linked_order_item_id: createdOrderItemId,
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
    assert.equal(duplicateBillRes.status, 200, `duplicate order bill should dedupe: ${JSON.stringify(duplicateBillJson)}`);
    assert.equal(Boolean(duplicateBillJson?.deduplicated), true, 'duplicate order billing should be deduplicated');

    const customerCreditRes = await adminRequest(`/api/users/${customerId}/credit-history`);
    const customerCreditJson = await toJson(customerCreditRes);
    assert.equal(customerCreditRes.status, 200, `credit history fetch failed: ${JSON.stringify(customerCreditJson)}`);
    const billReference = String(billCreateJson?.bill_number || '').trim();
    const creditRows = Array.isArray(customerCreditJson)
      ? customerCreditJson
      : Array.isArray(customerCreditJson?.rows)
        ? customerCreditJson.rows
        : [];
    const creditMatch = creditRows.find((entry) => String(entry?.reference || '').trim() === billReference);
    assert.equal(Boolean(creditMatch), true, 'credit history should include order-linked bill reference');

    const orderDetailRes = await adminRequest(`/api/orders/${orderId}`);
    const orderDetailJson = await toJson(orderDetailRes);
    assert.equal(orderDetailRes.status, 200, `order detail fetch failed: ${JSON.stringify(orderDetailJson)}`);
    assert.equal(Boolean(orderDetailJson?.bill_id), true, 'order should expose linked bill_id');
    assert.equal(String(orderDetailJson?.payment_status || ''), 'pending', 'order payment_status should follow billing payment state');
    assert.equal(Number(orderDetailJson?.items?.[0]?.stock || 0), 0, 'order detail should include current product stock for admin receive review');

    const secondOrderRes = await customerRequest('/api/orders/create-validated', {
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
            quantity: 1,
            price: 100,
          },
        ],
      }),
    });
    const secondOrderJson = await toJson(secondOrderRes);
    assert.equal(secondOrderRes.status, 201, `second order create failed: ${JSON.stringify(secondOrderJson)}`);
    assert.equal(Number(secondOrderJson?.totalAmount || 0), 110, 'second order should not receive first-order-only offer');
    const secondOrderId = Number(secondOrderJson?.orderId || 0);
    assert.equal(secondOrderId > 0, true, 'second order id missing');
    const secondOrderItemRow = await pool.query(
      `SELECT line_subtotal, offer_discount, offer_label, total
       FROM order_items
       WHERE order_id = $1
       ORDER BY id ASC
       LIMIT 1`,
      [secondOrderId]
    );
    const secondOrderItem = secondOrderItemRow.rows?.[0] || null;
    assert.equal(Number(secondOrderItem?.line_subtotal || 0), 100, 'second order subtotal should remain base price');
    assert.equal(Number(secondOrderItem?.offer_discount || 0), 0, 'second order should not persist first-order discount');
    assert.equal(String(secondOrderItem?.offer_label || '').trim(), '', 'second order should not persist a first-order offer label');
    assert.equal(Number(secondOrderItem?.total || 0), 100, 'second order line total should remain undiscounted');

    const previewAfterFirstOrderRes = await request('/api/offers/preview', {
      method: 'POST',
      body: JSON.stringify({
        context: 'cart',
        offer_context: { customer_user_id: customerId },
        items: [
          {
            product_id: productId,
            product_name: productName,
            quantity: 1,
            unit: 'pcs',
          },
        ],
      }),
    });
    const previewAfterFirstOrderJson = await toJson(previewAfterFirstOrderRes);
    assert.equal(previewAfterFirstOrderRes.status, 200, `offer preview after first order failed: ${JSON.stringify(previewAfterFirstOrderJson)}`);
    assert.equal(Number(previewAfterFirstOrderJson?.summary?.auto_offer_discount_total || 0), 0, 'offer preview should stop applying first-order-only offer after first order');
    assert.equal(String(previewAfterFirstOrderJson?.items?.[0]?.best_offer_label || '').trim(), '', 'offer preview should clear first-order label after first order');
    assert.equal(Number(previewAfterFirstOrderJson?.summary?.total || 0), 110, 'offer preview total should fall back to undiscounted price plus tax after first order');

    const adminBillingPreviewRes = await adminRequest('/api/offers/preview', {
      method: 'POST',
      body: JSON.stringify({
        context: 'billing',
        offer_context: { customer_user_id: customerId },
        items: [
          {
            product_id: productId,
            product_name: productName,
            quantity: 1,
            unit: 'pcs',
          },
        ],
      }),
    });
    const adminBillingPreviewJson = await toJson(adminBillingPreviewRes);
    assert.equal(adminBillingPreviewRes.status, 200, `admin billing offer preview failed: ${JSON.stringify(adminBillingPreviewJson)}`);
    if (adminBillingPreviewJson?.debug) {
      assert.equal(
        Number(adminBillingPreviewJson?.debug?.eligibility_context?.customer_user_id || 0),
        customerId,
        `admin billing preview should use the selected billing customer: ${JSON.stringify(adminBillingPreviewJson?.debug)}`
      );
    }
    assert.equal(
      Number(adminBillingPreviewJson?.summary?.auto_offer_discount_total || 0),
      0,
      'admin billing preview should not apply first-order-only offer to a customer who already ordered'
    );
    assert.equal(
      String(adminBillingPreviewJson?.items?.[0]?.best_offer_label || '').trim(),
      '',
      'admin billing preview should clear first-order label for an existing customer'
    );
    assert.equal(
      Number(adminBillingPreviewJson?.summary?.total || 0),
      100,
      'admin billing preview should keep billing totals untaxed and undiscounted for an existing customer'
    );

    const partialRestockRes = await adminRequest(`/api/products/${productId}`, {
      method: 'PUT',
      body: JSON.stringify({
        stock: 1,
      }),
    });
    const partialRestockJson = await toJson(partialRestockRes);
    assert.equal(partialRestockRes.status, 200, `product restock before partial available_now bill failed: ${JSON.stringify(partialRestockJson)}`);
    assert.equal(Number(partialRestockJson?.stock || 0), 1, 'restock should prepare one unit for partial available_now billing');

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
    assert.equal(partialOrderRes.status, 201, `partial available_now order create failed: ${JSON.stringify(partialOrderJson)}`);
    const partialOrderId = Number(partialOrderJson?.orderId || 0);
    assert.equal(partialOrderId > 0, true, 'partial available_now order id missing');

    const partialReceiveRes = await adminRequest(`/api/orders/${partialOrderId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'received', description: 'Smoke receive before partial available_now billing' }),
    });
    const partialReceiveJson = await toJson(partialReceiveRes);
    assert.equal(partialReceiveRes.status, 200, `partial receive before available_now bill failed: ${JSON.stringify(partialReceiveJson)}`);
    assert.equal(Number(partialReceiveJson?.fulfilled_qty || 0), 1, 'partial available_now order should only fulfill one unit');
    assert.equal(Number(partialReceiveJson?.pending_qty || 0), 1, 'partial available_now order should keep one pending unit');

    const partialOrderItemRow = await pool.query(
      `SELECT id
       FROM order_items
       WHERE order_id = $1
       ORDER BY id ASC
       LIMIT 1`,
      [partialOrderId]
    );
    const partialOrderItemId = Number(partialOrderItemRow.rows?.[0]?.id || 0);
    assert.equal(partialOrderItemId > 0, true, 'partial available_now order item id missing');

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
    assert.equal(partialBillRes.status, 201, `partial available_now bill create failed: ${JSON.stringify(partialBillJson)}`);
    assert.equal(Number(partialBillJson?.fulfilled_qty || 0), 1, 'partial available_now bill response should report one billed unit');
    assert.equal(Number(partialBillJson?.pending_qty || 0), 1, 'partial available_now bill response should report one pending unit');

    const partialPersistedBillRes = await adminRequest(`/api/bills/${partialBillJson?.bill_id}`);
    const partialPersistedBillJson = await toJson(partialPersistedBillRes);
    assert.equal(partialPersistedBillRes.status, 200, `partial available_now bill fetch failed: ${JSON.stringify(partialPersistedBillJson)}`);
    assert.equal(Number(partialPersistedBillJson?.subtotal || 0), 100, 'partial available_now bill subtotal should only charge fulfilled quantity');
    assert.equal(Number(partialPersistedBillJson?.discount_amount || 0), 0, 'partial available_now bill should not invent a discount');
    assert.equal(Number(partialPersistedBillJson?.total_amount || 0), 100, 'partial available_now bill total should only charge fulfilled quantity');
    const partialBillItem = Array.isArray(partialPersistedBillJson?.items) ? partialPersistedBillJson.items[0] : null;
    assert.equal(Number(partialBillItem?.qty || 0), 1, 'partial available_now bill item qty should match fulfilled quantity');
    assert.equal(Number(partialBillItem?.requested_qty || 0), 2, 'partial available_now bill item should keep requested quantity for traceability');
    assert.equal(Number(partialBillItem?.fulfilled_qty || 0), 1, 'partial available_now bill item should persist fulfilled quantity');
    assert.equal(Number(partialBillItem?.pending_qty || 0), 1, 'partial available_now bill item should persist pending quantity');
    assert.equal(Number(partialBillItem?.line_subtotal || 0), 100, 'partial available_now bill item subtotal should only charge the fulfilled quantity');
    assert.equal(Number(partialBillItem?.amount || 0), 100, 'partial available_now bill item amount should only charge the fulfilled quantity');

    console.log('Order->billing zero-stock workflow smoke test passed.');
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
