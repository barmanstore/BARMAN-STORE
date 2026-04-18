import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  getEffectiveTransactionDateKey,
  getEffectiveTransactionTimestamp,
} from '../src/features/credits/history/utils/creditHistoryHelpers.js';

const require = createRequire(import.meta.url);
const {
  resolveCreditTermsDays,
} = require('../server/features/credits/utils/creditStatusPolicy.js');

const runTests = () => {
  console.log('Running Credit History Date Logic Tests...');

  // Case 1: Backdated transaction (Entered March 10, but happened March 6)
  const backdatedTx = {
    transaction_date: '2026-03-06',
    created_at: '2026-03-10T09:00:00Z',
  };

  const dateKey = getEffectiveTransactionDateKey(backdatedTx);
  const timestamp = getEffectiveTransactionTimestamp(backdatedTx);

  console.log(
    `Test 1 (Backdated): transaction_date=${backdatedTx.transaction_date}, created_at=${backdatedTx.created_at}`
  );
  console.log(`Result: dateKey=${dateKey}, timestamp=${new Date(timestamp).toISOString()}`);

  assert.equal(dateKey, '2026-03-06', 'Should use transaction_date for the key');
  assert.equal(
    new Date(timestamp).toISOString().split('T')[0],
    '2026-03-06',
    'Should use transaction_date for timestamp'
  );

  // Case 2: Normal transaction (No transaction_date or transaction_ts, should use created_at)
  const normalTx = {
    transaction_date: null,
    created_at: '2026-03-08T10:00:00Z',
  };

  const normalDateKey = getEffectiveTransactionDateKey(normalTx);
  console.log(`Test 2 (Normal): created_at=${normalTx.created_at}`);
  console.log(`Result: dateKey=${normalDateKey}`);

  assert.equal(normalDateKey, '2026-03-08', 'Should fallback to created_at date');

  // Case 3: Prefer transaction_ts over created_at for chronological ordering
  const timedTx = {
    transaction_date: null,
    transaction_ts: '2026-03-07T15:45:00Z',
    created_at: '2026-03-10T11:00:00Z',
  };
  const timedDateKey = getEffectiveTransactionDateKey(timedTx);
  const timedTimestamp = getEffectiveTransactionTimestamp(timedTx);
  console.log(
    `Test 3 (transaction_ts): transaction_ts=${timedTx.transaction_ts}, created_at=${timedTx.created_at}`
  );
  console.log(
    `Result: dateKey=${timedDateKey}, timestamp=${new Date(timedTimestamp).toISOString()}`
  );
  assert.equal(timedDateKey, '2026-03-07', 'Should use transaction_ts date before created_at');
  assert.equal(
    new Date(timedTimestamp).toISOString(),
    '2026-03-07T15:45:00.000Z',
    'Should use transaction_ts timestamp before created_at'
  );

  // Case 4: transaction_date is an ISO string (some APIs return it this way)
  const isoTx = {
    transaction_date: '2026-03-07T00:00:00.000Z',
    created_at: '2026-03-10T11:00:00Z',
  };
  const isoDateKey = getEffectiveTransactionDateKey(isoTx);
  console.log(`Test 3 (ISO string): transaction_date=${isoTx.transaction_date}`);
  console.log(`Result: dateKey=${isoDateKey}`);
  assert.equal(isoDateKey, '2026-03-07', 'Should parse ISO string transaction_date correctly');

  // Case 5: Status-based due-window mapping
  const newStatusDays = resolveCreditTermsDays({
    creditTermsDays: 0,
    paymentSummary: {
      payment_status: 'new',
      customer_tag: 'insufficient_history',
    },
  });
  const goodStatusDays = resolveCreditTermsDays({
    creditTermsDays: 0,
    paymentSummary: {
      payment_status: 'good',
      payment_status_label: 'Good',
    },
  });
  const manualOverrideDays = resolveCreditTermsDays({
    creditTermsDays: 21,
    paymentSummary: {
      payment_status: 'excellent',
      payment_status_label: 'Excellent',
    },
  });
  console.log(
    `Test 5 (status windows): new=${newStatusDays}, good=${goodStatusDays}, override=${manualOverrideDays}`
  );
  assert.equal(newStatusDays, 7, 'New customers should use the first 7-day cycle');
  assert.equal(goodStatusDays, 30, 'Good customers should get the 30-day target window');
  assert.equal(manualOverrideDays, 21, 'Explicit profile overrides should still win');

  console.log('\nSUCCESS: All date logic tests passed!');
};

runTests();
