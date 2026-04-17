import { useMemo } from 'react';
import { getCreditEntryDelta } from '../utils/creditLedgerPresentation';
import { buildMonthlyCreditStatements } from '../../../../shared/utils/creditHistoryUi.mjs';
import { buildCreditHistoryDayGroups } from '../utils/creditHistoryHelpers';

const useCreditHistoryComputed = ({
  creditHistory,
  balance,
  isAdminView,
  paymentBadges,
  paymentBadgesLoading,
  quickTypeFilter,
  quickRangeFilter,
  creditIssues,
  focusIssueId,
  applyCreditQuickFilters,
  compareTransactionsByDateDesc,
  formatTransactionDate,
  getEffectiveTransactionDateKey,
  getEffectiveTransactionTimestamp,
  getLastTransactionFromHistory,
  getRecentActivityHint,
  getBalanceSummary,
  getTypeLabel,
}) => {
  // Date.now() is intentionally used for relative recent-transaction calculations.
  // eslint-disable-next-line react-hooks/purity
  const nowTimestamp = Date.now();

  const filteredTransactions = useMemo(() => {
    return applyCreditQuickFilters(creditHistory, {
      typeFilter: quickTypeFilter,
      rangeFilter: quickRangeFilter,
      nowTimestamp,
      getTimestamp: getEffectiveTransactionTimestamp,
    }).sort(compareTransactionsByDateDesc);
  }, [
    creditHistory,
    quickTypeFilter,
    quickRangeFilter,
    applyCreditQuickFilters,
    compareTransactionsByDateDesc,
    getEffectiveTransactionTimestamp,
    nowTimestamp,
  ]);

  const groupedTransactions = useMemo(() => {
    return buildCreditHistoryDayGroups(filteredTransactions, {
      getDateKey: getEffectiveTransactionDateKey,
      compareTransactions: compareTransactionsByDateDesc,
      formatDate: formatTransactionDate,
    });
  }, [filteredTransactions, getEffectiveTransactionDateKey, formatTransactionDate, compareTransactionsByDateDesc]);

  const lastTransaction = getLastTransactionFromHistory(creditHistory, getEffectiveTransactionTimestamp);
  const lastTransactionTimestamp = lastTransaction ? Number(getEffectiveTransactionTimestamp(lastTransaction)) : 0;
  const isRecentTransaction = Number.isFinite(lastTransactionTimestamp)
    && (nowTimestamp - lastTransactionTimestamp) <= (30 * 24 * 60 * 60 * 1000);
  const lastTransactionLine = lastTransaction && isRecentTransaction
    ? `Last: ${getTypeLabel(lastTransaction)} · ${formatTransactionDate(lastTransaction, { long: true })}`
    : 'Last: No recent transactions';

  const ledgerSummary = useMemo(() => {
    return creditHistory.reduce((acc, transaction) => {
      const delta = getCreditEntryDelta(transaction);
      if (delta >= 0) {
        acc.totalDebit += delta;
      } else {
        acc.totalCredit += Math.abs(delta);
      }
      return acc;
    }, { totalDebit: 0, totalCredit: 0 });
  }, [creditHistory]);

  const balanceSummary = getBalanceSummary(balance, {
    viewerRole: isAdminView ? 'admin' : 'customer',
  });

  const inactivityHint = getRecentActivityHint(
    lastTransaction ? getEffectiveTransactionTimestamp(lastTransaction) : 0,
    { idleDays: 30 }
  );

  const showPaymentBadges = paymentBadgesLoading || paymentBadges.length > 0;
  const monthlyStatements = useMemo(() => buildMonthlyCreditStatements(creditHistory, {
    getTimestamp: getEffectiveTransactionTimestamp,
    getDelta: getCreditEntryDelta,
    maxStatements: 6,
  }), [creditHistory, getEffectiveTransactionTimestamp]);

  const hasFiltersApplied = quickTypeFilter !== 'all' || quickRangeFilter !== 'all';

  const issueFlagByEntryId = useMemo(() => {
    const map = new Map();
    const tonePriority = {
      open: 1,
      review: 2,
      rejected: 3,
      corrected: 4,
    };
    for (const issue of creditIssues) {
      const entryId = Number(issue?.credit_entry_id || 0);
      if (!entryId) continue;
      const status = String(issue?.status || '').trim().toLowerCase();
      const customerResponse = String(issue?.customer_response_status || '').trim().toLowerCase();
      let tone = '';
      let label = '';
      if (customerResponse === 'disputed' || status === 'in_review') {
        tone = 'review';
        label = 'Under Review';
      } else if (status === 'open') {
        tone = 'open';
        label = 'Issue Open';
      } else if (status === 'corrected') {
        tone = 'corrected';
        label = 'Corrected';
      } else if (status === 'rejected') {
        tone = 'rejected';
        label = 'Rejected';
      }
      if (!tone) continue;
      const updatedAtTs = new Date(issue?.updated_at || issue?.created_at || 0).getTime() || 0;
      const existing = map.get(entryId);
      const nextPriority = Number(tonePriority[tone] || 0);
      if (!existing || updatedAtTs > existing.updatedAtTs || (updatedAtTs === existing.updatedAtTs && nextPriority >= existing.priority)) {
        map.set(entryId, {
          tone,
          label,
          updatedAtTs,
          priority: nextPriority,
        });
      }
    }
    return map;
  }, [creditIssues]);

  const adminVisibleIssues = isAdminView
    ? creditIssues.filter((issue) => {
      const status = String(issue?.status || '').trim().toLowerCase();
      const response = String(issue?.customer_response_status || '').trim().toLowerCase();
      if (focusIssueId > 0 && Number(issue?.id || 0) === focusIssueId) return true;
      return status === 'open' || status === 'in_review' || response === 'pending' || response === 'disputed';
    })
    : [];

  return {
    filteredTransactions,
    groupedTransactions,
    lastTransactionLine,
    ledgerSummary,
    balanceSummary,
    inactivityHint,
    showPaymentBadges,
    monthlyStatements,
    hasFiltersApplied,
    issueFlagByEntryId,
    adminVisibleIssues,
  };
};

export default useCreditHistoryComputed;
