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

const randomSuffix = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const signToken = ({ uid, role = 'admin' }, secret) => {
  const now = Date.now();
  const payload = {
    uid: Number(uid || 0),
    role: String(role || 'admin'),
    iat: now,
    exp: now + (7 * 24 * 60 * 60 * 1000),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', String(secret || 'barman-store-local-secret'))
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
};

const getDbUrl = () => String(
  process.env.SUPABASE_DB_URL
  || process.env.DATABASE_URL
  || process.env.POSTGRES_DB_URL
  || ''
).trim();

const main = async () => {
  const port = 5800 + Math.floor(Math.random() * 200);
  const authSecret = `category-tree-secret-${randomSuffix()}`;
  const baseUrl = `http://127.0.0.1:${port}`;
  const request = makeRequest(baseUrl);

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

  let pool = null;

  const createdCategoryIds = [];
  let createdProductId = 0;
  try {
    if (allowSkipIfNoDb && !hasDbEnv) {
      console.warn('[WARN] Category tree smoke test skipped because no database configuration is set.');
      console.warn('[WARN] Provide SUPABASE_DB_URL/DATABASE_URL to run the test.');
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
      const dbBootFailed = /Database initialization failed|Postgres\/Supabase initialization failed|ECONNREFUSED/i.test(stderr);
      if (allowSkipIfNoDb && dbBootFailed) {
        console.warn('[WARN] Category tree smoke test skipped because the database is unavailable.');
        console.warn('[WARN] Provide SUPABASE_DB_URL/DATABASE_URL to run the test.');
        return;
      }
      assert.equal(ready, true, `Server did not start in time. stderr:\n${stderr}\nstdout:\n${stdout}`);
    }

    const dbUrl = getDbUrl();
    pool = dbUrl ? new Pool({ connectionString: dbUrl }) : new Pool();
    try {
      await pool.query('SELECT 1 AS ok');
    } catch (error) {
      if (allowSkipIfNoDb) {
        console.warn('[WARN] Category tree smoke test skipped because the database is unavailable.');
        console.warn('[WARN] Provide SUPABASE_DB_URL/DATABASE_URL to run the test.');
        return;
      }
      throw error;
    }

    const adminRow = await pool.query(`SELECT id, role FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1`);
    let adminId = Number(adminRow.rows?.[0]?.id || 0);
    if (!adminId) {
      const createdAdmin = await pool.query(
        `INSERT INTO users (role, name, email, email_verified, phone, phone_verified, address, password_hash, must_change_password)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        ['admin', 'Category Smoke Admin', `category-admin-${randomSuffix()}@example.com`, 1, null, 0, null, 'smoke-hash', 0]
      );
      adminId = Number(createdAdmin.rows?.[0]?.id || 0);
    }
    assert.equal(adminId > 0, true, 'Admin user is required for category tree smoke test');

    const adminToken = signToken({ uid: adminId, role: 'admin' }, authSecret);
    const adminRequest = makeRequest(baseUrl, adminToken);

    // Rule 1: Same child name is allowed under different parents.
    const stamp = randomSuffix();
    const parentARes = await adminRequest('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name: `CAT_PARENT_A_${stamp}` }),
    });
    const parentAJson = await toJson(parentARes);
    assert.equal(parentARes.status, 201, `create parent A failed: ${JSON.stringify(parentAJson)}`);
    const parentAId = Number(parentAJson?.id || 0);
    createdCategoryIds.push(parentAId);

    const parentBRes = await adminRequest('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name: `CAT_PARENT_B_${stamp}` }),
    });
    const parentBJson = await toJson(parentBRes);
    assert.equal(parentBRes.status, 201, `create parent B failed: ${JSON.stringify(parentBJson)}`);
    const parentBId = Number(parentBJson?.id || 0);
    createdCategoryIds.push(parentBId);

    const childARes = await adminRequest('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'SharedName', parent_id: parentAId }),
    });
    const childAJson = await toJson(childARes);
    assert.equal(childARes.status, 201, `create child under parent A failed: ${JSON.stringify(childAJson)}`);
    const childAId = Number(childAJson?.id || 0);
    createdCategoryIds.push(childAId);

    const childBRes = await adminRequest('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'SharedName', parent_id: parentBId }),
    });
    const childBJson = await toJson(childBRes);
    assert.equal(childBRes.status, 201, `create child under parent B failed: ${JSON.stringify(childBJson)}`);
    const childBId = Number(childBJson?.id || 0);
    createdCategoryIds.push(childBId);

    // Rule 2: Same child name under same parent must fail.
    const duplicateSiblingRes = await adminRequest('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'SharedName', parent_id: parentAId }),
    });
    const duplicateSiblingJson = await toJson(duplicateSiblingRes);
    assert.equal(duplicateSiblingRes.status, 409, `duplicate sibling should fail: ${JSON.stringify(duplicateSiblingJson)}`);

    // Rule 3: Move that would create same-name sibling in target parent must fail.
    const moveConflictRes = await adminRequest(`/api/categories/${childBId}/move`, {
      method: 'POST',
      body: JSON.stringify({ parent_id: parentAId }),
    });
    const moveConflictJson = await toJson(moveConflictRes);
    assert.equal(moveConflictRes.status, 409, `move conflict should fail: ${JSON.stringify(moveConflictJson)}`);

    // Rule 4: Product category_id should remain stable after PUT edit.
    const rootRes = await adminRequest('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name: `CAT_ROOT_${stamp}` }),
    });
    const rootJson = await toJson(rootRes);
    assert.equal(rootRes.status, 201, `create root category failed: ${JSON.stringify(rootJson)}`);
    const rootId = Number(rootJson?.id || 0);
    createdCategoryIds.push(rootId);

    const midRes = await adminRequest('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name: `CAT_MID_${stamp}`, parent_id: rootId }),
    });
    const midJson = await toJson(midRes);
    assert.equal(midRes.status, 201, `create middle category failed: ${JSON.stringify(midJson)}`);
    const midId = Number(midJson?.id || 0);
    createdCategoryIds.push(midId);

    const leafRes = await adminRequest('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name: `CAT_LEAF_${stamp}`, parent_id: midId }),
    });
    const leafJson = await toJson(leafRes);
    assert.equal(leafRes.status, 201, `create leaf category failed: ${JSON.stringify(leafJson)}`);
    const leafId = Number(leafJson?.id || 0);
    createdCategoryIds.push(leafId);

    const productSku = `CTREE-${randomSuffix()}`;

    const productRes = await adminRequest('/api/products', {
      method: 'POST',
      body: JSON.stringify({
        name: `Category Tree Product ${stamp}`,
        description: 'Category tree smoke product',
        price: 25,
        mrp: 30,
        stock: 5,
        uom: 'pcs',
        base_unit: 'pcs',
        uom_type: 'selling',
        conversion_factor: 1,
        category: rootJson?.name || 'Groceries',
        sku: productSku,
      }),
    });
    const productJson = await toJson(productRes);
    assert.equal(productRes.status, 201, `create product failed: ${JSON.stringify(productJson)}`);
    createdProductId = Number(productJson?.id || 0);
    assert.equal(createdProductId > 0, true, 'created product id missing');

    const patchCategoryRes = await adminRequest(`/api/products/${createdProductId}/category`, {
      method: 'PATCH',
      body: JSON.stringify({ category_id: leafId }),
    });
    const patchCategoryJson = await toJson(patchCategoryRes);
    assert.equal(patchCategoryRes.status, 200, `patch category failed: ${JSON.stringify(patchCategoryJson)}`);
    assert.equal(Number(patchCategoryJson?.category_id || 0), leafId, 'patched category_id mismatch');

    const putProductRes = await adminRequest(`/api/products/${createdProductId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: patchCategoryJson?.name,
        description: 'Updated in category tree smoke test',
        brand: patchCategoryJson?.brand_path || patchCategoryJson?.brand || '',
        sub_brand: patchCategoryJson?.sub_brand || '',
        content: patchCategoryJson?.content || '',
        color: patchCategoryJson?.color || '',
        price: Number(patchCategoryJson?.price || 0),
        mrp: Number(patchCategoryJson?.mrp || 0),
        uom: patchCategoryJson?.uom || 'pcs',
        base_unit: patchCategoryJson?.base_unit || patchCategoryJson?.uom || 'pcs',
        uom_type: patchCategoryJson?.uom_type || 'selling',
        conversion_factor: Number(patchCategoryJson?.conversion_factor || 1),
        sku: patchCategoryJson?.sku || '',
        barcode: patchCategoryJson?.barcode || '',
        image: patchCategoryJson?.image || '',
        stock: Number(patchCategoryJson?.stock || 0),
        category: patchCategoryJson?.category_path || patchCategoryJson?.category || '',
        subcategory: patchCategoryJson?.subcategory || '',
        expiry_date: patchCategoryJson?.expiry_date || null,
        default_discount: Number(patchCategoryJson?.default_discount || 0),
        discount_type: patchCategoryJson?.discount_type || 'fixed',
        is_active: Number(patchCategoryJson?.is_active ?? 1) === 1 ? 1 : 0,
      }),
    });
    const putProductJson = await toJson(putProductRes);
    assert.equal(putProductRes.status, 200, `put product failed: ${JSON.stringify(putProductJson)}`);
    assert.equal(Number(putProductJson?.category_id || 0), leafId, 'category_id drifted after product PUT');

    console.log('Category tree rules smoke test passed.');
  } finally {
    if (createdProductId > 0) {
      try {
        await request(`/api/products/${createdProductId}/permanent`, { method: 'DELETE' });
      } catch (_) {
        // ignore cleanup error
      }
    }

    const uniqueCategoryIds = Array.from(new Set(createdCategoryIds.filter((id) => Number(id) > 0)));
    for (const id of uniqueCategoryIds.reverse()) {
      try {
        await request(`/api/categories/${id}`, { method: 'DELETE' });
      } catch (_) {
        // ignore cleanup error
      }
    }

    server.kill('SIGTERM');
    await delay(300);
    if (pool) {
      await pool.end().catch(() => {});
    }
  }
};

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
