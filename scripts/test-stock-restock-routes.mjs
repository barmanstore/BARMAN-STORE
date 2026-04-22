import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerStockRoutes } = require('../server/features/commerce/routes/stockRoutes.js');

const createResponse = () => {
  const result = {
    statusCode: 200,
    body: null,
  };

  return {
    result,
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(payload) {
      result.body = payload;
      return result;
    },
  };
};

const registerHandlers = (overrides = {}) => {
  const handlers = new Map();
  const app = {
    get(path, ...routeHandlers) {
      handlers.set(`GET ${path}`, routeHandlers[routeHandlers.length - 1]);
    },
    post(path, ...routeHandlers) {
      handlers.set(`POST ${path}`, routeHandlers[routeHandlers.length - 1]);
    },
  };

  registerStockRoutes({
    app,
    requireAdmin: (_req, _res, next) => next?.(),
    requireCronSecret: (_req, _res, next) => next?.(),
    dbAllAsync: async () => [],
    dbGetAsync: async () => null,
    dbRunAsync: async () => ({}),
    dbTxAsync: async (handler) => handler(),
    logAdminAuditAsync: async () => {},
    logStockLedgerAsync: async () => {},
    resolveClientRequestId: () => 'manual-sync-test-batch',
    PURCHASE_STOCK_CAP: 1000,
    ...overrides,
  });

  return handlers;
};

const testManualStockSyncUpdatesProductsAndLogsLedger = async () => {
  const products = new Map([
    [
      11,
      {
        id: 11,
        name: 'Rice Bag',
        sku: 'RICE-1',
        stock: 3,
        category: 'Groceries',
        brand: 'Barman',
        is_active: 1,
      },
    ],
    [
      12,
      {
        id: 12,
        name: 'Milk Pack',
        sku: 'MILK-1',
        stock: 0,
        category: 'Dairy',
        brand: 'Fresh',
        is_active: 1,
      },
    ],
  ]);
  const ledgerCalls = [];
  const auditCalls = [];

  const handlers = registerHandlers({
    dbGetAsync: async (_sql, params) => {
      const productId = Number(params?.[0] || 0);
      return products.get(productId) || null;
    },
    dbRunAsync: async (_sql, params) => {
      const nextStock = Number(params?.[0] || 0);
      const productId = Number(params?.[1] || 0);
      const current = products.get(productId);
      if (current) {
        products.set(productId, { ...current, stock: nextStock });
      }
      return { changes: current ? 1 : 0 };
    },
    logStockLedgerAsync: async (payload) => {
      ledgerCalls.push(payload);
    },
    logAdminAuditAsync: async (_req, payload) => {
      auditCalls.push(payload);
    },
  });

  const syncHandler = handlers.get('POST /api/stock-ledger/adjustments');
  assert.ok(syncHandler, 'manual stock sync handler should register');

  const res = createResponse();
  await syncHandler(
    {
      user: { id: 7, name: 'Restock Admin' },
      body: {
        items: [
          { product_id: 11, quantity: 5, mode: 'increment', notes: 'Shelf refill' },
          { product_id: 12, quantity: 2, mode: 'increment' },
        ],
      },
    },
    res
  );

  assert.equal(res.result.statusCode, 200);
  assert.equal(res.result.body.success, true);
  assert.equal(res.result.body.sync_batch_id, 'manual-sync-test-batch');
  assert.deepEqual(
    res.result.body.items.map((row) => ({
      product_id: row.product_id,
      previous_stock: row.previous_stock,
      quantity_change: row.quantity_change,
      new_stock: row.new_stock,
    })),
    [
      { product_id: 11, previous_stock: 3, quantity_change: 5, new_stock: 8 },
      { product_id: 12, previous_stock: 0, quantity_change: 2, new_stock: 2 },
    ]
  );
  assert.equal(Number(products.get(11)?.stock || 0), 8);
  assert.equal(Number(products.get(12)?.stock || 0), 2);
  assert.equal(ledgerCalls.length, 2, 'each synced product should log a stock-ledger adjustment');
  assert.equal(ledgerCalls[0].referenceType, 'MANUAL_SYNC');
  assert.equal(auditCalls.length, 1, 'bulk sync should emit one audit event');
  assert.equal(auditCalls[0].action, 'stock.manual_sync');
};

const testManualStockSyncRejectsInvalidPayload = async () => {
  const handlers = registerHandlers();
  const syncHandler = handlers.get('POST /api/stock-ledger/adjustments');
  assert.ok(syncHandler, 'manual stock sync handler should register');

  const emptyRes = createResponse();
  await syncHandler({ user: { id: 1, name: 'Admin' }, body: {} }, emptyRes);
  assert.equal(emptyRes.result.statusCode, 400);
  assert.equal(emptyRes.result.body.error, 'At least one stock adjustment item is required');

  const negativeRes = createResponse();
  await syncHandler(
    {
      user: { id: 1, name: 'Admin' },
      body: { items: [{ product_id: 22, quantity: -1 }] },
    },
    negativeRes
  );
  assert.equal(negativeRes.result.statusCode, 400);
  assert.equal(
    negativeRes.result.body.error,
    'Each stock adjustment item requires a non-negative quantity'
  );
};

const run = async () => {
  await testManualStockSyncUpdatesProductsAndLogsLedger();
  await testManualStockSyncRejectsInvalidPayload();
  console.log('Stock restock route tests passed.');
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
