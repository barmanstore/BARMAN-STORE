import { useCallback } from 'react';

const useCreditHistoryLoaders = ({
  creditApi,
  usersApi,
  navigate,
  setLoading,
  setCreditHistory,
  setBalance,
  setCustomer,
  setPaymentBadges,
  setPaymentBadgeSummary,
  setPaymentBadgesLoading,
  setCreditIssues,
  setError,
  effectiveUserId,
}) => {
  const loadPaymentBadges = useCallback(async (targetUserId = effectiveUserId) => {
    if (!targetUserId) return;
    try {
      setPaymentBadgesLoading(true);
      const data = await creditApi.getPaymentBadges(targetUserId);
      setPaymentBadges(Array.isArray(data?.badges) ? data.badges : []);
      setPaymentBadgeSummary(data?.summary || null);
    } catch (_) {
      setPaymentBadges([]);
      setPaymentBadgeSummary(null);
    } finally {
      setPaymentBadgesLoading(false);
    }
  }, [
    creditApi,
    effectiveUserId,
    setPaymentBadgesLoading,
    setPaymentBadges,
    setPaymentBadgeSummary,
  ]);

  const fetchCreditData = useCallback(async (targetUserId = effectiveUserId) => {
    try {
      setLoading(true);
      const [historyData, balanceData, customerData] = await Promise.all([
        creditApi.getHistory(targetUserId),
        creditApi.getBalance(targetUserId),
        usersApi.getById(targetUserId)
      ]);
      setCreditHistory(historyData);
      setBalance(balanceData.balance);
      setCustomer(customerData);
      try {
        const issueRows = await creditApi.listIssues(targetUserId);
        setCreditIssues(Array.isArray(issueRows) ? issueRows : []);
      } catch (_) {
        setCreditIssues([]);
      }
      loadPaymentBadges(targetUserId);
      return {
        history: historyData,
        balance: Number(balanceData?.balance || 0),
        customer: customerData
      };
    } catch (err) {
      if (err?.status === 401) {
        localStorage.removeItem('user');
        navigate('/login');
        return null;
      }
      setError(err.message || 'Failed to load credit history');
      setPaymentBadges([]);
      setPaymentBadgeSummary(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [
    creditApi,
    usersApi,
    navigate,
    setLoading,
    setCreditHistory,
    setBalance,
    setCustomer,
    setCreditIssues,
    setError,
    setPaymentBadges,
    setPaymentBadgeSummary,
    effectiveUserId,
    loadPaymentBadges,
  ]);

  return {
    loadPaymentBadges,
    fetchCreditData,
  };
};

export default useCreditHistoryLoaders;
