import assert from 'node:assert/strict';

// Mocking toLocalDateKey as it's used in the component
const toLocalDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const Y = date.getFullYear();
  const M = String(date.getMonth() + 1).padStart(2, '0');
  const D = String(date.getDate()).padStart(2, '0');
  return `${Y}-${M}-${D}`;
};

// The logic from CreditHistory.jsx (updated version)
const getEffectiveTransactionDateKey = (transaction) => {
  const txDateRaw = transaction?.transaction_date;
  if (txDateRaw) {
    if (typeof txDateRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(txDateRaw)) {
      return txDateRaw;
    }
    const d = new Date(txDateRaw);
    if (!Number.isNaN(d.getTime())) {
      return toLocalDateKey(d);
    }
  }
  const created = new Date(transaction?.created_at || '');
  return toLocalDateKey(created);
};

const getEffectiveTransactionTimestamp = (transaction) => {
  const txDateRaw = transaction?.transaction_date;
  if (txDateRaw) {
    const d = new Date(txDateRaw);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  const createdTs = new Date(transaction?.created_at || '').getTime();
  return Number.isFinite(createdTs) ? createdTs : 0;
};

const runTests = () => {
  console.log('Running Credit History Date Logic Tests...');

  // Case 1: Backdated transaction (Entered March 10, but happened March 6)
  const backdatedTx = {
    transaction_date: '2026-03-06',
    created_at: '2026-03-10T09:00:00Z'
  };
  
  const dateKey = getEffectiveTransactionDateKey(backdatedTx);
  const timestamp = getEffectiveTransactionTimestamp(backdatedTx);
  
  console.log(`Test 1 (Backdated): transaction_date=${backdatedTx.transaction_date}, created_at=${backdatedTx.created_at}`);
  console.log(`Result: dateKey=${dateKey}, timestamp=${new Date(timestamp).toISOString()}`);
  
  assert.equal(dateKey, '2026-03-06', 'Should use transaction_date for the key');
  assert.equal(new Date(timestamp).toISOString().split('T')[0], '2026-03-06', 'Should use transaction_date for timestamp');

  // Case 2: Normal transaction (No transaction_date, should use created_at)
  const normalTx = {
    transaction_date: null,
    created_at: '2026-03-08T10:00:00Z'
  };
  
  const normalDateKey = getEffectiveTransactionDateKey(normalTx);
  console.log(`Test 2 (Normal): created_at=${normalTx.created_at}`);
  console.log(`Result: dateKey=${normalDateKey}`);
  
  assert.equal(normalDateKey, '2026-03-08', 'Should fallback to created_at date');

  // Case 3: transaction_date is an ISO string (some APIs return it this way)
  const isoTx = {
    transaction_date: '2026-03-07T00:00:00.000Z',
    created_at: '2026-03-10T11:00:00Z'
  };
  const isoDateKey = getEffectiveTransactionDateKey(isoTx);
  console.log(`Test 3 (ISO string): transaction_date=${isoTx.transaction_date}`);
  console.log(`Result: dateKey=${isoDateKey}`);
  assert.equal(isoDateKey, '2026-03-07', 'Should parse ISO string transaction_date correctly');

  console.log('\nSUCCESS: All date logic tests passed!');
};

runTests();
