import { useEffect, useState } from 'react';
import { adminApi } from '../services/api';
import './CustomerRequestsAdmin.css';

const recommendationStatuses = ['open', 'reviewed', 'fulfilled', 'rejected'];
const issueStatuses = ['open', 'in_review', 'corrected', 'rejected'];

function CustomerRequestsAdmin() {
  const [activeView, setActiveView] = useState('recommendations');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recommendationStatusFilter, setRecommendationStatusFilter] = useState('open');
  const [issueStatusFilter, setIssueStatusFilter] = useState('open');
  const [recommendations, setRecommendations] = useState([]);
  const [issues, setIssues] = useState([]);
  const [issueDrafts, setIssueDrafts] = useState({});
  const [issueSavingId, setIssueSavingId] = useState(0);
  const [activeIssueEditorId, setActiveIssueEditorId] = useState(0);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [recommendationRows, issueRows] = await Promise.all([
        adminApi.getProductRecommendations(recommendationStatusFilter),
        adminApi.getCreditIssues(issueStatusFilter),
      ]);
      setRecommendations(Array.isArray(recommendationRows) ? recommendationRows : []);
      setIssues(Array.isArray(issueRows) ? issueRows : []);
    } catch (err) {
      setError(err.message || 'Failed to load customer requests');
    } finally {
      setLoading(false);
    }
  };

  const setIssueDraft = (id, patch) => {
    setIssueDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        ...patch,
      },
    }));
  };

  const getIssueDraft = (issue) => {
    const current = issueDrafts[issue.id] || {};
    return {
      admin_reason: current.admin_reason ?? issue.admin_reason ?? issue.resolution_note ?? '',
      correction_type: current.correction_type ?? '',
      correction_amount: current.correction_amount ?? '',
      correction_description: current.correction_description ?? '',
      correction_reference: current.correction_reference ?? '',
    };
  };

  useEffect(() => {
    load();
  }, [recommendationStatusFilter, issueStatusFilter]);

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

  return (
    <div className="customer-requests-admin">
      <div className="customer-requests-header">
        <h1>Customer Requests</h1>
        <div className="view-switch">
          <button
            type="button"
            className={activeView === 'recommendations' ? 'active' : ''}
            onClick={() => setActiveView('recommendations')}
          >
            Product Requests
          </button>
          <button
            type="button"
            className={activeView === 'issues' ? 'active' : ''}
            onClick={() => setActiveView('issues')}
          >
            Credit Issues
          </button>
        </div>
      </div>

      {error ? <div className="customer-requests-error">{error}</div> : null}
      {loading ? <div className="customer-requests-loading">Loading...</div> : null}

      {!loading && activeView === 'recommendations' && (
        <section className="customer-requests-panel">
          <div className="panel-head">
            <h2>Product Availability Requests</h2>
            <select value={recommendationStatusFilter} onChange={(e) => setRecommendationStatusFilter(e.target.value)}>
              {recommendationStatuses.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
          {recommendations.length === 0 ? (
            <p className="muted">No requests found.</p>
          ) : (
            <div className="request-grid">
              {recommendations.map((item) => (
                <article key={item.id} className="request-card">
                  <div className="request-head">
                    <strong>{item.requested_name}</strong>
                    <span className={`status ${item.status}`}>{item.status}</span>
                  </div>
                  <p><strong>User:</strong> {item.user_name || '-'} ({item.user_email || '-'})</p>
                  {item.notes ? <p>{item.notes}</p> : null}
                  {item.contact_phone ? <p>Phone: {item.contact_phone}</p> : null}
                  {item.admin_note ? <p>Admin note: {item.admin_note}</p> : null}
                  <small>{new Date(item.created_at || Date.now()).toLocaleString()}</small>
                  <div className="request-actions">
                    {recommendationStatuses.map((status) => (
                      <button key={status} type="button" onClick={() => updateRecommendation(item.id, status)} disabled={status === item.status}>
                        {status}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {!loading && activeView === 'issues' && (
        <section className="customer-requests-panel">
          <div className="panel-head">
            <h2>Credit Entry Issues</h2>
            <select value={issueStatusFilter} onChange={(e) => setIssueStatusFilter(e.target.value)}>
              {issueStatuses.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
          {issues.length === 0 ? (
            <p className="muted">No issues found.</p>
          ) : (
            <div className="request-grid">
              {issues.map((item) => (
                <article key={item.id} className="request-card">
                  <div className="request-head">
                    <strong>{item.issue_type}</strong>
                    <span className={`status ${item.status}`}>{item.status}</span>
                  </div>
                  <p><strong>User:</strong> {item.user_name || '-'} ({item.user_email || '-'})</p>
                  <p>{item.message}</p>
                  {item.credit_entry_id ? (
                    <p>
                      Entry #{item.credit_entry_id} | Ref: {item.credit_reference || '-'} | Amount: {item.credit_amount || 0}
                    </p>
                  ) : null}
                  {(item.admin_reason || item.resolution_note) ? <p>Reason: {item.admin_reason || item.resolution_note}</p> : null}
                  {item.correction_entry_id ? (
                    <p>
                      Correction: #{item.correction_entry_id}
                      {item.correction_type ? ` | ${item.correction_type}` : ''}
                      {item.correction_amount ? ` | ${item.correction_amount}` : ''}
                    </p>
                  ) : null}
                  {item.customer_response_status ? (
                    <p>
                      Customer response: {item.customer_response_status}
                      {item.customer_response_note ? ` - ${item.customer_response_note}` : ''}
                    </p>
                  ) : null}
                  <small>{new Date(item.created_at || Date.now()).toLocaleString()}</small>
                  <div className="request-actions request-actions-column">
                    <a className="request-link" href={`/admin/users/${item.user_id}/credit?returnTab=customer-requests&focusIssue=${encodeURIComponent(String(item.id || ''))}${item.credit_entry_id ? `&focusEntry=${encodeURIComponent(String(item.credit_entry_id))}` : ''}`}>
                      Open Credit History
                    </a>
                    {activeIssueEditorId !== Number(item.id) ? (
                      <button
                        type="button"
                        onClick={() => setActiveIssueEditorId(Number(item.id))}
                        disabled={issueSavingId === Number(item.id)}
                      >
                        Take Action
                      </button>
                    ) : (
                      <>
                        <label>
                          Reason
                          <textarea
                            value={getIssueDraft(item).admin_reason}
                            onChange={(e) => setIssueDraft(item.id, { admin_reason: e.target.value })}
                            rows={2}
                            placeholder="Reason shown to customer"
                          />
                        </label>
                        <div className="request-correction-grid">
                          <label>
                            Correction Type
                            <select
                              value={getIssueDraft(item).correction_type}
                              onChange={(e) => setIssueDraft(item.id, { correction_type: e.target.value })}
                            >
                              <option value="">None</option>
                              <option value="given">Credit</option>
                              <option value="payment">Payment</option>
                            </select>
                          </label>
                          <label>
                            Correction Amount
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={getIssueDraft(item).correction_amount}
                              onChange={(e) => setIssueDraft(item.id, { correction_amount: e.target.value })}
                              placeholder="0"
                            />
                          </label>
                        </div>
                        <label>
                          Correction Description
                          <input
                            type="text"
                            value={getIssueDraft(item).correction_description}
                            onChange={(e) => setIssueDraft(item.id, { correction_description: e.target.value })}
                            placeholder="Optional"
                          />
                        </label>
                        <div className="request-correction-actions">
                          <button
                            type="button"
                            onClick={() => updateIssue(item, 'in_review')}
                            disabled={issueSavingId === Number(item.id)}
                          >
                            {issueSavingId === Number(item.id) ? 'Updating...' : 'Needs Review'}
                          </button>
                          <button
                            type="button"
                            onClick={() => updateIssue(item, 'rejected')}
                            disabled={issueSavingId === Number(item.id)}
                          >
                            {issueSavingId === Number(item.id) ? 'Updating...' : 'Reject'}
                          </button>
                          <button
                            type="button"
                            onClick={() => updateIssue(item, 'corrected')}
                            disabled={issueSavingId === Number(item.id)}
                          >
                            {issueSavingId === Number(item.id) ? 'Updating...' : 'Submit Correction'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default CustomerRequestsAdmin;
