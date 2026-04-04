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
import { buildCreditHistoryDayGroups } from '../src/features/credits/history/utils/creditHistoryHelpers.js';
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
  assert.equal(profile.summary.maintain_score_by_date, '2026-02-16');
  assert.equal(profile.summary.grace_days, 3);
  assert.equal(profile.summary.payment_status_label, 'Very Good');
  assert.equal(profile.summary.helper_mode, 'improve');

  const fifoShiftProfile = buildCreditDisciplineProfile([
    {
      id: 10,
      type: 'given',
      amount: 10,
      due_date: '2026-03-08',
      transaction_date: '2026-03-01',
      transaction_ts: '2026-03-01T10:00:00Z',
      created_at: '2026-03-01T10:00:00Z',
    },
    {
      id: 11,
      type: 'given',
      amount: 12,
      due_date: '2026-03-09',
      transaction_date: '2026-03-02',
      transaction_ts: '2026-03-02T10:00:00Z',
      created_at: '2026-03-02T10:00:00Z',
    },
    {
      id: 12,
      type: 'given',
      amount: 22,
      due_date: '2026-03-10',
      transaction_date: '2026-03-03',
      transaction_ts: '2026-03-03T10:00:00Z',
      created_at: '2026-03-03T10:00:00Z',
    },
    {
      id: 13,
      type: 'given',
      amount: 32,
      due_date: '2026-03-14',
      transaction_date: '2026-03-07',
      transaction_ts: '2026-03-07T09:00:00Z',
      created_at: '2026-03-07T09:00:00Z',
    },
    {
      id: 14,
      type: 'payment',
      amount: 30,
      transaction_date: '2026-03-07',
      transaction_ts: '2026-03-07T18:00:00Z',
      created_at: '2026-03-07T18:00:00Z',
    },
  ], {
    balance: 46,
    nowMs: new Date('2026-03-07T20:00:00Z').getTime(),
  });
  assert.equal(fifoShiftProfile.summary.payment_status_label, 'Excellent');
  assert.equal(fifoShiftProfile.summary.maintain_score_by_date, '2026-03-10');
  assert.equal(fifoShiftProfile.summary.helper_mode, 'maintain');

  const stagedDowngradeProfile = buildCreditDisciplineProfile([
    {
      id: 21,
      type: 'given',
      amount: 10,
      due_date: '2026-03-08',
      transaction_date: '2026-03-01',
      transaction_ts: '2026-03-01T10:00:00Z',
      created_at: '2026-03-01T10:00:00Z',
    },
    {
      id: 22,
      type: 'given',
      amount: 12,
      due_date: '2026-03-09',
      transaction_date: '2026-03-02',
      transaction_ts: '2026-03-02T10:00:00Z',
      created_at: '2026-03-02T10:00:00Z',
    },
  ], {
    balance: 22,
    nowMs: new Date('2026-03-30T00:00:00Z').getTime(),
  });
  assert.equal(stagedDowngradeProfile.summary.payment_status_label, 'Good');
  assert.equal(stagedDowngradeProfile.summary.maintain_score_by_date, '2026-03-31');
  assert.equal(stagedDowngradeProfile.summary.is_defaulter, false);
  assert.equal(stagedDowngradeProfile.summary.helper_mode, 'improve');

  const dayGroups = buildCreditHistoryDayGroups([
    {
      id: 10,
      type: 'given',
      amount: 100,
      transaction_date: '2026-03-28',
      transaction_ts: '2026-03-28T10:00:00Z',
      created_at: '2026-03-28T10:00:00Z',
    },
    {
      id: 11,
      type: 'payment',
      amount: 25,
      transaction_date: '2026-03-28',
      transaction_ts: '2026-03-28T08:00:00Z',
      created_at: '2026-03-28T08:00:00Z',
    },
    {
      id: 12,
      type: 'given',
      amount: 40,
      transaction_date: '2026-03-27',
      transaction_ts: '2026-03-27T09:00:00Z',
      created_at: '2026-03-27T09:00:00Z',
    },
  ]);
  assert.equal(dayGroups.length, 2);
  assert.equal(dayGroups[0].dateLabel, '28/03/2026');
  assert.deepEqual(dayGroups[0].transactions.map((item) => item.id), [10, 11]);

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
      now_ms: Date.parse('2026-03-30T00:00:00Z'),
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
    'customer-facing transaction text should keep maintenance wording only for Excellent customers before the due date'
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
      now_ms: Date.parse('2026-03-30T00:00:00Z'),
    },
    onlineStoreUrl: 'https://barman-store.vercel.app',
  });
  assert.ok(
    newCustomerText.includes('সময়মতে পৰিশোধ কৰিলে আপোনাৰ পেমেন্ট স্কোৰ গঢ়ি উঠিব পাৰে।'),
    'new customers should get softer motivational score-building copy before the due date'
  );

  const improvingStatusText = buildCreditTransactionText({
    companyTitle: "বৰ্মন ষ্ট'ৰ",
    dateLabel: '27/3/2026',
    typeLabel: 'Payment',
    amount: 20,
    description: 'part payment',
    reference: '-',
    previousBalance: 200,
    updatedBalance: 180,
    paymentProfile: {
      score: 58,
      label: 'Good',
      next_status_label: 'Very Good',
      outstanding_amount: 180,
      maintain_score_by_date: '2026-04-05',
      now_ms: Date.parse('2026-03-30T00:00:00Z'),
    },
    onlineStoreUrl: 'https://barman-store.vercel.app',
  });
  assert.ok(
    improvingStatusText.includes('সময়মতে পৰিশোধ কৰিলে আপোনাৰ পেমেন্ট স্কোৰ উন্নত হৈ Very Good status পাব পাৰে।'),
    'customers below Excellent should get motivational upgrade copy that points to the next status'
  );
  assert.ok(
    !improvingStatusText.includes('স্কোৰ বজাই ৰাখিবলৈ'),
    'customers below Excellent should not get maintenance wording before the due date'
  );

  const overdueWithinGraceText = buildCreditTransactionText({
    companyTitle: "বৰ্মন ষ্ট'ৰ",
    dateLabel: '30/3/2026',
    typeLabel: 'Manual Sale',
    amount: 107,
    description: '2 milks,taza1, marie1, chocolate1',
    reference: '-',
    previousBalance: 985,
    updatedBalance: 1092,
    paymentProfile: {
      score: 86,
      label: 'Excellent',
      outstanding_amount: 1092,
      maintain_score_by_date: '2026-03-28',
      grace_days: 3,
      now_ms: Date.parse('2026-03-30T00:00:00Z'),
    },
    onlineStoreUrl: 'https://barman-store.vercel.app',
  });
  assert.ok(
    overdueWithinGraceText.includes('31/3/2026 ৰ ভিতৰত পৰিশোধ কৰক'),
    'overdue reminders within grace should mention the grace-ending date instead of the missed due date'
  );
  assert.ok(
    !overdueWithinGraceText.includes('28/3/2026 ৰ আগতে পৰিশোধ কৰক'),
    'overdue reminders within grace must not present an already-missed due date as an upcoming deadline'
  );

  const overdueAfterGraceText = buildCreditTransactionText({
    companyTitle: "বৰ্মন ষ্ট'ৰ",
    dateLabel: '20/5/2026',
    typeLabel: 'Manual Sale',
    amount: 107,
    description: '2 milks,taza1, marie1, chocolate1',
    reference: '-',
    previousBalance: 985,
    updatedBalance: 1092,
    paymentProfile: {
      score: 39,
      label: 'Average',
      outstanding_amount: 1092,
      maintain_score_by_date: '2026-03-19',
      grace_days: 3,
      now_ms: Date.parse('2026-03-30T00:00:00Z'),
    },
    onlineStoreUrl: 'https://barman-store.vercel.app',
  });
  assert.ok(
    overdueAfterGraceText.includes('আপোনাৰ পৰিশোধৰ গ্ৰেচ পিৰিয়ড শেষ হৈছে। অনুগ্ৰহ কৰি তৎক্ষণাত পৰিশোধ কৰক, নহ’লে পেমেন্ট স্কোৰ বেয়া হ’ব পাৰে।'),
    'overdue reminders after grace should use the urgent post-grace wording'
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
