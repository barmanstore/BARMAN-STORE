const useCreditHistoryIssues = ({
  creditApi,
  adminApi,
  effectiveUserId,
  isAdminView,
  setError,
  setSuccess,
  setIssueSubmitting,
  issueSubmitting,
  issueForm,
  setIssueForm,
  setCreditIssues,
  issueResponseDrafts,
  setIssueResponseDrafts,
  setIssueRespondingId,
  setAdminIssueDrafts,
  adminIssueDrafts,
  setAdminIssueSavingId,
  setActiveAdminIssueId,
  fetchCreditData,
}) => {
  const handleReportIssue = async (event) => {
    event.preventDefault();
    if (issueSubmitting || isAdminView) return;
    setIssueSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        credit_entry_id: Number(issueForm.credit_entry_id || 0) || null,
        issue_type: String(issueForm.issue_type || 'wrong_entry').trim(),
        message: String(issueForm.message || '').trim(),
      };
      if (!payload.message) {
        throw new Error('Please describe the issue');
      }
      await creditApi.reportIssue(effectiveUserId, payload);
      const issueRows = await creditApi.listIssues(effectiveUserId);
      setCreditIssues(Array.isArray(issueRows) ? issueRows : []);
      setIssueForm((prev) => ({ ...prev, message: '' }));
      setSuccess('Issue submitted. Admin will review and correct if needed.');
    } catch (err) {
      setError(err.message || 'Failed to submit issue');
    } finally {
      setIssueSubmitting(false);
    }
  };

  const handleIssueResponse = async (issue, responseStatus) => {
    if (isAdminView || !issue?.id || !effectiveUserId) return;
    const nextResponse = String(responseStatus || '').trim().toLowerCase();
    if (nextResponse !== 'acknowledged' && nextResponse !== 'disputed') return;
    const note = String(issueResponseDrafts[issue.id] || '').trim();
    if (nextResponse === 'disputed' && !note) {
      setError('Please add a short note before marking an issue as disputed.');
      return;
    }
    try {
      setIssueRespondingId(Number(issue.id || 0));
      setError('');
      setSuccess('');
      await creditApi.respondIssue(effectiveUserId, issue.id, {
        response_status: nextResponse,
        message: note,
      });
      const issueRows = await creditApi.listIssues(effectiveUserId);
      setCreditIssues(Array.isArray(issueRows) ? issueRows : []);
      setIssueResponseDrafts((prev) => ({ ...prev, [issue.id]: '' }));
      setSuccess(nextResponse === 'acknowledged'
        ? 'Thanks. Admin has been notified that this issue is acknowledged.'
        : 'Your dispute has been sent to admin for re-check.');
    } catch (err) {
      setError(err.message || 'Failed to send issue response');
    } finally {
      setIssueRespondingId(0);
    }
  };

  const getAdminIssueDraft = (issue) => {
    const current = adminIssueDrafts[issue.id] || {};
    return {
      admin_reason: current.admin_reason ?? issue.admin_reason ?? issue.resolution_note ?? '',
      correction_type: current.correction_type ?? '',
      correction_amount: current.correction_amount ?? '',
      correction_description: current.correction_description ?? '',
      correction_reference: current.correction_reference ?? '',
    };
  };

  const setAdminIssueDraft = (id, patch) => {
    setAdminIssueDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        ...patch,
      },
    }));
  };

  const handleAdminIssueAction = async (issue, action) => {
    if (!isAdminView) return;
    const issueId = Number(issue?.id || 0);
    if (!issueId) return;
    const nextAction = String(action || '').trim().toLowerCase();
    if (!nextAction) return;
    const draft = getAdminIssueDraft(issue);
    const payload = {
      action: nextAction,
      admin_reason: String(draft.admin_reason || '').trim(),
    };
    const correctionAmount = Number(draft.correction_amount || 0);
    if (nextAction === 'corrected' && correctionAmount > 0) {
      payload.correction_type = draft.correction_type === 'payment' ? 'payment' : 'given';
      payload.correction_amount = correctionAmount;
      payload.correction_description = String(draft.correction_description || '').trim();
      payload.correction_reference = String(draft.correction_reference || '').trim();
    }
    try {
      setAdminIssueSavingId(issueId);
      setError('');
      setSuccess('');
      await adminApi.updateCreditIssue(issueId, payload);
      await fetchCreditData(effectiveUserId);
      setSuccess('Issue action submitted and customer has been notified.');
      setActiveAdminIssueId(0);
    } catch (err) {
      setError(err.message || 'Failed to update issue');
    } finally {
      setAdminIssueSavingId(0);
    }
  };

  return {
    handleReportIssue,
    handleIssueResponse,
    getAdminIssueDraft,
    setAdminIssueDraft,
    handleAdminIssueAction,
  };
};

export default useCreditHistoryIssues;
