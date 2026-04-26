import { Fragment, useMemo, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import CalculatedAmountInput from '../../../../shared/components/CalculatedAmountInput';
import { formatCurrency } from '../../../../shared/utils/formatters';
import {
  getCreditBalanceMeta,
  getCreditEntryDelta,
  getCreditEntryDescription,
  getCreditEntrySourceLabel,
  getCreditEntryTypeLabel,
} from '../utils/creditLedgerPresentation';

function CreditTransactionsSection({
  filteredTransactions,
  creditHistory,
  hasFiltersApplied,
  isAdminView,
  isMobile,
  issueFlagByEntryId,
  groupedTransactions,
  historyHasMore,
  historyLoadingMore,
  historyLoadingFull,
  loadMoreHistory,
  expandedTransactionId,
  setExpandedTransactionId,
  formatTransactionDate,
  isTransactionWithinFiveDays,
  truncateCreditDescription,
  setIssueForm,
  handleCustomerTransactionIssue,
  openEditModalWithTransaction,
  handleSendTransactionWhatsApp,
  issueForm,
  handleReportIssue,
  issueSubmitting,
  creditIssues,
  issueResponseDrafts,
  setIssueResponseDrafts,
  handleIssueResponse,
  issueRespondingId,
  activeAdminIssueId,
  setActiveAdminIssueId,
  getAdminIssueDraft,
  setAdminIssueDraft,
  handleAdminIssueAction,
  adminIssueSavingId,
}) {
  const [customerIssueTransaction, setCustomerIssueTransaction] = useState(null);
  const [customerIssueDraft, setCustomerIssueDraft] = useState({
    correctionType: '',
    correctionAmount: '',
    correctionDate: '',
    correctionDescription: '',
    correctionReference: '',
    reason: '',
  });

  const openCustomerIssueModal = (transaction) => {
    const delta = getCreditEntryDelta(transaction);
    const defaultType = delta < 0 ? 'payment' : 'given';
    setCustomerIssueTransaction(transaction);
    setCustomerIssueDraft({
      correctionType: defaultType,
      correctionAmount: String(Math.abs(Number(transaction?.amount || 0)) || ''),
      correctionDate: String(transaction?.transaction_date || transaction?.created_at || '')
        .trim()
        .slice(0, 10),
      correctionDescription: String(getCreditEntryDescription(transaction) || '').trim(),
      correctionReference: String(transaction?.reference || '').trim(),
      reason: '',
    });
  };

  const closeCustomerIssueModal = () => {
    setCustomerIssueTransaction(null);
    setCustomerIssueDraft({
      correctionType: '',
      correctionAmount: '',
      correctionDate: '',
      correctionDescription: '',
      correctionReference: '',
      reason: '',
    });
  };

  const customerIssueHeading = useMemo(() => {
    if (!customerIssueTransaction) return '';
    const sourceLabel = getCreditEntrySourceLabel(customerIssueTransaction);
    const typeLabel = getCreditEntryTypeLabel(customerIssueTransaction);
    return `${sourceLabel} · ${typeLabel}`;
  }, [customerIssueTransaction]);

  const handleTransactionOpen = (transaction) => {
    if (isAdminView) {
      openEditModalWithTransaction?.(transaction);
      return;
    }
    openCustomerIssueModal(transaction);
  };

  const openAdminIssueFromEntry = (entryId) => {
    const numericEntryId = Number(entryId || 0);
    if (!isAdminView || !numericEntryId) return;
    const relevantIssues = (Array.isArray(creditIssues) ? creditIssues : []).filter(
      (issue) => Number(issue?.credit_entry_id || 0) === numericEntryId
    );
    if (!relevantIssues.length) return;
    const priority = { open: 4, in_review: 3, rejected: 2, corrected: 1 };
    const sorted = [...relevantIssues].sort((left, right) => {
      const leftStatus = String(left?.status || '').trim().toLowerCase();
      const rightStatus = String(right?.status || '').trim().toLowerCase();
      const leftPriority = Number(priority[leftStatus] || 0);
      const rightPriority = Number(priority[rightStatus] || 0);
      if (rightPriority !== leftPriority) return rightPriority - leftPriority;
      const leftTs = new Date(left?.updated_at || left?.created_at || 0).getTime() || 0;
      const rightTs = new Date(right?.updated_at || right?.created_at || 0).getTime() || 0;
      return rightTs - leftTs;
    });
    const targetIssueId = Number(sorted[0]?.id || 0);
    if (!targetIssueId) return;
    setActiveAdminIssueId?.(targetIssueId);
  };

  const activeAdminIssue = isAdminView
    ? (Array.isArray(creditIssues) ? creditIssues : []).find(
        (issue) => Number(issue?.id || 0) === Number(activeAdminIssueId || 0)
      ) || null
    : null;
  const adminDraft = activeAdminIssue ? getAdminIssueDraft?.(activeAdminIssue) || {} : {};

  const submitCustomerIssue = async (event) => {
    event.preventDefault();
    if (!customerIssueTransaction) return;
    const ok = await handleCustomerTransactionIssue?.({
      transaction: customerIssueTransaction,
      draft: customerIssueDraft,
    });
    if (ok) closeCustomerIssueModal();
  };

  const renderDesktopTransactions = () => (
    <table className="credit-table">
      <thead>
        <tr>
          <th>Type</th>
          <th>Debit</th>
          <th>Credit</th>
          <th>Balance</th>
          <th>Ref</th>
        </tr>
      </thead>
      <tbody>
        {groupedTransactions.map((group) => (
          <Fragment key={group.dateKey}>
            <tr className="credit-day-divider-row">
              <td colSpan="5">
                <div className="credit-day-divider">
                  <span className="credit-day-title" title={group.dateLabelLong}>
                    {group.dateLabel}
                  </span>
                </div>
              </td>
            </tr>
            {group.transactions.map((transaction) => {
              const sourceLabel = getCreditEntrySourceLabel(transaction);
              const entryTypeLabel = getCreditEntryTypeLabel(transaction);
              const description = getCreditEntryDescription(transaction);
              const delta = getCreditEntryDelta(transaction);
              const debitAmount = delta >= 0 ? formatCurrency(Math.abs(delta)) : '-';
              const creditAmount = delta < 0 ? formatCurrency(Math.abs(delta)) : '-';
              const balanceMeta = getCreditBalanceMeta(transaction.balance);
              const issueFlag = issueFlagByEntryId.get(Number(transaction.id || 0)) || null;
              const canShareTransaction = isAdminView && isTransactionWithinFiveDays(transaction);

              return (
                <tr
                  key={transaction.id}
                  data-credit-entry-id={Number(transaction.id || 0) || undefined}
                  className={issueFlag ? `credit-row-issue ${issueFlag.tone}` : ''}
                  onClick={() => handleTransactionOpen(transaction)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleTransactionOpen(transaction);
                    }
                  }}
                >
                  <td>
                    <span>{entryTypeLabel}</span>
                  </td>
                  <td className="debit-amount">{debitAmount}</td>
                  <td className="credit-amount">{creditAmount}</td>
                  <td>
                    <span className={`balance-pill ${balanceMeta.tone}`}>
                      {balanceMeta.label} {formatCurrency(Math.abs(Number(transaction.balance || 0)))}
                    </span>
                    <div className="balance-description-line">{description}</div>
                    {canShareTransaction ? (
                      <button
                        type="button"
                        className="action-icon whatsapp"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleSendTransactionWhatsApp(transaction);
                        }}
                        title="Share on WhatsApp"
                        aria-label="Share on WhatsApp"
                      >
                        <MessageCircle size={14} />
                      </button>
                    ) : null}
                    {issueFlag ? (
                      <button
                        type="button"
                        className={`entry-issue-pill ${issueFlag.tone}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          openAdminIssueFromEntry(transaction.id);
                        }}
                      >
                        {issueFlag.label}
                      </button>
                    ) : null}
                  </td>
                  <td className="invoice-number">{sourceLabel}</td>
                </tr>
              );
            })}
          </Fragment>
        ))}
      </tbody>
    </table>
  );

  const renderMobileTransactions = () => (
    <div className="credit-mobile-list">
      {groupedTransactions.map((group) => (
        <section key={group.dateKey} className="credit-day-group">
          <h3 className="credit-day-title">{group.dateLabel}</h3>
          <div className="credit-tile-stack">
            {group.transactions.map((transaction) => {
              const description = getCreditEntryDescription(transaction);
              const sourceLabel = getCreditEntrySourceLabel(transaction);
              const entryTypeLabel = getCreditEntryTypeLabel(transaction);
              const delta = getCreditEntryDelta(transaction);
              const balanceMeta = getCreditBalanceMeta(transaction.balance);
              const canShareTransaction = isAdminView && isTransactionWithinFiveDays(transaction);
              const isExpanded = expandedTransactionId === transaction.id;
              const issueFlag = issueFlagByEntryId.get(Number(transaction.id || 0)) || null;
              const debitAmount = delta >= 0 ? formatCurrency(Math.abs(delta)) : '-';
              const creditAmount = delta < 0 ? formatCurrency(Math.abs(delta)) : '-';

              return (
                <article
                  key={`mobile-${transaction.id}`}
                  data-credit-entry-id={Number(transaction.id || 0) || undefined}
                  className={`credit-transaction-tile ${delta < 0 ? 'payment' : 'given'}${issueFlag ? ` has-issue ${issueFlag.tone}` : ''}`}
                  onClick={() => handleTransactionOpen(transaction)}
                >
                  <header className="tile-top-row">
                    <span className="tile-type-wrap">
                      <span className={`tile-type-pill ${delta < 0 ? 'payment' : 'given'}`}>
                        {entryTypeLabel}
                      </span>
                      {issueFlag ? (
                        <button
                          type="button"
                          className={`entry-issue-pill ${issueFlag.tone}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            openAdminIssueFromEntry(transaction.id);
                          }}
                        >
                          {issueFlag.label}
                        </button>
                      ) : null}
                    </span>
                    <span className={`tile-amount ${delta < 0 ? 'credit-amount' : 'debit-amount'}`}>
                      {delta >= 0 ? `Debit ${debitAmount}` : `Credit ${creditAmount}`}
                    </span>
                  </header>

                  <div className="tile-meta-row">
                    <span>Ref: {sourceLabel}</span>
                  </div>

                  <div className="tile-description">
                    {truncateCreditDescription(description || 'No description', 44)}
                  </div>

                  <div className="tile-footer-row">
                    <span className={`tile-balance-pill ${balanceMeta.tone}`}>
                      {balanceMeta.label}: {formatCurrency(Math.abs(Number(transaction.balance || 0)))}
                    </span>
                    <div className="tile-footer-actions">
                      {canShareTransaction ? (
                        <button
                          type="button"
                          className="action-icon whatsapp"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleSendTransactionWhatsApp(transaction);
                          }}
                          title="Share on WhatsApp"
                          aria-label="Share on WhatsApp"
                        >
                          <MessageCircle size={14} />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="tile-expand-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpandedTransactionId(isExpanded ? null : transaction.id);
                        }}
                      >
                        {isExpanded ? 'Less' : 'More'}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="tile-expanded">
                      <div className="tile-detail">
                        <strong>Ref:</strong> {sourceLabel}
                      </div>
                      <div className="tile-detail">
                        <strong>Type:</strong> {entryTypeLabel}
                      </div>
                      <div className="tile-detail">
                        <strong>Debit:</strong> {debitAmount}
                      </div>
                      <div className="tile-detail">
                        <strong>Credit:</strong> {creditAmount}
                      </div>
                      <div className="tile-detail">
                        <strong>Date:</strong> {formatTransactionDate(transaction, { long: true })}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );

  return (
    <div className="credit-table-container">
      {filteredTransactions.length === 0 ? (
        <div className="empty-state">
          {creditHistory.length === 0 ? (
            <>
              <p>No ledger entries yet{isAdminView ? ' for this customer.' : '.'}</p>
              {isAdminView && (
                <p>
                  Use &quot;Add Manual Sale&quot; when a customer purchase is added to due, or
                  &quot;Add Payment&quot; when money is received.
                </p>
              )}
            </>
          ) : (
            <>
              <p>
                {hasFiltersApplied
                  ? 'No current ledger entries match current filters.'
                  : 'All older entries are superseded by finalized corrections.'}
              </p>
              {hasFiltersApplied && (
                <p>Switch filters to &quot;All&quot; to view the full ledger.</p>
              )}
            </>
          )}
        </div>
      ) : (
        isMobile ? renderMobileTransactions() : renderDesktopTransactions()
      )}

      {historyHasMore && (
        <div className="credit-history-pagination">
          <p>Showing recent entries. Load older entries for a full ledger view.</p>
          <button
            type="button"
            className="report-btn secondary-action"
            onClick={loadMoreHistory}
            disabled={historyLoadingMore || historyLoadingFull}
          >
            {historyLoadingMore ? 'Loading...' : 'Load older entries'}
          </button>
        </div>
      )}

      {!isAdminView && (
        <div className="report-box">
          <div className="report-header">
            <strong>Report Credit Entry Issue</strong>
          </div>
          <form className="credit-issue-form" onSubmit={handleReportIssue}>
            <label>
              Entry
              <select
                id="credit-issue-entry"
                name="credit_entry_id"
                value={issueForm.credit_entry_id}
                onChange={(event) =>
                  setIssueForm((prev) => ({ ...prev, credit_entry_id: event.target.value }))
                }
              >
                <option value="">Select (optional)</option>
                {filteredTransactions.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    #{entry.id} | {getCreditEntryTypeLabel(entry)} |{' '}
                    {formatCurrency(entry.amount || 0)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Issue Type
              <select
                id="credit-issue-type"
                name="issue_type"
                value={issueForm.issue_type}
                onChange={(event) =>
                  setIssueForm((prev) => ({ ...prev, issue_type: event.target.value }))
                }
              >
                <option value="wrong_entry">Wrong Entry</option>
                <option value="missing_entry">Missing Entry</option>
                <option value="wrong_amount">Wrong Amount</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Message
              <textarea
                id="credit-issue-message"
                name="issue_message"
                value={issueForm.message}
                onChange={(event) =>
                  setIssueForm((prev) => ({ ...prev, message: event.target.value }))
                }
                placeholder="Explain what is wrong so admin can correct it."
                rows={3}
                required
              />
            </label>
            <button type="submit" className="report-btn primary-action" disabled={issueSubmitting}>
              {issueSubmitting ? 'Submitting...' : 'Submit Issue'}
            </button>
          </form>
          {creditIssues.length > 0 && (
            <div className="credit-issues-list">
              {creditIssues.map((issue) => (
                <div key={issue.id} className="credit-issue-row">
                  <div>
                    <strong>#{issue.id}</strong> {issue.issue_type}
                  </div>
                  <div>{issue.message}</div>
                  <div className={`status-chip ${issue.status}`}>{issue.status}</div>
                  {issue.admin_reason || issue.resolution_note ? (
                    <div>
                      <strong>Admin reason:</strong> {issue.admin_reason || issue.resolution_note}
                    </div>
                  ) : null}
                  {issue.correction_entry_id ? (
                    <div>
                      <strong>Correction entry:</strong> #{issue.correction_entry_id}
                    </div>
                  ) : null}
                  {issue.customer_response_status ? (
                    <div>
                      <strong>Your response:</strong> {issue.customer_response_status}
                    </div>
                  ) : null}
                  {(issue.status === 'corrected' || issue.status === 'rejected') &&
                  !issue.customer_response_status ? (
                    <div className="credit-issue-response">
                      <textarea
                        id={`credit-issue-response-${issue.id}`}
                        name={`credit_issue_response_${issue.id}`}
                        value={issueResponseDrafts[issue.id] || ''}
                        onChange={(event) =>
                          setIssueResponseDrafts((prev) => ({
                            ...prev,
                            [issue.id]: event.target.value,
                          }))
                        }
                        placeholder="Optional note. Required if you still disagree."
                        rows={2}
                      />
                      <div className="credit-issue-response-actions">
                        <button
                          type="button"
                          className="report-btn secondary-action"
                          onClick={() => handleIssueResponse(issue, 'acknowledged')}
                          disabled={issueRespondingId === Number(issue.id)}
                        >
                          {issueRespondingId === Number(issue.id) ? 'Saving...' : 'Acknowledge'}
                        </button>
                        <button
                          type="button"
                          className="report-btn primary-action"
                          onClick={() => handleIssueResponse(issue, 'disputed')}
                          disabled={issueRespondingId === Number(issue.id)}
                        >
                          {issueRespondingId === Number(issue.id) ? 'Saving...' : 'Still Incorrect'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!isAdminView && customerIssueTransaction ? (
        <div className="modal-overlay">
          <div className="modal-content credit-entry-modal credit-issue-popup fade-in-up">
            <div className="modal-header">
              <h2>Register Transaction Issue</h2>
              <button type="button" className="close-btn" onClick={closeCustomerIssueModal}>
                ×
              </button>
            </div>
            <form className="credit-issue-form credit-issue-popup-form" onSubmit={submitCustomerIssue}>
              <p className="credit-ledger-note credit-issue-popup-note">
                Editing here will not change the ledger. It creates an issue request for admin
                review.
              </p>
              <label>
                Entry
                <input type="text" value={customerIssueHeading} readOnly />
              </label>
              <div className="credit-issue-popup-grid">
                <label>
                  Proposed Type
                  <select
                    value={customerIssueDraft.correctionType}
                    onChange={(event) =>
                      setCustomerIssueDraft((prev) => ({
                        ...prev,
                        correctionType: event.target.value,
                      }))
                    }
                  >
                    <option value="given">Charge</option>
                    <option value="payment">Payment</option>
                  </select>
                </label>
                <label>
                  Proposed Amount
                  <input
                    type="text"
                    value={customerIssueDraft.correctionAmount}
                    onChange={(event) =>
                      setCustomerIssueDraft((prev) => ({
                        ...prev,
                        correctionAmount: event.target.value,
                      }))
                    }
                    placeholder="Amount"
                  />
                </label>
                <label>
                  Proposed Date
                  <input
                    type="date"
                    value={customerIssueDraft.correctionDate}
                    onChange={(event) =>
                      setCustomerIssueDraft((prev) => ({
                        ...prev,
                        correctionDate: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Proposed Reference
                  <input
                    type="text"
                    value={customerIssueDraft.correctionReference}
                    onChange={(event) =>
                      setCustomerIssueDraft((prev) => ({
                        ...prev,
                        correctionReference: event.target.value,
                      }))
                    }
                    placeholder="Reference"
                  />
                </label>
              </div>
              <label>
                Proposed Description
                <input
                  type="text"
                  value={customerIssueDraft.correctionDescription}
                  onChange={(event) =>
                    setCustomerIssueDraft((prev) => ({
                      ...prev,
                      correctionDescription: event.target.value,
                    }))
                  }
                  placeholder="Description"
                />
              </label>
              <label>
                Why should this be corrected?
                <textarea
                  value={customerIssueDraft.reason}
                  onChange={(event) =>
                    setCustomerIssueDraft((prev) => ({
                      ...prev,
                      reason: event.target.value,
                    }))
                  }
                  rows={3}
                  required
                  placeholder="Tell admin what is incorrect and what should be fixed."
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={closeCustomerIssueModal}>
                  Cancel
                </button>
                <button type="submit" className="submit-btn">
                  Submit Issue
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isAdminView && activeAdminIssue ? (
        <div className="modal-overlay">
          <div className="modal-content credit-entry-modal credit-issue-popup fade-in-up">
            <div className="modal-header">
              <h2>Resolve Issue #{Number(activeAdminIssue.id || 0)}</h2>
              <button
                type="button"
                className="close-btn"
                onClick={() => setActiveAdminIssueId?.(0)}
              >
                ×
              </button>
            </div>
            <form className="credit-issue-form credit-issue-popup-form" onSubmit={(event) => event.preventDefault()}>
              <div className="credit-issue-row credit-issue-popup-note">
                <div>
                  <strong>Entry:</strong> #{Number(activeAdminIssue.credit_entry_id || 0) || '-'}
                </div>
                <div>
                  <strong>Status:</strong> {String(activeAdminIssue.status || 'open')}
                </div>
                <div>{String(activeAdminIssue.message || '').trim()}</div>
              </div>
              <label>
                Resolution Reason (required for reject)
                <textarea
                  value={adminDraft.admin_reason || ''}
                  onChange={(event) =>
                    setAdminIssueDraft?.(Number(activeAdminIssue.id || 0), {
                      admin_reason: event.target.value,
                    })
                  }
                  rows={2}
                  placeholder="Reason shown to customer"
                />
              </label>
              <div className="credit-issue-popup-grid">
                <label>
                  Correction Type
                  <select
                    value={adminDraft.correction_type || ''}
                    onChange={(event) =>
                      setAdminIssueDraft?.(Number(activeAdminIssue.id || 0), {
                        correction_type: event.target.value,
                      })
                    }
                  >
                    <option value="">None</option>
                    <option value="given">Credit</option>
                    <option value="payment">Payment</option>
                  </select>
                </label>
                <label>
                  Correction Amount
                  <CalculatedAmountInput
                    value={adminDraft.correction_amount || ''}
                    onValueChange={(nextValue) =>
                      setAdminIssueDraft?.(Number(activeAdminIssue.id || 0), {
                        correction_amount: nextValue,
                      })
                    }
                    placeholder="0 or expression"
                  />
                </label>
              </div>
              <label>
                Correction Description
                <input
                  type="text"
                  value={adminDraft.correction_description || ''}
                  onChange={(event) =>
                    setAdminIssueDraft?.(Number(activeAdminIssue.id || 0), {
                      correction_description: event.target.value,
                    })
                  }
                  placeholder="Optional"
                />
              </label>
              <label>
                Correction Reference
                <input
                  type="text"
                  value={adminDraft.correction_reference || ''}
                  onChange={(event) =>
                    setAdminIssueDraft?.(Number(activeAdminIssue.id || 0), {
                      correction_reference: event.target.value,
                    })
                  }
                  placeholder="Optional"
                />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => setActiveAdminIssueId?.(0)}
                  disabled={adminIssueSavingId === Number(activeAdminIssue.id || 0)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="submit-btn"
                  onClick={() => handleAdminIssueAction?.(activeAdminIssue, 'resolved')}
                  disabled={adminIssueSavingId === Number(activeAdminIssue.id || 0)}
                >
                  {adminIssueSavingId === Number(activeAdminIssue.id || 0)
                    ? 'Submitting...'
                    : 'Close Issue'}
                </button>
                <button
                  type="button"
                  className="submit-btn given"
                  onClick={() => handleAdminIssueAction?.(activeAdminIssue, 'corrected')}
                  disabled={adminIssueSavingId === Number(activeAdminIssue.id || 0)}
                >
                  {adminIssueSavingId === Number(activeAdminIssue.id || 0)
                    ? 'Submitting...'
                    : 'Submit Correction'}
                </button>
                <button
                  type="button"
                  className="submit-btn payment"
                  onClick={() => handleAdminIssueAction?.(activeAdminIssue, 'rejected')}
                  disabled={adminIssueSavingId === Number(activeAdminIssue.id || 0)}
                >
                  {adminIssueSavingId === Number(activeAdminIssue.id || 0)
                    ? 'Submitting...'
                    : 'Reject (with reason)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default CreditTransactionsSection;
