import { useEffect } from 'react';

const useCreditHistoryEffects = ({
  authUser,
  isAdminView,
  userId,
  effectiveUserId,
  navigate,
  fetchCreditData,
  setIsMobile,
  setExpandedTransactionId,
  quickTypeFilter,
  quickRangeFilter,
  focusEntryId,
  loading,
  scrollToTransactionEntry,
  focusIssueId,
  setActiveAdminIssueId,
}) => {
  useEffect(() => {
    if (!authUser) {
      navigate('/login');
      return;
    }
    if (!isAdminView && userId && Number(userId) !== Number(authUser.id)) {
      navigate('/my-credit');
      return;
    }
    if (!effectiveUserId) return;
    fetchCreditData(effectiveUserId);
  }, [authUser, isAdminView, userId, effectiveUserId, navigate, fetchCreditData]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setIsMobile]);

  useEffect(() => {
    setExpandedTransactionId(null);
  }, [quickTypeFilter, quickRangeFilter, setExpandedTransactionId]);

  useEffect(() => {
    if (!focusEntryId) return;
    if (loading) return;
    scrollToTransactionEntry(focusEntryId);
  }, [focusEntryId, loading, scrollToTransactionEntry]);

  useEffect(() => {
    if (!focusIssueId) return;
    setActiveAdminIssueId(focusIssueId);
  }, [focusIssueId, setActiveAdminIssueId]);
};

export default useCreditHistoryEffects;
