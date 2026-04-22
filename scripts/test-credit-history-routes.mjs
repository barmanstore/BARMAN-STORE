import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  registerCreditIssuesListRoutes,
} = require('../server/features/credits/routes/creditIssues/creditIssuesList.js');
const {
  registerCreditLedgerReportsRoutes,
} = require('../server/features/credits/routes/creditLedger/creditLedgerReports.js');
const { createCreditBalanceUtils } = require('../server/features/credits/utils/creditBalances.js');

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

const decodeCursor = (cursor) => {
  const normalized = String(cursor || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = normalized + '==='.slice((normalized.length + 3) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
};

const registerHandlers = (overrides = {}) => {
  const handlers = new Map();
  const app = {
    get(path, ...routeHandlers) {
      handlers.set(path, routeHandlers[routeHandlers.length - 1]);
    },
  };

  registerCreditIssuesListRoutes({
    app,
    requireAuth: (_req, _res, next) => next?.(),
    dbAllAsync: async () => [],
    dbGetAsync: async () => null,
    normalizeCreditIssueStatus: (status, { fallback = '' } = {}) => status || fallback,
    getLatestCreditEntryAsync: async () => null,
    getCustomerCreditProfileAsync: async () => ({ is_active: true, grace_days: 0 }),
    buildPaymentActivityBadges: () => ({ badges: [], summary: null }),
    ...overrides,
  });

  return handlers;
};

const registerReportHandlers = (overrides = {}) => {
  const handlers = new Map();
  const app = {
    get(path, ...routeHandlers) {
      handlers.set(path, routeHandlers[routeHandlers.length - 1]);
    },
    post(path, ...routeHandlers) {
      handlers.set(path, routeHandlers[routeHandlers.length - 1]);
    },
  };

  registerCreditLedgerReportsRoutes({
    app,
    requireAuth: (_req, _res, next) => next?.(),
    requireAdmin: (_req, _res, next) => next?.(),
    dbAllAsync: async () => [],
    dbGetAsync: async () => null,
    getLatestCreditEntryAsync: async () => null,
    rebuildAllCustomerPaymentIntelligence: async () => ({ success: true, rebuilt: 0 }),
    ...overrides,
  });

  return handlers;
};

const testCreditHistoryOrderingContract = async () => {
  const queries = [];
  const handlers = registerHandlers({
    dbAllAsync: async (sql, params) => {
      queries.push({ sql, params });
      return [
        { id: 30, transaction_ts: '2026-03-10T08:00:00Z', created_at: '2026-03-10T12:00:00Z' },
        { id: 29, transaction_ts: '2026-03-09T09:00:00Z', created_at: '2026-03-09T09:05:00Z' },
      ];
    },
  });

  const historyHandler = handlers.get('/api/users/:userId/credit-history');
  assert.ok(historyHandler, 'credit history handler should register');

  const firstRes = createResponse();
  await historyHandler(
    {
      params: { userId: '7' },
      authUser: { id: 7, role: 'customer' },
      query: { limit: '1' },
    },
    firstRes
  );

  assert.equal(firstRes.result.statusCode, 200);
  assert.equal(firstRes.result.body.hasMore, true);
  assert.ok(firstRes.result.body.nextCursor, 'expected a pagination cursor');

  const firstQuery = queries[0];
  assert.ok(
    firstQuery.sql.includes('ORDER BY ch.transaction_ts DESC, ch.created_at DESC, ch.id DESC')
  );
  assert.ok(
    !firstQuery.sql.includes('ORDER BY COALESCE(ch.transaction_ts, ch.created_at)'),
    'credit history should not fall back to created_at ordering'
  );

  const decodedCursor = decodeCursor(firstRes.result.body.nextCursor);
  assert.deepEqual(decodedCursor, ['2026-03-10T08:00:00Z', '2026-03-10T12:00:00Z', 30]);

  const secondRes = createResponse();
  await historyHandler(
    {
      params: { userId: '7' },
      authUser: { id: 7, role: 'customer' },
      query: { limit: '1', cursor: firstRes.result.body.nextCursor },
    },
    secondRes
  );

  assert.equal(secondRes.result.statusCode, 200);
  const secondQuery = queries[1];
  assert.ok(secondQuery.sql.includes('ch.transaction_ts < ?'));
  assert.ok(secondQuery.sql.includes('ch.transaction_ts = ? AND ch.created_at < ?'));
  assert.deepEqual(secondQuery.params, [
    '7',
    '2026-03-10T08:00:00Z',
    '2026-03-10T08:00:00Z',
    '2026-03-10T12:00:00Z',
    '2026-03-10T08:00:00Z',
    '2026-03-10T12:00:00Z',
    30,
    2,
  ]);
};

const testPaymentBadgesAreNotCached = async () => {
  let historyReads = 0;
  let latestReads = 0;
  let creditLimitReads = 0;
  let profileReads = 0;

  const handlers = registerHandlers({
    dbAllAsync: async (sql) => {
      if (sql.includes('FROM credit_history')) {
        historyReads += 1;
      }
      return [
        {
          id: 1,
          type: 'given',
          amount: 100,
          transaction_ts: '2026-03-10T12:00:00Z',
          transaction_date: '2026-03-10',
          due_date: '2026-03-20',
          created_at: '2026-03-10T12:00:00Z',
        },
      ];
    },
    dbGetAsync: async (sql) => {
      if (sql.includes('SELECT credit_limit FROM users')) {
        creditLimitReads += 1;
        return { credit_limit: 5000 };
      }
      return null;
    },
    getLatestCreditEntryAsync: async () => {
      latestReads += 1;
      return { balance: 100 };
    },
    getCustomerCreditProfileAsync: async () => {
      profileReads += 1;
      return { is_active: true, grace_days: 3 };
    },
    buildPaymentActivityBadges: () => ({
      badges: [{ key: 'good' }],
      summary: { payment_score: 88 },
    }),
  });

  const paymentBadgeHandler = handlers.get('/api/users/:userId/payment-badges');
  assert.ok(paymentBadgeHandler, 'payment badge handler should register');

  for (let index = 0; index < 2; index += 1) {
    const res = createResponse();
    await paymentBadgeHandler(
      {
        params: { userId: '7' },
        authUser: { id: 7, role: 'customer' },
        query: {},
      },
      res
    );
    assert.equal(res.result.statusCode, 200);
    assert.equal(res.result.body.summary.payment_score, 88);
  }

  assert.equal(historyReads, 2, 'payment badge reads should execute fresh ledger queries');
  assert.equal(
    latestReads,
    2,
    'payment badge reads should not reuse a stale cached latest balance'
  );
  assert.equal(creditLimitReads, 2);
  assert.equal(profileReads, 2);
};

const testRecalculateCreditBalancesChronologically = async () => {
  const updates = [];
  const { recalculateCreditBalancesForUser } = createCreditBalanceUtils({
    dbGetAsync: async () => null,
    dbAllAsync: async (sql, params) => {
      assert.ok(sql.includes('ORDER BY transaction_ts ASC, created_at ASC, id ASC'));
      assert.deepEqual(params, [42]);
      return [
        { id: 11, type: 'given', amount: 100 },
        { id: 12, type: 'payment', amount: 25 },
        { id: 13, type: 'given', amount: 10 },
      ];
    },
    dbRunAsync: async (sql, params) => {
      updates.push({ sql, params });
      return {};
    },
    normalizeCreditType: (type) =>
      String(type || '')
        .trim()
        .toLowerCase(),
  });

  const balance = await recalculateCreditBalancesForUser(42);
  assert.equal(balance, 85);
  assert.deepEqual(
    updates.map(({ params }) => params),
    [
      [100, 11],
      [75, 12],
      [85, 13],
    ]
  );
};

const testCreditAgingRebuildsStaleSnapshots = async () => {
  let customerReads = 0;
  let rebuilds = 0;

  const handlers = registerReportHandlers({
    dbAllAsync: async (sql) => {
      if (!sql.includes('FROM users u')) return [];
      customerReads += 1;
      if (customerReads === 1) {
        return [
          {
            customer_id: 76,
            customer_name: 'Demo Customer',
            email: 'demo@example.com',
            phone: '9999999999',
            credit_limit: 0,
            is_active: 1,
            grace_days: 3,
            current_balance: 4553,
            payment_score: 86,
            payment_status: 'excellent',
            payment_status_label: 'Excellent',
            payment_status_tone: 'excellent',
            payment_status_description: 'Old snapshot',
            payment_status_tag: null,
            customer_tag: null,
            snapshot_active: 1,
            is_defaulter: 0,
            limit_status: 'not_set',
            limit_status_label: 'Limit Not Set',
            credit_limit_utilization: 0,
            oldest_open_days: 29,
            oldest_overdue_days: 28,
            average_settlement_days: null,
            average_delay_days: 13,
            total_periods: 11,
            on_time_periods: 3,
            within_7d_periods: 2,
            within_30d_periods: 2,
            within_60d_periods: 0,
            late_periods: 4,
            missed_periods: 0,
            days_0_30: 4553,
            days_31_60: 0,
            days_61_90: 0,
            days_over_90: 0,
            badges: '[]',
            summary_line: 'Excellent · Due Rs 4553.00',
            model_version: 1,
          },
        ];
      }
      return [
        {
          customer_id: 76,
          customer_name: 'Demo Customer',
          email: 'demo@example.com',
          phone: '9999999999',
          credit_limit: 0,
          is_active: 1,
          grace_days: 3,
          current_balance: 4553,
          payment_score: 54,
          payment_status: 'good',
          payment_status_label: 'Good',
          payment_status_tone: 'good',
          payment_status_description: 'Current snapshot',
          payment_status_tag: null,
          customer_tag: null,
          snapshot_active: 1,
          is_defaulter: 0,
          limit_status: 'not_set',
          limit_status_label: 'Limit Not Set',
          credit_limit_utilization: 0,
          oldest_open_days: 29,
          oldest_overdue_days: 0,
          average_settlement_days: null,
          average_delay_days: 0,
          total_periods: 11,
          on_time_periods: 3,
          within_7d_periods: 2,
          within_30d_periods: 2,
          within_60d_periods: 0,
          late_periods: 1,
          missed_periods: 2,
          days_0_30: 4553,
          days_31_60: 0,
          days_61_90: 0,
          days_over_90: 0,
          badges: '[]',
          summary_line: 'Good · Score 54/100 · Due Rs 4553.00',
          model_version: 2,
        },
      ];
    },
    rebuildAllCustomerPaymentIntelligence: async () => {
      rebuilds += 1;
      return { success: true, rebuilt: 1 };
    },
  });

  const agingHandler = handlers.get('/api/credit/aging');
  assert.ok(agingHandler, 'credit aging handler should register');

  const res = createResponse();
  await agingHandler({}, res);

  assert.equal(rebuilds, 1, 'aging route should rebuild stale snapshots before responding');
  assert.equal(res.result.statusCode, 200);
  assert.equal(res.result.body.report[0].payment_status, 'good');
  assert.equal(res.result.body.report[0].payment_score, 54);
  assert.equal(res.result.body.summary.badge_counts.good, 1);
  assert.equal(res.result.body.summary.badge_counts.excellent, 0);
  assert.equal(res.result.body.summary.customers_defaulters, 0);
};

const run = async () => {
  await testCreditHistoryOrderingContract();
  await testPaymentBadgesAreNotCached();
  await testRecalculateCreditBalancesChronologically();
  await testCreditAgingRebuildsStaleSnapshots();
  console.log('Credit history route and balance recalculation tests passed.');
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
