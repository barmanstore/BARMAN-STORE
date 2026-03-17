function CreditIssuesAdminInbox({
  adminVisibleIssues,
  focusIssueId,
  getAdminIssueDraft,
  setAdminIssueDraft,
  activeAdminIssueId,
  setActiveAdminIssueId,
  handleAdminIssueAction,
  adminIssueSavingId,
  scrollToTransactionEntry,
}) {
  if (!adminVisibleIssues.length) {
    return (
      <div className="report-box admin-issue-workbench">
        <div className="report-header">
          <strong>Transaction Issue Inbox</strong>
        </div>
        <p className="muted">No customer transaction issues right now.</p>
      </div>
    );
  }

  return (
    <div className="report-box admin-issue-workbench">
      <div className="report-header">
        <strong>Transaction Issue Inbox</strong>
      </div>
      <div className="admin-issue-list">
        {adminVisibleIssues.map((issue) => {
          const issueId = Number(issue?.id || 0);
          const draft = getAdminIssueDraft(issue);
          const isFocused = focusIssueId > 0 && issueId === focusIssueId;
          const entryId = Number(issue?.credit_entry_id || 0) || null;
          return (
            <article key={issueId || `issue-${issue.created_at || ''}`} className={`admin-issue-card ${isFocused ? 'focused' : ''}`}>
              <div className="admin-issue-top">
                <strong>Issue #{issueId}</strong>
                <span className={`status-chip ${issue.status}`}>{issue.status}</span>
              </div>
              <div className="admin-issue-meta">
                <span>Type: {issue.issue_type}</span>
                {entryId ? <span>Entry: #{entryId}</span> : null}
                {issue.customer_response_status ? (
                  <span>Customer: {issue.customer_response_status}</span>
                ) : null}
              </div>
              <p>{issue.message}</p>
              {(issue.admin_reason || issue.resolution_note) ? (
                <p><strong>Reason:</strong> {issue.admin_reason || issue.resolution_note}</p>
              ) : null}
              {entryId ? (
                <button
                  type="button"
                  className="report-btn secondary-action"
                  onClick={() => scrollToTransactionEntry(entryId)}
                >
                  Go to Transaction
                </button>
              ) : null}
              {activeAdminIssueId !== issueId ? (
                <button
                  type="button"
                  className="report-btn secondary-action"
                  onClick={() => setActiveAdminIssueId(issueId)}
                >
                  Open Action Panel
                </button>
              ) : (
                <>
                  <label>
                    Resolution Reason
                    <textarea
                      id={`issue-admin-reason-${issueId}`}
                      name={`issue_admin_reason_${issueId}`}
                      value={draft.admin_reason}
                      onChange={(e) => setAdminIssueDraft(issueId, { admin_reason: e.target.value })}
                      rows={2}
                      placeholder="Reason visible to customer"
                    />
                  </label>
                  <div className="request-correction-grid">
                    <label>
                      Correction Type
                      <select
                        id={`issue-correction-type-${issueId}`}
                        name={`issue_correction_type_${issueId}`}
                        value={draft.correction_type}
                        onChange={(e) => setAdminIssueDraft(issueId, { correction_type: e.target.value })}
                      >
                        <option value="">None</option>
                        <option value="given">Credit</option>
                        <option value="payment">Payment</option>
                      </select>
                    </label>
                    <label>
                      Correction Amount
                      <input
                        id={`issue-correction-amount-${issueId}`}
                        name={`issue_correction_amount_${issueId}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.correction_amount}
                        onChange={(e) => setAdminIssueDraft(issueId, { correction_amount: e.target.value })}
                        placeholder="0"
                      />
                    </label>
                  </div>
                  <label>
                    Correction Description
                    <input
                      id={`issue-correction-description-${issueId}`}
                      name={`issue_correction_description_${issueId}`}
                      type="text"
                      value={draft.correction_description}
                      onChange={(e) => setAdminIssueDraft(issueId, { correction_description: e.target.value })}
                      placeholder="Optional"
                    />
                  </label>
                  <div className="request-correction-actions">
                    <button
                      type="button"
                      className="report-btn secondary-action"
                      onClick={() => handleAdminIssueAction(issue, 'in_review')}
                      disabled={adminIssueSavingId === issueId}
                    >
                      {adminIssueSavingId === issueId ? 'Submitting...' : 'Needs Review'}
                    </button>
                    <button
                      type="button"
                      className="report-btn secondary-action"
                      onClick={() => handleAdminIssueAction(issue, 'rejected')}
                      disabled={adminIssueSavingId === issueId}
                    >
                      {adminIssueSavingId === issueId ? 'Submitting...' : 'Reject'}
                    </button>
                    <button
                      type="button"
                      className="report-btn primary-action"
                      onClick={() => handleAdminIssueAction(issue, 'corrected')}
                      disabled={adminIssueSavingId === issueId}
                    >
                      {adminIssueSavingId === issueId ? 'Submitting...' : 'Submit Correction'}
                    </button>
                  </div>
                </>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

export default CreditIssuesAdminInbox;
