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
  filters,
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

  const currentTransactions = useMemo(() => {
    const correctedEntryIds = new Set();
    for (const issue of creditIssues) {
      const status = String(issue?.status || '')
        .trim()
        .toLowerCase();
      const customerResponseStatus = String(issue?.customer_response_status || '')
        .trim()
        .toLowerCase();
      const entryId = Number(issue?.credit_entry_id || 0);
      const correctionEntryId = Number(issue?.correction_entry_id || 0);
      const isFinalizedForReplacement =
        (customerResponseStatus === '' || customerResponseStatus === 'acknowledged') &&
        correctionEntryId > 0;
      if (status === 'corrected' && entryId > 0 && isFinalizedForReplacement) {
        correctedEntryIds.add(entryId);
      }
    }
    return creditHistory.filter((entry) => !correctedEntryIds.has(Number(entry?.id || 0)));
  }, [creditHistory, creditIssues]);

  const filteredTransactions = useMemo(() => {
    let result = applyCreditQuickFilters(currentTransactions, {
      typeFilter: quickTypeFilter,
      rangeFilter: quickRangeFilter,
      nowTimestamp,
      getTimestamp: getEffectiveTransactionTimestamp,
    });

    // Apply date range filters from advanced filters
    if (filters?.start_date || filters?.end_date) {
      const startTimestamp = filters.start_date ? new Date(filters.start_date).getTime() : 0;
      const endTimestamp = filters.end_date ? new Date(filters.end_date).getTime() + 86400000 : Number.MAX_SAFE_INTEGER;
      
      result = result.filter((entry) => {
        const entryTimestamp = getEffectiveTransactionTimestamp(entry);
        return entryTimestamp >= startTimestamp && entryTimestamp < endTimestamp;
      });
    }

    return result.sort(compareTransactionsByDateDesc);
  }, [
    currentTransactions,
    quickTypeFilter,
    quickRangeFilter,
    filters,
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
  }, [
    filteredTransactions,
    getEffectiveTransactionDateKey,
    formatTransactionDate,
    compareTransactionsByDateDesc,
  ]);

  const lastTransaction = getLastTransactionFromHistory(
    currentTransactions,
    getEffectiveTransactionTimestamp
  );
  const lastTransactionTimestamp = lastTransaction
    ? Number(getEffectiveTransactionTimestamp(lastTransaction))
    : 0;
  const isRecentTransaction =
    Number.isFinite(lastTransactionTimestamp) &&
    nowTimestamp - lastTransactionTimestamp <= 30 * 24 * 60 * 60 * 1000;
  const lastTransactionLine =
    lastTransaction && isRecentTransaction
      ? `Last: ${getTypeLabel(lastTransaction)} · ${formatTransactionDate(lastTransaction, { long: true })}`
      : 'Last: No recent transactions';

  const balanceSummary = getBalanceSummary(balance, {
    viewerRole: isAdminView ? 'admin' : 'customer',
  });

  const inactivityHint = getRecentActivityHint(
    lastTransaction ? getEffectiveTransactionTimestamp(lastTransaction) : 0,
    { idleDays: 30 }
  );

  const showPaymentBadges = paymentBadgesLoading || paymentBadges.length > 0;
  const monthlyStatements = useMemo(
    () =>
      buildMonthlyCreditStatements(currentTransactions, {
        getTimestamp: getEffectiveTransactionTimestamp,
        getDelta: getCreditEntryDelta,
        maxStatements: 6,
      }),
    [currentTransactions, getEffectiveTransactionTimestamp]
  );

  const hasFiltersApplied = quickTypeFilter !== 'all' || quickRangeFilter !== 'all' || filters?.start_date || filters?.end_date;

  const issueFlagByEntryId = useMemo(() => {
    const map = new Map();
    const currentEntryIds = new Set(
      currentTransactions.map((entry) => Number(entry?.id || 0)).filter((id) => id > 0)
    );
    const tonePriority = {
      open: 1,
      review: 2,
      rejected: 3,
      corrected: 4,
    };
    for (const issue of creditIssues) {
      const entryId = Number(issue?.credit_entry_id || 0);
      if (!entryId || !currentEntryIds.has(entryId)) continue;
      const status = String(issue?.status || '')
        .trim()
        .toLowerCase();
      const customerResponse = String(issue?.customer_response_status || '')
        .trim()
        .toLowerCase();
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
      if (
        !existing ||
        updatedAtTs > existing.updatedAtTs ||
        (updatedAtTs === existing.updatedAtTs && nextPriority >= existing.priority)
      ) {
        map.set(entryId, {
          tone,
          label,
          updatedAtTs,
          priority: nextPriority,
        });
      }
    }
    return map;
  }, [creditIssues, currentTransactions]);

  const adminVisibleIssues = isAdminView
    ? creditIssues.filter((issue) => {
        const status = String(issue?.status || '')
          .trim()
          .toLowerCase();
        const response = String(issue?.customer_response_status || '')
          .trim()
          .toLowerCase();
        if (focusIssueId > 0 && Number(issue?.id || 0) === focusIssueId) return true;
        return (
          status === 'open' ||
          status === 'in_review' ||
          response === 'pending' ||
          response === 'disputed'
        );
      })
    : [];

  return {
    filteredTransactions,
    groupedTransactions,
    lastTransactionLine,
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
