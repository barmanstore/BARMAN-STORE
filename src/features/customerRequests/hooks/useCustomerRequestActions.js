const useCustomerRequestActions = ({
  adminApi,
  load,
  setError,
  setIssueSavingId,
  setActiveIssueEditorId,
  setPhoneSavingId,
  getIssueDraft,
  formatMergeImpact,
}) => {
  const updateRecommendation = async (id, status) => {
    const adminNote = window.prompt('Optional admin note:', '') || '';
    try {
      await adminApi.updateProductRecommendation(id, { status, admin_note: adminNote });
      await load();
    } catch (err) {
      setError(err.message || 'Failed to update recommendation');
    }
  };

  const updateIssue = async (issue, action) => {
    const id = Number(issue?.id || 0);
    if (!id) return;
    const normalizedAction = String(action || '').trim().toLowerCase();
    if (!normalizedAction) return;
    const draft = getIssueDraft(issue);
    const payload = {
      action: normalizedAction,
      admin_reason: String(draft.admin_reason || '').trim(),
    };
    const correctionAmount = Number(draft.correction_amount || 0);
    if (normalizedAction === 'corrected' && correctionAmount > 0) {
      payload.correction_type = draft.correction_type === 'payment' ? 'payment' : 'given';
      payload.correction_amount = correctionAmount;
      payload.correction_description = String(draft.correction_description || '').trim();
      payload.correction_reference = String(draft.correction_reference || '').trim();
    }
    try {
      setIssueSavingId(id);
      await adminApi.updateCreditIssue(id, payload);
      await load();
      setActiveIssueEditorId(0);
    } catch (err) {
      setError(err.message || 'Failed to update issue');
    } finally {
      setIssueSavingId(0);
    }
  };

  const approvePhoneRequest = async (request) => {
    const requestId = Number(request?.id || 0);
    if (!requestId) return;
    const adminNote = window.prompt('Optional admin note for approval:', '') || '';
    const promptForMergeConfirmation = ({ conflictUserId = null, impactText = '' } = {}) => {
      const confirmation = window.prompt(
        `Conflict detected. This approval will merge identity records${conflictUserId ? ` (user #${conflictUserId})` : ''}.\n${impactText ? `Impact: ${impactText}\n` : ''}Type MERGE to continue:`,
        ''
      );
      return String(confirmation || '').trim().toUpperCase() === 'MERGE';
    };
    const applyApproval = async (mergeIdentity) => {
      await adminApi.approvePhoneChangeRequest(requestId, {
        admin_note: adminNote,
        merge_identity: Boolean(mergeIdentity),
      });
      await load();
    };
    const applyErrorFromPayload = (payload, fallbackMessage) => {
      const conflictUserId = Number(payload?.conflict_user_id || 0) || null;
      const impactText = formatMergeImpact(payload?.merge_impact);
      setError(
        `Conflict requires explicit merge confirmation${conflictUserId ? ` (user #${conflictUserId})` : ''}${impactText ? ` | ${impactText}` : ''}.`
      );
      if (!payload?.requires_merge_confirmation) {
        setError(fallbackMessage);
      }
    };
    const hasConflict = Number(request?.conflict_user_id || 0) > 0;
    let mergeIdentity = false;
    if (hasConflict) {
      const impactText = formatMergeImpact(request?.merge_impact);
      if (!promptForMergeConfirmation({ conflictUserId: request?.conflict_user_id, impactText })) {
        setError('Approval cancelled. Merge confirmation was not provided.');
        return;
      }
      mergeIdentity = true;
    }
    try {
      setPhoneSavingId(requestId);
      await applyApproval(mergeIdentity);
    } catch (err) {
      const requiresMerge = Boolean(err?.payload?.requires_merge_confirmation);
      if (requiresMerge && !mergeIdentity) {
        const conflictUserId = Number(err?.payload?.conflict_user_id || 0) || null;
        const impactText = formatMergeImpact(err?.payload?.merge_impact);
        if (!promptForMergeConfirmation({ conflictUserId, impactText })) {
          setError('Approval cancelled. Merge confirmation was not provided.');
          return;
        }
        try {
          await applyApproval(true);
          return;
        } catch (retryErr) {
          applyErrorFromPayload(retryErr?.payload, retryErr.message || 'Failed to approve phone update request');
          return;
        }
      }
      if (requiresMerge) {
        applyErrorFromPayload(err?.payload, err.message || 'Failed to approve phone update request');
      } else {
        setError(err.message || 'Failed to approve phone update request');
      }
    } finally {
      setPhoneSavingId(0);
    }
  };

  const rejectPhoneRequest = async (request) => {
    const requestId = Number(request?.id || 0);
    if (!requestId) return;
    const rejectionReason = window.prompt('Reason for rejection (shown to user):', '') || '';
    const adminNote = window.prompt('Optional internal admin note:', '') || '';
    try {
      setPhoneSavingId(requestId);
      await adminApi.rejectPhoneChangeRequest(requestId, {
        rejection_reason: rejectionReason,
        admin_note: adminNote,
      });
      await load();
    } catch (err) {
      setError(err.message || 'Failed to reject phone update request');
    } finally {
      setPhoneSavingId(0);
    }
  };

  return {
    updateRecommendation,
    updateIssue,
    approvePhoneRequest,
    rejectPhoneRequest,
  };
};

export default useCustomerRequestActions;
