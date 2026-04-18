import { useCallback } from 'react';
import { useSession } from '../../../../providers/SessionProvider';

const useCreditHistoryLoaders = ({
  creditApi,
  usersApi,
  navigate,
  setLoading,
  setCreditHistory,
  historyCursor,
  setHistoryCursor,
  historyHasMore,
  setHistoryHasMore,
  historyLoadingMore,
  setHistoryLoadingMore,
  historyLoadingFull,
  setHistoryLoadingFull,
  setBalance,
  setCustomer,
  setPaymentBadges,
  setPaymentBadgeSummary,
  setPaymentBadgesLoading,
  setCreditIssues,
  setError,
  effectiveUserId,
}) => {
  const { clearUser } = useSession();
  const HISTORY_PAGE_SIZE = 150;

  const normalizeHistoryPayload = (payload) => {
    if (Array.isArray(payload)) {
      return { rows: payload, nextCursor: '', hasMore: false };
    }
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    return {
      rows,
      nextCursor: payload?.nextCursor || '',
      hasMore: Boolean(payload?.hasMore),
    };
  };

  const mergeHistoryRows = (prevRows, nextRows) => {
    const merged = [...(Array.isArray(prevRows) ? prevRows : [])];
    const seenIds = new Set(merged.map((row) => Number(row?.id || 0)).filter((id) => id));
    nextRows.forEach((row) => {
      const rowId = Number(row?.id || 0);
      if (rowId && seenIds.has(rowId)) return;
      merged.push(row);
      if (rowId) seenIds.add(rowId);
    });
    return merged;
  };
  const loadPaymentBadges = useCallback(
    async (targetUserId = effectiveUserId) => {
      if (!targetUserId) return;
      try {
        setPaymentBadgesLoading(true);
        const data = await creditApi.getPaymentBadges(targetUserId);
        const badges = Array.isArray(data?.badges) ? data.badges : [];
        const summary = data?.summary || null;
        setPaymentBadges(badges);
        setPaymentBadgeSummary(summary);
        return { badges, summary };
      } catch (_) {
        setPaymentBadges([]);
        setPaymentBadgeSummary(null);
        return { badges: [], summary: null };
      } finally {
        setPaymentBadgesLoading(false);
      }
    },
    [creditApi, effectiveUserId, setPaymentBadgesLoading, setPaymentBadges, setPaymentBadgeSummary]
  );

  const fetchCreditData = useCallback(
    async (targetUserId = effectiveUserId) => {
      try {
        setLoading(true);
        const [historyPayload, balanceData, customerData] = await Promise.all([
          creditApi.getHistory(targetUserId, { limit: HISTORY_PAGE_SIZE }),
          creditApi.getBalance(targetUserId),
          usersApi.getById(targetUserId),
        ]);
        const normalizedHistory = normalizeHistoryPayload(historyPayload);
        setCreditHistory(normalizedHistory.rows);
        setHistoryCursor(normalizedHistory.nextCursor);
        setHistoryHasMore(normalizedHistory.hasMore);
        setBalance(balanceData.balance);
        setCustomer(customerData);

        const [issueRows, badgeData] = await Promise.all([
          creditApi
            .getIssues(targetUserId)
            .then((rows) => (Array.isArray(rows) ? rows : []))
            .catch(() => []),
          loadPaymentBadges(targetUserId),
        ]);
        setCreditIssues(issueRows);

        return {
          history: normalizedHistory.rows,
          balance: Number(balanceData?.balance || 0),
          customer: customerData,
          paymentBadgeSummary: badgeData?.summary || null,
          paymentBadges: badgeData?.badges || [],
        };
      } catch (err) {
        if (err?.status === 401) {
          clearUser();
          navigate('/login');
          return null;
        }
        setError(err.message || 'Failed to load credit history');
        setPaymentBadges([]);
        setPaymentBadgeSummary(null);
        setHistoryHasMore(false);
        setHistoryCursor('');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [
      creditApi,
      usersApi,
      navigate,
      clearUser,
      setLoading,
      setCreditHistory,
      setHistoryCursor,
      setHistoryHasMore,
      setBalance,
      setCustomer,
      setCreditIssues,
      setError,
      setPaymentBadges,
      setPaymentBadgeSummary,
      effectiveUserId,
      loadPaymentBadges,
    ]
  );

  const loadMoreHistory = useCallback(
    async (targetUserId = effectiveUserId) => {
      if (!targetUserId) return [];
      if (!historyHasMore || historyLoadingMore || !historyCursor) return [];
      try {
        setHistoryLoadingMore(true);
        const payload = await creditApi.getHistory(targetUserId, {
          limit: HISTORY_PAGE_SIZE,
          cursor: historyCursor,
        });
        const normalizedHistory = normalizeHistoryPayload(payload);
        setCreditHistory((prev) => mergeHistoryRows(prev, normalizedHistory.rows));
        setHistoryCursor(normalizedHistory.nextCursor);
        setHistoryHasMore(normalizedHistory.hasMore);
        return normalizedHistory.rows;
      } catch (_) {
        return [];
      } finally {
        setHistoryLoadingMore(false);
      }
    },
    [
      creditApi,
      effectiveUserId,
      historyHasMore,
      historyLoadingMore,
      historyCursor,
      setCreditHistory,
      setHistoryCursor,
      setHistoryHasMore,
      setHistoryLoadingMore,
    ]
  );

  const loadFullHistory = useCallback(
    async (targetUserId = effectiveUserId) => {
      if (!targetUserId || historyLoadingFull) return [];
      try {
        setHistoryLoadingFull(true);
        const payload = await creditApi.getHistory(targetUserId, { all: 'true' });
        const normalizedHistory = normalizeHistoryPayload(payload);
        setCreditHistory(normalizedHistory.rows);
        setHistoryCursor('');
        setHistoryHasMore(false);
        return normalizedHistory.rows;
      } catch (_) {
        return [];
      } finally {
        setHistoryLoadingFull(false);
      }
    },
    [
      creditApi,
      effectiveUserId,
      historyLoadingFull,
      setCreditHistory,
      setHistoryCursor,
      setHistoryHasMore,
      setHistoryLoadingFull,
    ]
  );

  return {
    loadPaymentBadges,
    fetchCreditData,
    loadMoreHistory,
    loadFullHistory,
  };
};

export default useCreditHistoryLoaders;
