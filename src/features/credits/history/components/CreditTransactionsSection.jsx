import { Fragment } from 'react';
import { FileText, Eye, Printer, MessageCircle, RotateCcw } from 'lucide-react';
import { resolveMediaUrl } from '../../../../shared/services/api/core';
import { formatCurrency } from '../../../../shared/utils/formatters';
import {
  canReverseCreditEntry,
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
  handlePrintInvoice,
  handleSendTransactionWhatsApp,
  handleDeleteTransaction,
  deletingEntryId,
  issueForm,
  handleReportIssue,
  issueSubmitting,
  creditIssues,
  issueResponseDrafts,
  setIssueResponseDrafts,
  handleIssueResponse,
  issueRespondingId,
  fromDate,
  toDate,
  setFromDate,
  setToDate,
  handleGenerateReport,
}) {
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
              <p>No entries match current filters.</p>
              {hasFiltersApplied && (
                <p>Switch filters to &quot;All&quot; to view the full ledger.</p>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <table className="credit-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Type</th>
                <th>Debit</th>
                <th>Credit</th>
                <th>Balance</th>
                <th>Description</th>
                <th className="credit-col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {groupedTransactions.map((group) => (
                <Fragment key={group.dateKey}>
                  <tr className="credit-day-divider-row">
                    <td colSpan="7">
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
                    const canShareTransaction =
                      isAdminView && isTransactionWithinFiveDays(transaction);
                    const canReverse = isAdminView && canReverseCreditEntry(transaction);
                    const issueFlag = issueFlagByEntryId.get(Number(transaction.id || 0)) || null;

                    return (
                      <tr
                        key={transaction.id}
                        data-credit-entry-id={Number(transaction.id || 0) || undefined}
                        className={issueFlag ? `credit-row-issue ${issueFlag.tone}` : ''}
                      >
                        <td className="invoice-number">{sourceLabel}</td>
                        <td>
                          <span>{entryTypeLabel}</span>
                        </td>
                        <td className="debit-amount">{debitAmount}</td>
                        <td className="credit-amount">{creditAmount}</td>
                        <td>
                          <span className={`balance-pill ${balanceMeta.tone}`}>
                            {balanceMeta.label}{' '}
                            {formatCurrency(Math.abs(Number(transaction.balance || 0)))}
                          </span>
                        </td>
                        <td>
                          {description}
                          {issueFlag ? (
                            <span className={`entry-issue-pill ${issueFlag.tone}`}>
                              {issueFlag.label}
                            </span>
                          ) : null}
                        </td>
                        <td className="actions-cell">
                          {!isAdminView && (
                            <button
                              className="action-icon"
                              onClick={() =>
                                setIssueForm((prev) => ({
                                  ...prev,
                                  credit_entry_id: String(transaction.id || ''),
                                }))
                              }
                              title="Report issue on this entry"
                            >
                              <FileText size={16} />
                            </button>
                          )}
                          {transaction.image_path && (
                            <a
                              href={resolveMediaUrl(transaction.image_path)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="action-icon view"
                              title="View attachment"
                            >
                              <Eye size={16} />
                            </a>
                          )}
                          <button
                            className="action-icon print mobile-hide-print"
                            onClick={() => handlePrintInvoice(transaction)}
                            title="Print entry"
                            disabled={isMobile}
                            aria-disabled={isMobile}
                          >
                            <Printer size={16} />
                          </button>
                          {canShareTransaction && (
                            <button
                              className="action-icon whatsapp"
                              onClick={() => handleSendTransactionWhatsApp(transaction)}
                              title="Share on WhatsApp"
                            >
                              <MessageCircle size={16} />
                            </button>
                          )}
                          {isAdminView && (
                            <button
                              className="action-icon reverse"
                              onClick={() => handleDeleteTransaction(transaction)}
                              title={canReverse ? 'Reverse entry' : 'Already reversed'}
                              disabled={
                                !canReverse || deletingEntryId === Number(transaction.id || 0)
                              }
                            >
                              <RotateCcw size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>

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
                    const canShareTransaction =
                      isAdminView && isTransactionWithinFiveDays(transaction);
                    const canReverse = isAdminView && canReverseCreditEntry(transaction);
                    const isExpanded = expandedTransactionId === transaction.id;
                    const issueFlag = issueFlagByEntryId.get(Number(transaction.id || 0)) || null;
                    const debitAmount = delta >= 0 ? formatCurrency(Math.abs(delta)) : '-';
                    const creditAmount = delta < 0 ? formatCurrency(Math.abs(delta)) : '-';

                    return (
                      <article
                        key={`mobile-${transaction.id}`}
                        data-credit-entry-id={Number(transaction.id || 0) || undefined}
                        className={`credit-transaction-tile ${delta < 0 ? 'payment' : 'given'}${issueFlag ? ` has-issue ${issueFlag.tone}` : ''}`}
                      >
                        <header className="tile-top-row">
                          <span className="tile-type-wrap">
                            <span className={`tile-type-pill ${delta < 0 ? 'payment' : 'given'}`}>
                              {entryTypeLabel}
                            </span>
                            {issueFlag ? (
                              <span className={`entry-issue-pill ${issueFlag.tone}`}>
                                {issueFlag.label}
                              </span>
                            ) : null}
                          </span>
                          <span
                            className={`tile-amount ${delta < 0 ? 'credit-amount' : 'debit-amount'}`}
                          >
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
                            {balanceMeta.label}:{' '}
                            {formatCurrency(Math.abs(Number(transaction.balance || 0)))}
                          </span>
                          <button
                            type="button"
                            className="tile-expand-btn"
                            onClick={() =>
                              setExpandedTransactionId(isExpanded ? null : transaction.id)
                            }
                          >
                            {isExpanded ? 'Less' : 'More'}
                          </button>
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
                              <strong>Date:</strong>{' '}
                              {formatTransactionDate(transaction, { long: true })}
                            </div>
                            <div className="tile-actions">
                              {!isAdminView && (
                                <button
                                  className="action-icon"
                                  onClick={() =>
                                    setIssueForm((prev) => ({
                                      ...prev,
                                      credit_entry_id: String(transaction.id || ''),
                                    }))
                                  }
                                  title="Report issue on this entry"
                                >
                                  <FileText size={16} />
                                </button>
                              )}
                              {transaction.image_path && (
                                <a
                                  href={resolveMediaUrl(transaction.image_path)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="action-icon view"
                                  title="View attachment"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <Eye size={16} />
                                </a>
                              )}
                              <button
                                className="action-icon print mobile-hide-print"
                                onClick={() => handlePrintInvoice(transaction)}
                                title="Print entry"
                                disabled={isMobile}
                                aria-disabled={isMobile}
                              >
                                <Printer size={16} />
                              </button>
                              {canShareTransaction && (
                                <button
                                  className="action-icon whatsapp"
                                  onClick={() => handleSendTransactionWhatsApp(transaction)}
                                  title="Share on WhatsApp"
                                >
                                  <MessageCircle size={16} />
                                </button>
                              )}
                              {isAdminView && (
                                <button
                                  className="action-icon reverse"
                                  onClick={() => handleDeleteTransaction(transaction)}
                                  title={canReverse ? 'Reverse entry' : 'Already reversed'}
                                  disabled={
                                    !canReverse || deletingEntryId === Number(transaction.id || 0)
                                  }
                                >
                                  <RotateCcw size={16} />
                                </button>
                              )}
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
        </>
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
                {creditHistory.map((entry) => (
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

      {isAdminView && (
        <div className="report-box">
          <div className="report-header">
            <strong>Generate Credit Report</strong>
          </div>
          <div className="report-controls">
            <label>
              From
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
              />
            </label>
            <button className="report-btn primary-action" onClick={handleGenerateReport}>
              Generate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CreditTransactionsSection;
