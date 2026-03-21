import assert from 'node:assert/strict';
import {
  applyCreditQuickFilters,
  getBalanceSummary,
  getLastTransactionFromHistory,
  getRecentActivityHint,
  truncateCreditDescription,
} from '../src/shared/utils/creditHistoryUi.mjs';

const NOW = new Date('2026-02-26T12:00:00Z').getTime();

const transactions = [
  { id: 1, type: 'given', created_at: '2026-02-24T10:00:00Z', amount: 100 },
  { id: 2, type: 'payment', created_at: '2026-02-20T10:00:00Z', amount: 30 },
  { id: 3, type: 'given', created_at: '2026-01-15T10:00:00Z', amount: 50 },
];

const getTimestamp = (transaction) => new Date(transaction.created_at).getTime();

const run = () => {
  const positive = getBalanceSummary(450);
  assert.equal(positive.headline, 'Balance Due');
  assert.equal(positive.directionLine, 'You owe the store');
  assert.equal(positive.toneClass, 'positive');

  const positiveAdmin = getBalanceSummary(450, { viewerRole: 'admin' });
  assert.equal(positiveAdmin.headline, 'Balance Due');
  assert.equal(positiveAdmin.directionLine, 'Customer owes the store');
  assert.equal(positiveAdmin.toneClass, 'positive');

  const negative = getBalanceSummary(-10);
  assert.equal(negative.headline, 'Advance Balance');
  assert.equal(negative.directionLine, 'Store owes you this amount');
  assert.equal(negative.toneClass, 'negative');

  const negativeAdmin = getBalanceSummary(-10, { viewerRole: 'admin' });
  assert.equal(negativeAdmin.headline, 'Advance Balance');
  assert.equal(negativeAdmin.directionLine, 'Store owes the customer');
  assert.equal(negativeAdmin.toneClass, 'negative');

  const settled = getBalanceSummary(0);
  assert.equal(settled.headline, 'All settled');
  assert.equal(settled.toneClass, 'neutral');

  const lastTransaction = getLastTransactionFromHistory(transactions, getTimestamp);
  assert.equal(lastTransaction.id, 1);

  const onlyGiven = applyCreditQuickFilters(transactions, {
    typeFilter: 'given',
    rangeFilter: 'all',
    nowTimestamp: NOW,
    getTimestamp,
  });
  assert.equal(onlyGiven.length, 2);

  const recentOnly = applyCreditQuickFilters(transactions, {
    typeFilter: 'all',
    rangeFilter: '7d',
    nowTimestamp: NOW,
    getTimestamp,
  });
  assert.deepEqual(recentOnly.map((item) => item.id), [1, 2]);

  const thisMonth = applyCreditQuickFilters(transactions, {
    typeFilter: 'all',
    rangeFilter: 'this_month',
    nowTimestamp: NOW,
    getTimestamp,
  });
  assert.deepEqual(thisMonth.map((item) => item.id), [1, 2]);

  const reminder = getRecentActivityHint(new Date('2025-12-01T00:00:00Z').getTime(), {
    nowTimestamp: NOW,
    idleDays: 30,
  });
  assert.equal(
    reminder,
    'No activity in last 30 days. Consider sending a reminder.'
  );

  const noReminder = getRecentActivityHint(new Date('2026-02-20T00:00:00Z').getTime(), {
    nowTimestamp: NOW,
    idleDays: 30,
  });
  assert.equal(noReminder, '');

  assert.equal(truncateCreditDescription('short text', 20), 'short text');
  assert.equal(
    truncateCreditDescription('this description is long enough to truncate', 18),
    'this descriptio...'
  );

  console.log('Credit history UI helper tests passed.');
};

run();
