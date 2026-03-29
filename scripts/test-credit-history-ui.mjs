import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  applyCreditQuickFilters,
  buildMonthlyCreditStatements,
  getBalanceSummary,
  getLastTransactionFromHistory,
  getRecentActivityHint,
  truncateCreditDescription,
} from '../src/shared/utils/creditHistoryUi.mjs';
import { buildCreditTransactionText } from '../shared/messageTemplates.js';
import { buildMessagePreview } from '../shared/textPreview.js';
import { MAX_URL_LENGTH, buildWhatsAppUrl } from '../src/shared/utils/whatsapp.js';
import {
  isCreditShareTextWithinWhatsAppLimit,
  trimCreditShareTextForWhatsApp,
} from '../src/features/credits/history/hooks/useCreditHistoryReports.js';

const require = createRequire(import.meta.url);
const { createCreditBadgeUtils } = require('../server/features/credits/utils/creditBadges.js');
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

  assert.equal(
    buildMessagePreview(`A👨‍👩‍👧‍👦B`, 2),
    `A👨‍👩‍👧‍👦`
  );

  const { buildCreditDisciplineProfile } = createCreditBadgeUtils({
    resolveCreditEntryTimestampMs: (entry) => new Date(entry.transaction_ts || entry.created_at).getTime(),
  });
  const profile = buildCreditDisciplineProfile([
    {
      id: 1,
      type: 'given',
      amount: 100,
      due_date: '2026-02-08',
      transaction_ts: '2026-02-01T10:00:00Z',
      created_at: '2026-02-01T10:00:00Z',
    },
    {
      id: 2,
      type: 'given',
      amount: 50,
      due_date: '2026-02-17',
      transaction_ts: '2026-02-10T10:00:00Z',
      created_at: '2026-02-10T10:00:00Z',
    },
    {
      id: 3,
      type: 'payment',
      amount: 40,
      transaction_ts: '2026-02-12T10:00:00Z',
      created_at: '2026-02-12T10:00:00Z',
    },
  ], {
    balance: 110,
    nowMs: new Date('2026-02-15T00:00:00Z').getTime(),
  });
  assert.equal(profile.summary.maintain_score_by_date, '2026-02-08');

  const transactionText = buildCreditTransactionText({
    companyTitle: "বৰ্মন ষ্ট'ৰ",
    dateLabel: '27/3/2026',
    typeLabel: 'Manual Sale',
    amount: 35,
    description: 'milk',
    reference: '-',
    previousBalance: 1264,
    updatedBalance: 1299,
    paymentProfile: {
      score: 86,
      label: 'Excellent',
      outstanding_amount: 1299,
      maintain_score_by_date: '2026-04-05',
    },
    onlineStoreUrl: 'https://barman-store.vercel.app',
  });
  const transactionLines = transactionText.split('\n');

  assert.equal(transactionLines[0], "বৰ্মন ষ্ট'ৰ");
  assert.equal(transactionLines[1], 'লেনদেন আপডেট');
  assert.equal(transactionLines[2], 'স্কোৰ: 86/100 | Excellent');
  assert.ok(
    transactionText.includes('ধৰণ: দোকানৰ বাকি যোগ কৰা হৈছে | পৰিমাণ: ₹35.00'),
    'customer-facing transaction text should map internal Manual Sale labels'
  );
  assert.ok(
    !transactionText.includes('পেমেন্ট স্কোৰ:'),
    'customer-facing transaction text should not repeat the score after the header'
  );
  assert.ok(
    /আপোনাৰ Excellent স্কোৰ বজাই ৰাখিবলৈ অনুগ্ৰহ কৰি .*2026 ৰ আগতে পৰিশোধ কৰক।/.test(transactionText),
    'customer-facing transaction text should include the English shared status label for established scored customers'
  );
  assert.ok(
    transactionText.includes('অনলাইন দোকান: https://barman-store.vercel.app'),
    'transaction text should keep the store link readable without emoji'
  );
  assert.ok(
    !/^🟡|^📊|^💳|^🛒/m.test(transactionText),
    'critical header and link lines should remain text-first'
  );
  assert.ok(
    !/[🙏�]/.test(transactionText),
    'credit transaction text should not rely on a trailing footer emoji'
  );
  assert.ok(
    buildWhatsAppUrl({ phone: '9999999999', text: transactionText }).length > MAX_URL_LENGTH,
    'the full WhatsApp launch URL should exceed the shared launcher limit before credit-history trimming'
  );

  const trimmedTransactionText = trimCreditShareTextForWhatsApp({
    phone: '9999999999',
    text: transactionText,
    shareType: 'transaction',
  });
  assert.ok(
    isCreditShareTextWithinWhatsAppLimit({
      phone: '9999999999',
      text: trimmedTransactionText,
    }),
    'credit-history WhatsApp trimming should fit the full launch URL contract before the launcher runs'
  );
  assert.ok(
    !trimmedTransactionText.includes('ৰেফ:'),
    'transaction WhatsApp trimming should drop the optional reference line first'
  );
  assert.ok(
    !trimmedTransactionText.includes('অনলাইন দোকান:'),
    'transaction WhatsApp trimming should drop the store URL before forcing the launcher fallback for routine notices'
  );
  assert.ok(
    trimmedTransactionText.includes('স্কোৰ: 86/100 | Excellent')
      && trimmedTransactionText.includes('তাৰিখ: 27/3/2026')
      && trimmedTransactionText.includes('বেলেঞ্চ: ₹1,264.00 -> ₹1,299.00'),
    'transaction WhatsApp trimming must keep the score, date, and balance lines intact'
  );

  const monthlyStatements = buildMonthlyCreditStatements([
    { id: 1, type: 'given', amount: 100, balance: 100, created_at: '2026-02-01T10:00:00Z' },
    { id: 2, type: 'payment', amount: 30, balance: 70, created_at: '2026-02-12T10:00:00Z' },
    { id: 3, type: 'given', amount: 50, balance: 120, created_at: '2026-03-05T10:00:00Z' },
  ], {
    getTimestamp,
    getDelta: (transaction) => (transaction.type === 'payment' ? -transaction.amount : transaction.amount),
    maxStatements: 6,
  });
  assert.equal(monthlyStatements.length, 2);
  assert.equal(monthlyStatements[0].monthKey, '2026-03');
  assert.equal(monthlyStatements[0].openingBalance, 70);
  assert.equal(monthlyStatements[0].closingBalance, 120);
  assert.equal(monthlyStatements[1].totalDebit, 100);
  assert.equal(monthlyStatements[1].totalCredit, 30);

  const newCustomerText = buildCreditTransactionText({
    companyTitle: "বৰ্মন ষ্ট'ৰ",
    dateLabel: '27/3/2026',
    typeLabel: 'Payment',
    amount: 20,
    description: 'part payment',
    reference: '-',
    previousBalance: 200,
    updatedBalance: 180,
    paymentProfile: {
      label: 'New',
      status: 'new',
      customer_tag: 'insufficient_history',
      outstanding_amount: 180,
      maintain_score_by_date: '2026-04-05',
    },
    onlineStoreUrl: 'https://barman-store.vercel.app',
  });
  assert.ok(
    newCustomerText.includes('আপোনাৰ পেমেন্ট স্কোৰ গঢ়ি তুলিবলৈ অনুগ্ৰহ কৰি'),
    'new customers should get softer score-building reminder copy instead of mature-status maintenance wording'
  );

  const noDueDateReminderText = buildCreditTransactionText({
    companyTitle: "বৰ্মন ষ্ট'ৰ",
    dateLabel: '27/3/2026',
    typeLabel: 'Payment',
    amount: 20,
    description: 'part payment',
    reference: '-',
    previousBalance: 200,
    updatedBalance: 180,
    paymentProfile: {
      score: 52,
      label: 'Good',
      outstanding_amount: 180,
    },
    onlineStoreUrl: 'https://barman-store.vercel.app',
  });
  assert.ok(
    !/পৰিশোধ কৰক।/.test(noDueDateReminderText),
    'messages must not fabricate or approximate a deadline when the canonical due date is absent'
  );

  console.log('Credit history UI helper tests passed.');
};

run();
